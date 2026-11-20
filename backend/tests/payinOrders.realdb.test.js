// Phase 2c, the Payin tab, against a real (in-memory) MongoDB: the orders table with totals and
// filters, and the support actions (resend callback, update amount, update UTR, fail order).

process.env.CREDENTIAL_ENC_KEY = "c".repeat(64);

jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());

const http = require("http");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const db = require("./helpers/realDb");
const app = require("../app");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const CallbackDelivery = require("../models/CallbackDelivery");
const Order = require("../models/Order");
const BankCredit = require("../models/BankCredit");
const orderService = require("../services/orderService");
const { claimPayment, CLAIM } = require("../services/claimService");
const { issueCredential } = require("../services/credentialService");
const { computeFee } = require("../utils/fees");
const { adminToken, userToken } = require("./helpers/merchantFlow");
const { setupMerchantWithBank, makeOrderOn, makeCredit, nextUtr } = require("./helpers/realFixtures");

jest.setTimeout(60000);

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

let receiver, port, respondWith, received;
beforeAll(async () => {
    receiver = http.createServer((req, res) => {
        let data = "";
        req.on("data", (c) => { data += c; });
        req.on("end", () => { received.push(JSON.parse(data)); res.statusCode = respondWith; res.end(); });
    });
    await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
    port = receiver.address().port;
});
afterAll(() => new Promise((r) => receiver.close(r)));
beforeEach(() => { respondWith = 200; received = []; });

const asAdmin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);
const asAgent = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${userToken()}`);

// A merchant with a 2.50% pay-in rate, a key, a callback URL and a bank.
const setup = async ({ callbackUrl = true, autoTrigger = true } = {}) => {
    const { merchant, bank } = await setupMerchantWithBank();
    merchant.config = {
        ...merchant.config.toObject(),
        payinBps: 250,
        webhookAutoTrigger: autoTrigger,
        callbackUrl: callbackUrl ? `http://127.0.0.1:${port}/hook` : null
    };
    await merchant.save();
    await issueCredential({ merchant, environment: "sandbox", createdBy: null });
    return { merchant, bank };
};

// An order on the merchant's bank with the rate stored, optionally already successful.
const makeOrder = async (merchant, bank, { status = "pending", amountPaise = 50000, ...rest } = {}) => {
    const fields = { payinBps: 250, amountPaise, ...rest };
    if (status === "success") {
        Object.assign(fields, { status, utr: rest.utr || nextUtr(), paidAt: new Date(), ...computeFee(amountPaise, 250) });
    } else if (status !== "pending") {
        fields.status = status;
    }
    return makeOrderOn(merchant, bank, fields);
};

describe("the fee on an order", () => {
    it("stores the merchant's rate when the order is created, and later rate edits do not change it", async () => {
        const { merchant } = await setup();
        await makeCredit((await require("../models/BankAccount").findOne()), 100000);

        const { order } = await orderService.createOrder(merchant, "sandbox", { amountPaise: 100000 });
        expect(order.payinBps).toBe(250);

        merchant.config = { ...merchant.config.toObject(), payinBps: 900 };
        await merchant.save();
        expect((await Order.findById(order._id)).payinBps).toBe(250);
    });

    it("works out the fee and payable when the payment is claimed", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { amountPaise: 99999 });
        const credit = await makeCredit(bank, 99999);

        const claim = await claimPayment(order, credit.utr);
        expect(claim.result).toBe(CLAIM.SUCCESS);
        // 99999 x 2.50% = 2499.975, rounded to the nearest paisa
        expect(claim.order.feePaise).toBe(2500);
        expect(claim.order.payablePaise).toBe(97499);
    });

    it("leaves fee and payable empty on an order that has no stored rate", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrderOn(merchant, bank, { amountPaise: 50000 });
        const credit = await makeCredit(bank, 50000);

        const claim = await claimPayment(order, credit.utr);
        expect(claim.order.feePaise).toBeNull();
        expect(claim.order.payablePaise).toBeNull();
    });
});

describe("GET /api/payin/dashboard", () => {
    const Merchant = require("../models/Merchant");
    const cardsOf = async (query = "") => (await asAdmin("get", `/api/payin/dashboard${query}`)).body;

    it("adds up successful orders and keeps total = charges + unsettled + to be settled + settled", async () => {
        const { merchant, bank } = await setup();
        await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });
        await makeOrder(merchant, bank, { status: "success", amountPaise: 99999 });
        await makeOrder(merchant, bank, { status: "pending", amountPaise: 70000 });
        await makeOrder(merchant, bank, { status: "failed", amountPaise: 80000 });
        // from before rates were stored: fee 0, payable = amount
        await makeOrderOn(merchant, bank, { status: "success", utr: nextUtr(), paidAt: new Date(), amountPaise: 10000 });

        const body = await cardsOf();
        const c = body.cards;
        expect(body.successCount).toBe(3);
        expect(c.totalPayinPaise).toBe(50000 + 99999 + 10000);
        expect(c.payinChargesPaise).toBe(1250 + 2500);
        expect(c.unsettledPaise).toBe(48750 + 97499 + 10000);
        expect(c.totalPayinPaise).toBe(c.payinChargesPaise + c.unsettledPaise + c.toBeSettledPaise + c.settledPaise);
        expect([c.settledPaise, c.loadBalancePaise, c.availablePaise, c.payoutPaise, c.payoutChargesPaise]).toEqual([0, 0, 0, 0, 0]);
        expect(body.merchant).toBeNull();
    });

    it("scopes to one merchant and returns its rates", async () => {
        const one = await setup();
        await makeOrder(one.merchant, one.bank, { status: "success", amountPaise: 50000 });
        const other = await require("./helpers/realFixtures").makeMerchant({ mid: "mid_otherother01" });
        await makeOrder(other, one.bank, { status: "success", amountPaise: 20000 });

        expect((await cardsOf()).cards.totalPayinPaise).toBe(70000);
        const body = await cardsOf(`?merchant=${one.merchant.mid}`);
        expect(body.cards.totalPayinPaise).toBe(50000);
        expect(body.merchant).toMatchObject({ mid: one.merchant.mid, mode: "sandbox", payinBps: 250 });
    });

    it("stops counting sandbox orders once the merchant is in production", async () => {
        const { merchant, bank } = await setup();
        await makeOrder(merchant, bank, { status: "success" });
        await Merchant.updateOne({ _id: merchant._id }, { $set: { mode: "production" } });

        expect((await cardsOf()).cards.totalPayinPaise).toBe(0);
        expect((await cardsOf(`?merchant=${merchant.mid}`)).cards.totalPayinPaise).toBe(0);
    });

    it("is zero with no orders, 404 for an unknown or malformed merchant, open to agents, closed to merchants", async () => {
        expect((await cardsOf()).cards.totalPayinPaise).toBe(0);
        expect((await asAdmin("get", "/api/payin/dashboard?merchant=mid_doesnotexist")).statusCode).toBe(404);
        expect((await asAdmin("get", "/api/payin/dashboard?merchant=nope")).statusCode).toBe(400);
        expect((await asAgent("get", "/api/payin/dashboard")).statusCode).toBe(200);
        expect((await request(app).get("/api/payin/dashboard")).statusCode).toBe(401);
    });
});

describe("GET /api/payin/orders", () => {
    it("lists orders with the merchant, bank details and the latest callback", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });
        await require("../services/callbackService").enqueueOrderCallback(order);

        const res = await asAdmin("get", "/api/payin/orders");
        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
            orderId: order.orderId, status: "success", amountPaise: 50000, feePaise: 1250, payablePaise: 48750,
            utr: order.utr, merchant: { mid: merchant.mid, businessName: "Acme Traders" },
            bank: { bankId: bank.bankId, holderName: "Acme Traders", accountNumber: bank.accountNumber, ifsc: "TEST0000001" },
            callback: { event: "order.success", status: "pending" }
        });
    });

    it("sums totals over every matching order, not just the page", async () => {
        const { merchant, bank } = await setup();
        await makeOrder(merchant, bank, { status: "success", amountPaise: 100000 });
        await makeOrder(merchant, bank, { status: "success", amountPaise: 20000 });
        await makeOrder(merchant, bank, { status: "pending", amountPaise: 30000 });
        await makeOrder(merchant, bank, { status: "failed", amountPaise: 40000 });

        const res = await asAdmin("get", "/api/payin/orders?limit=1");
        expect(res.body.data).toHaveLength(1);
        expect(res.body.total).toBe(4);
        expect(res.body.totals).toEqual({
            count: 4,
            amountPaise: 190000,
            refundedPaise: 0,
            // fee and payable only count successful orders: 2500 + 500 and 97500 + 19500
            feePaise: 3000,
            payablePaise: 117000,
            byStatus: {
                success: { count: 2, amountPaise: 120000 },
                pending: { count: 1, amountPaise: 30000 },
                failed: { count: 1, amountPaise: 40000 },
                refunded: { count: 0, amountPaise: 0 }
            }
        });

        const failed = await asAdmin("get", "/api/payin/orders?status=failed");
        expect(failed.body.totals).toMatchObject({ count: 1, amountPaise: 40000, feePaise: 0, payablePaise: 0 });
    });

    it("filters by search (order id, merchant order id, UTR), merchant, bank, mode and date", async () => {
        const a = await setup();
        const b = await setup();
        const first = await makeOrder(a.merchant, a.bank, { status: "success", merchantOrderId: "INV-1" });
        await makeOrder(b.merchant, b.bank, { status: "pending" });
        const count = async (qs) => (await asAdmin("get", `/api/payin/orders?${qs}`)).body.total;

        expect(await count("")).toBe(2);
        expect(await count(`search=${first.orderId}`)).toBe(1);
        expect(await count("search=INV-1")).toBe(1);
        expect(await count(`search=${first.utr}`)).toBe(1);
        expect(await count("search=nothing")).toBe(0);
        expect(await count(`merchant=${a.merchant.mid}`)).toBe(1);
        expect(await count("merchant=acme")).toBe(2);
        expect(await count("merchant=no-such-merchant")).toBe(0);
        expect(await count(`bank=${b.bank.bankId}`)).toBe(1);
        expect(await count("bank=bank_unknown")).toBe(0);
        expect(await count("mode=sandbox")).toBe(2);
        expect(await count("mode=production")).toBe(0);

        const day = 24 * 60 * 60 * 1000;
        const iso = (offset) => encodeURIComponent(new Date(Date.now() + offset).toISOString());
        expect(await count(`from=${iso(-day)}&to=${iso(day)}`)).toBe(2);
        expect(await count(`from=${iso(day)}`)).toBe(0);
        expect((await asAdmin("get", `/api/payin/orders?from=${iso(day)}&to=${iso(-day)}`)).statusCode).toBe(400);
    });

    it("pages the table newest first, and rejects a bad filter", async () => {
        const { merchant, bank } = await setup();
        for (let i = 0; i < 3; i++) await makeOrder(merchant, bank);

        const p1 = await asAdmin("get", "/api/payin/orders?limit=2&page=1");
        const p2 = await asAdmin("get", "/api/payin/orders?limit=2&page=2");
        expect(p1.body.data).toHaveLength(2);
        expect(p2.body.data).toHaveLength(1);
        expect(p1.body.data[0].orderId).not.toBe(p2.body.data[0].orderId);
        expect((await asAdmin("get", "/api/payin/orders?status=nope")).statusCode).toBe(400);
    });

    it("is open to admins and agents, closed to merchants and anonymous callers", async () => {
        const { merchant } = await setup();
        const member = await User.create({
            email: "owner@acme.example", password: "x".repeat(20), role: "merchant", merchantId: merchant._id, merchantRole: "owner"
        });
        const merchantToken = jwt.sign({ id: String(member._id), email: member.email, role: "merchant" }, process.env.SECRET, { expiresIn: "15m" });

        expect((await asAdmin("get", "/api/payin/orders")).statusCode).toBe(200);
        expect((await asAgent("get", "/api/payin/orders")).statusCode).toBe(200);
        expect((await request(app).get("/api/payin/orders").set("Authorization", `Bearer ${merchantToken}`)).statusCode).toBe(403);
        expect((await request(app).get("/api/payin/orders")).statusCode).toBe(401);
    });
});

describe("POST /api/payin/orders/:orderId/resend-callback", () => {
    it("sends the current result now, even when auto-trigger is off, and the toast data comes back", async () => {
        const { merchant, bank } = await setup({ autoTrigger: false });
        const order = await makeOrder(merchant, bank, { status: "success" });
        expect(await CallbackDelivery.countDocuments()).toBe(0);

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/resend-callback`);
        expect(res.statusCode).toBe(200);
        expect(res.body.callback).toMatchObject({ event: "order.success", status: "delivered", statusCode: 200 });
        expect(received).toHaveLength(1);
        expect(received[0].data).toMatchObject({ orderId: order.orderId, status: "success", amountPaise: 50000 });
    });

    it("sends the corrected amount, not the old one", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });
        await require("../services/callbackService").enqueueOrderCallback(order);
        await require("../services/callbackService").processDueCallbacks();
        received.length = 0;

        await asAdmin("patch", `/api/payin/orders/${order.orderId}/amount`).send({ amountPaise: 60000, reason: "customer paid 600" });
        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/resend-callback`);
        expect(res.body.callback.status).toBe("delivered");
        expect(received[0].data.amountPaise).toBe(60000);
        expect(await CallbackDelivery.countDocuments()).toBe(1); // the same row, started over
    });

    it("reports the receiver's failure so the toast can show it", async () => {
        respondWith = 500;
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/resend-callback`);
        expect(res.statusCode).toBe(200);
        expect(res.body.callback).toMatchObject({ status: "pending", statusCode: 500, attempts: 1 });
    });

    it("refuses a pending order, a merchant without a callback URL, and an unknown order", async () => {
        const { merchant, bank } = await setup();
        const pending = await makeOrder(merchant, bank);
        const done = await makeOrder(merchant, bank, { status: "success" });

        expect((await asAdmin("post", `/api/payin/orders/${pending.orderId}/resend-callback`)).body.code).toBe("ORDER_PENDING");

        merchant.config = { ...merchant.config.toObject(), callbackUrl: null };
        await merchant.save();
        const none = await asAdmin("post", `/api/payin/orders/${done.orderId}/resend-callback`);
        expect(none.statusCode).toBe(422);
        expect(none.body.code).toBe("NO_CALLBACK_URL");

        expect((await asAdmin("post", "/api/payin/orders/ord_aaaaaaaaaaaaaaaa/resend-callback")).statusCode).toBe(404);
        expect((await asAdmin("post", "/api/payin/orders/bad-id/resend-callback")).statusCode).toBe(400);
    });

    it("will not send an order from the merchant's other mode, or a cancelled callback", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });
        const delivery = await require("../services/callbackService").enqueueOrderCallback(order);

        await CallbackDelivery.updateOne({ _id: delivery._id }, { $set: { status: "cancelled", nextRetryAt: null } });
        expect((await asAdmin("post", `/api/payin/orders/${order.orderId}/resend-callback`)).statusCode).toBe(409);

        await require("../models/Merchant").updateOne({ _id: merchant._id }, { $set: { mode: "production" } });
        expect((await asAdmin("post", `/api/payin/orders/${order.orderId}/resend-callback`)).body.code).toBe("ORDER_WRONG_MODE");
    });
});

describe("PATCH /api/payin/orders/:orderId/amount", () => {
    it("changes a pending order without touching fee fields", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);

        const res = await asAdmin("patch", `/api/payin/orders/${order.orderId}/amount`).send({ amountPaise: 70000, reason: "typed wrongly" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ amountPaise: 70000, status: "pending", feePaise: null });
    });

    it("recomputes fee and payable on a successful order, and audits who did it with the old and new value", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });

        const res = await asAgent("patch", `/api/payin/orders/${order.orderId}/amount`).send({ amountPaise: 100000, reason: "customer paid 1000" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ amountPaise: 100000, feePaise: 2500, payablePaise: 97500 });

        const entry = await AuditLog.findOne({ action: "order.amount_updated" });
        expect(entry).toMatchObject({ actorType: "agent", targetType: "order" });
        expect(entry.metadata).toMatchObject({ orderId: order.orderId, from: 50000, to: 100000, reason: "customer paid 1000" });
    });

    it("keeps the merchant's own minimum and maximum", async () => {
        const { merchant, bank } = await setup();
        merchant.config = { ...merchant.config.toObject(), minAmountPaise: 10000, maxAmountPaise: 200000 };
        await merchant.save();
        const order = await makeOrder(merchant, bank);

        for (const amountPaise of [5000, 300000]) {
            const res = await asAdmin("patch", `/api/payin/orders/${order.orderId}/amount`).send({ amountPaise, reason: "test" });
            expect(res.statusCode).toBe(422);
            expect(res.body.code).toBe("AMOUNT_OUT_OF_RANGE");
        }
        expect((await Order.findById(order._id)).amountPaise).toBe(50000);
    });

    it("needs a reason and a whole positive amount, and refuses a failed order or no change", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);
        const failed = await makeOrder(merchant, bank, { status: "failed" });
        const patch = (id, body) => asAdmin("patch", `/api/payin/orders/${id}/amount`).send(body);

        expect((await patch(order.orderId, { amountPaise: 60000 })).statusCode).toBe(400);
        expect((await patch(order.orderId, { amountPaise: 60000, reason: "x" })).statusCode).toBe(400);
        expect((await patch(order.orderId, { amountPaise: 0, reason: "test" })).statusCode).toBe(400);
        expect((await patch(order.orderId, { amountPaise: 12.5, reason: "test" })).statusCode).toBe(400);
        expect((await patch(order.orderId, { amountPaise: 50000, reason: "test" })).statusCode).toBe(400);
        const res = await patch(failed.orderId, { amountPaise: 60000, reason: "test" });
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("ORDER_STATE_CONFLICT");
    });

    it("is closed to merchants", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);
        const member = await User.create({
            email: "owner@acme.example", password: "x".repeat(20), role: "merchant", merchantId: merchant._id, merchantRole: "owner"
        });
        const token = jwt.sign({ id: String(member._id), email: member.email, role: "merchant" }, process.env.SECRET, { expiresIn: "15m" });
        const res = await request(app).patch(`/api/payin/orders/${order.orderId}/amount`)
            .set("Authorization", `Bearer ${token}`).send({ amountPaise: 60000, reason: "test" });
        expect(res.statusCode).toBe(403);
        expect((await Order.findById(order._id)).amountPaise).toBe(50000);
    });
});

describe("PATCH /api/payin/orders/:orderId/utr", () => {
    it("changes the UTR of a successful order and audits old and new", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });
        const next = nextUtr();

        const res = await asAdmin("patch", `/api/payin/orders/${order.orderId}/utr`).send({ utr: next, reason: "bank statement says so" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order.utr).toBe(next);

        const entry = await AuditLog.findOne({ action: "order.utr_updated" });
        expect(entry.metadata).toMatchObject({ from: order.utr, to: next, reason: "bank statement says so" });
    });

    it("refuses a UTR another order already uses, a bad format, and an order that is not successful", async () => {
        const { merchant, bank } = await setup();
        const a = await makeOrder(merchant, bank, { status: "success" });
        const b = await makeOrder(merchant, bank, { status: "success" });
        const pending = await makeOrder(merchant, bank);
        const patch = (id, body) => asAdmin("patch", `/api/payin/orders/${id}/utr`).send(body);

        const taken = await patch(b.orderId, { utr: a.utr, reason: "test" });
        expect(taken.statusCode).toBe(409);
        expect(taken.body.code).toBe("UTR_IN_USE");
        expect((await patch(b.orderId, { utr: "123", reason: "test" })).statusCode).toBe(400);
        expect((await patch(b.orderId, { utr: nextUtr() })).statusCode).toBe(400);
        expect((await patch(b.orderId, { utr: b.utr, reason: "test" })).statusCode).toBe(400);
        expect((await patch(pending.orderId, { utr: nextUtr(), reason: "test" })).body.code).toBe("ORDER_STATE_CONFLICT");
    });

    it("never lets two orders hold the same UTR, even if a request slips past the check", async () => {
        const { merchant, bank } = await setup();
        const a = await makeOrder(merchant, bank, { status: "success" });
        await expect(makeOrder(merchant, bank, { status: "success", utr: a.utr })).rejects.toMatchObject({ code: 11000 });
    });
});

describe("POST /api/payin/orders/:orderId/fail", () => {
    it("fails a pending order, tells the merchant, and keeps the reason out of the callback", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);

        const res = await asAgent("post", `/api/payin/orders/${order.orderId}/fail`).send({ reason: "customer called, fraud suspected" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ status: "failed", statusReason: "failed_by_staff" });

        const delivery = await CallbackDelivery.findOne({ orderId: order._id });
        expect(delivery.event).toBe("order.failed");
        expect(delivery.body).not.toContain("fraud");
        expect(JSON.parse(delivery.body).data.statusReason).toBe("failed_by_staff");

        const entry = await AuditLog.findOne({ action: "order.failed_by_staff" });
        expect(entry).toMatchObject({ actorType: "agent" });
        expect(entry.metadata).toMatchObject({ orderId: order.orderId, from: "pending", reason: "customer called, fraud suspected" });
    });

    it("fails a successful order, refunds all of it, and leaves the bank credit alone", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { amountPaise: 50000 });
        const credit = await makeCredit(bank, 50000);
        expect((await claimPayment(order, credit.utr)).result).toBe(CLAIM.SUCCESS);

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/fail`).send({ reason: "chargeback" });
        expect(res.body.order).toMatchObject({ status: "failed", refundedPaise: 50000, feePaise: 0, payablePaise: 0 });
        expect((await Order.findById(order._id)).refundedAt).toBeInstanceOf(Date);
        expect((await BankCredit.findById(credit._id)).claimedBy).toEqual(order._id);

        // One failed callback that says how much was refunded; no separate refunded callback.
        const deliveries = await CallbackDelivery.find({ orderId: order._id });
        expect(deliveries.map((d) => d.event)).toEqual(["order.failed"]);
        expect(JSON.parse(deliveries[0].body).data).toMatchObject({ status: "failed", amountPaise: 50000, refundedPaise: 50000 });

        const entry = await AuditLog.findOne({ action: "order.failed_by_staff" });
        expect(entry.metadata).toMatchObject({ from: "success", refundedNowPaise: 50000, refundedTotalPaise: 50000 });
        expect((await asAdmin("get", "/api/payin/orders")).body.totals.refundedPaise).toBe(50000);
    });

    it("failing a pending order returns nothing, because no money arrived", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/fail`).send({ reason: "test one" });
        expect(res.body.order).toMatchObject({ status: "failed", refundedPaise: 0 });
        expect((await Order.findById(order._id)).refundedAt).toBeNull();
    });

    it("cannot be done twice, needs a reason, and does nothing to an order that already failed", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank);
        const fail = () => asAdmin("post", `/api/payin/orders/${order.orderId}/fail`);

        expect((await fail().send({})).statusCode).toBe(400);
        expect((await fail().send({ reason: "test one" })).statusCode).toBe(200);
        const again = await fail().send({ reason: "test two" });
        expect(again.statusCode).toBe(409);
        expect(await AuditLog.countDocuments({ action: "order.failed_by_staff" })).toBe(1);
    });

    it("treats an overdue pending order as already failed", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/fail`).send({ reason: "test" });
        expect(res.statusCode).toBe(409);
        expect((await Order.findById(order._id)).statusReason).toBe("expired");
    });
});

describe("POST /api/payin/orders/:orderId/refund", () => {
    const refund = (order, who = asAdmin) => who("post", `/api/payin/orders/${order.orderId}/refund`);

    it("refunds part of a successful order: it stays success, the fee and payable follow what is left, and the merchant is told", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });

        const res = await refund(order, asAgent).send({ amountPaise: 20000, reason: "customer returned one item" });
        expect(res.statusCode).toBe(200);
        // 30000 left at 2.50%: fee 750, payable 29250
        expect(res.body.order).toMatchObject({ status: "success", amountPaise: 50000, refundedPaise: 20000, feePaise: 750, payablePaise: 29250 });
        expect((await Order.findById(order._id)).refundedAt).toBeInstanceOf(Date);

        const delivery = await CallbackDelivery.findOne({ orderId: order._id, event: "order.refunded" });
        expect(delivery.body).not.toContain("item");
        expect(JSON.parse(delivery.body).data).toMatchObject({ status: "success", amountPaise: 50000, refundedPaise: 20000 });

        const entry = await AuditLog.findOne({ action: "order.refunded_by_staff" });
        expect(entry).toMatchObject({ actorType: "agent" });
        expect(entry.metadata).toMatchObject({
            orderId: order.orderId, from: "success", to: "success", amountPaise: 20000, refundedTotalPaise: 20000, reason: "customer returned one item"
        });
    });

    it("can be done again until nothing is left, then the order becomes refunded and final", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });

        expect((await refund(order).send({ amountPaise: 20000, reason: "first part" })).statusCode).toBe(200);
        const rest = await refund(order).send({ amountPaise: 30000, reason: "the rest" });
        expect(rest.statusCode).toBe(200);
        expect(rest.body.order).toMatchObject({ status: "refunded", statusReason: "refunded_by_staff", refundedPaise: 50000, feePaise: 0, payablePaise: 0 });

        // The one callback row was sent again with the new state, not duplicated.
        const deliveries = await CallbackDelivery.find({ orderId: order._id, event: "order.refunded" });
        expect(deliveries).toHaveLength(1);
        expect(JSON.parse(deliveries[0].body).data).toMatchObject({ status: "refunded", refundedPaise: 50000, statusReason: "refunded_by_staff" });
        expect(deliveries[0].status).toBe("pending");
        expect(await AuditLog.countDocuments({ action: "order.refunded_by_staff" })).toBe(2);

        expect((await refund(order).send({ amountPaise: 100, reason: "too late" })).statusCode).toBe(409);
    });

    it("refuses more than what is left, a missing or non-integer amount, a missing reason, and orders that are not successful", async () => {
        const { merchant, bank } = await setup();
        const pending = await makeOrder(merchant, bank);
        const failed = await makeOrder(merchant, bank, { status: "failed" });
        const done = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });

        expect((await refund(pending).send({ amountPaise: 100, reason: "test one" })).statusCode).toBe(409);
        expect((await refund(failed).send({ amountPaise: 100, reason: "test one" })).statusCode).toBe(409);
        expect((await refund(done).send({ reason: "test one" })).statusCode).toBe(400);
        expect((await refund(done).send({ amountPaise: 0, reason: "test one" })).statusCode).toBe(400);
        expect((await refund(done).send({ amountPaise: 99.5, reason: "test one" })).statusCode).toBe(400);
        expect((await refund(done).send({ amountPaise: "100", reason: "test one" })).statusCode).toBe(400);
        expect((await refund(done).send({ amountPaise: 100 })).statusCode).toBe(400);

        const tooMuch = await refund(done).send({ amountPaise: 50001, reason: "test one" });
        expect(tooMuch.statusCode).toBe(422);
        expect(tooMuch.body.code).toBe("REFUND_EXCEEDS_REMAINING");
        expect((await refund(done).send({ amountPaise: 30000, reason: "test one" })).statusCode).toBe(200);
        expect((await refund(done).send({ amountPaise: 20001, reason: "test two" })).statusCode).toBe(422);
        expect((await Order.findById(done._id)).refundedPaise).toBe(30000);
    });

    it("two refunds sent at once cannot refund more than the amount", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });

        const results = await Promise.all([
            refund(order).send({ amountPaise: 30000, reason: "test one" }),
            refund(order).send({ amountPaise: 30000, reason: "test two" })
        ]);
        // One wins. The other is refused: 409 if it lost the race, 422 if it saw the new total.
        const codes = results.map((r) => r.statusCode).sort();
        expect(codes[0]).toBe(200);
        expect([409, 422]).toContain(codes[1]);
        expect((await Order.findById(order._id)).refundedPaise).toBe(30000);
    });

    it("a partly refunded order can no longer have its amount changed, and the dashboard counts only what is left", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });
        expect((await asAdmin("get", "/api/payin/dashboard")).body.cards).toMatchObject({ totalPayinPaise: 50000, payinChargesPaise: 1250, unsettledPaise: 48750 });

        await refund(order).send({ amountPaise: 20000, reason: "test one" });

        expect((await asAdmin("patch", `/api/payin/orders/${order.orderId}/amount`).send({ amountPaise: 40000, reason: "test two" })).statusCode).toBe(409);
        const c = (await asAdmin("get", "/api/payin/dashboard")).body.cards;
        expect(c).toMatchObject({ totalPayinPaise: 30000, payinChargesPaise: 750, unsettledPaise: 29250 });
        expect(c.totalPayinPaise).toBe(c.payinChargesPaise + c.unsettledPaise + c.toBeSettledPaise + c.settledPaise);

        await refund(order).send({ amountPaise: 30000, reason: "test three" });
        expect((await asAdmin("get", "/api/payin/dashboard")).body.cards.totalPayinPaise).toBe(0);
    });

    it("failing a partly refunded order refunds the rest of it", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });
        await refund(order).send({ amountPaise: 20000, reason: "test one" });

        const res = await asAdmin("post", `/api/payin/orders/${order.orderId}/fail`).send({ reason: "test two" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ status: "failed", refundedPaise: 50000, feePaise: 0, payablePaise: 0 });
        const entry = await AuditLog.findOne({ action: "order.failed_by_staff" });
        expect(entry.metadata).toMatchObject({ refundedNowPaise: 30000, refundedTotalPaise: 50000 });
        expect((await asAdmin("get", "/api/payin/dashboard")).body.cards.totalPayinPaise).toBe(0);
    });

    it("counts an order with no stored rate as fee 0 when part of it is refunded", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrderOn(merchant, bank, { status: "success", utr: nextUtr(), paidAt: new Date(), amountPaise: 10000 });

        const res = await refund(order).send({ amountPaise: 4000, reason: "test one" });
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ status: "success", refundedPaise: 4000, feePaise: null, payablePaise: null });
        const c = (await asAdmin("get", "/api/payin/dashboard")).body.cards;
        expect(c).toMatchObject({ totalPayinPaise: 6000, payinChargesPaise: 0, unsettledPaise: 6000 });
    });

    it("shows the refunded total, fully refunded orders and the status filter in the list", async () => {
        const { merchant, bank } = await setup();
        const full = await makeOrder(merchant, bank, { status: "success", amountPaise: 50000 });
        const part = await makeOrder(merchant, bank, { status: "success", amountPaise: 20000 });
        await refund(full).send({ amountPaise: 50000, reason: "test one" });
        await refund(part).send({ amountPaise: 5000, reason: "test two" });

        expect((await asAdmin("get", "/api/payin/orders?status=refunded")).body.total).toBe(1);
        const all = await asAdmin("get", "/api/payin/orders");
        expect(all.body.totals.refundedPaise).toBe(55000);
        expect(all.body.totals.byStatus.refunded).toEqual({ count: 1, amountPaise: 50000 });
        expect(all.body.totals.byStatus.success).toEqual({ count: 1, amountPaise: 20000 });
        const row = all.body.data.find((r) => r.orderId === part.orderId);
        expect(row).toMatchObject({ status: "success", refundedPaise: 5000 });
    });

    it("is closed to people who are not logged in", async () => {
        const { merchant, bank } = await setup();
        const order = await makeOrder(merchant, bank, { status: "success" });
        expect((await request(app).post(`/api/payin/orders/${order.orderId}/refund`).send({ amountPaise: 100, reason: "test one" })).statusCode).toBe(401);
    });
});
