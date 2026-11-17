// Phase 2a HTTP layer, against a real (in-memory) MongoDB: the signed /v1/orders API, the public
// checkout page API and the admin bank statement, wired together end to end.

process.env.CREDENTIAL_ENC_KEY = "c".repeat(64);
process.env.CLAIM_RATE_LIMIT = "4";
process.env.CHECKOUT_BASE_URL = "https://pay.example.test";

jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());

const request = require("supertest");
const mongoose = require("mongoose");
const db = require("./helpers/realDb");
const app = require("../app");
const AuditLog = require("../models/AuditLog");
const Order = require("../models/Order");
const BankCredit = require("../models/BankCredit");
const { issueCredential } = require("../services/credentialService");
const { adminToken, userToken, signedRequest } = require("./helpers/merchantFlow");
const { nextUtr, makeBank, mapBank, makeOrderOn, setupMerchantWithBank } = require("./helpers/realFixtures");

jest.setTimeout(60000);

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

// A merchant with a bank and a key for the given environment.
const setup = async ({ mode = "sandbox", environment = "sandbox", merchant: overrides } = {}) => {
    const { merchant, bank } = await setupMerchantWithBank({ mode, ...overrides });
    const { secret } = await issueCredential({ merchant, environment, createdBy: null });
    return { merchant, bank, mid: merchant.mid, secret };
};

const asAdmin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);
const addCredit = (body) => asAdmin("post", "/api/admin/bank-credits").send(body);
const createOrder = (k, body, method = "post") => signedRequest(app, { mid: k.mid, secret: k.secret, method, path: "/v1/orders", body });
const getOrder = (k, orderId) => signedRequest(app, { mid: k.mid, secret: k.secret, path: `/v1/orders/${orderId}` });

describe("POST /v1/orders", () => {
    it("creates a pending order and returns a checkout link, but no bank details", async () => {
        const k = await setup();
        const res = await createOrder(k, { amountPaise: 50000, merchantOrderId: "INV-1", description: "T-shirt", customerName: "Ravi" });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.order).toMatchObject({
            merchantOrderId: "INV-1",
            mode: "sandbox",
            amountPaise: 50000,
            currency: "INR",
            description: "T-shirt",
            customerName: "Ravi",
            status: "pending",
            utr: null,
            paidAt: null
        });
        expect(res.body.order.orderId).toMatch(/^ord_[a-z0-9]{16}$/);
        expect(res.body.order.checkoutUrl).toBe(`https://pay.example.test/pay/${res.body.order.orderId}`);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain(k.bank.upiId);
        expect(text).not.toContain(k.bank.accountNumber);
    });

    it("needs a valid signature", async () => {
        const k = await setup();
        const res = await request(app).post("/v1/orders").send({ amountPaise: 50000 });
        expect(res.statusCode).toBe(401);
        const bad = await signedRequest(app, { mid: k.mid, secret: "sk_test_wrong", method: "post", path: "/v1/orders", body: { amountPaise: 50000 } });
        expect(bad.statusCode).toBe(401);
        expect(await Order.countDocuments()).toBe(0);
    });

    it.each([
        ["a missing amount", {}],
        ["zero", { amountPaise: 0 }],
        ["a negative amount", { amountPaise: -5 }],
        ["a fraction of a paisa", { amountPaise: 10.5 }],
        ["an amount sent as text", { amountPaise: "50000" }],
        ["an amount above the limit", { amountPaise: 100000001 }],
        ["a bad merchantOrderId", { amountPaise: 100, merchantOrderId: "has space" }],
        ["a too-long description", { amountPaise: 100, description: "x".repeat(201) }]
    ])("rejects %s with 400", async (_name, body) => {
        const k = await setup();
        const res = await createOrder(k, body);
        expect(res.statusCode).toBe(400);
        expect(await Order.countDocuments()).toBe(0);
    });

    it("ignores fields it does not know (an order cannot be created already paid)", async () => {
        const k = await setup();
        const res = await createOrder(k, { amountPaise: 100, status: "success", bankId: "x", mode: "production" });
        expect(res.statusCode).toBe(201);
        expect(res.body.order.status).toBe("pending");
        expect(res.body.order.mode).toBe("sandbox");
    });

    it("returns 200 and the same order when merchantOrderId is repeated", async () => {
        const k = await setup();
        const first = await createOrder(k, { amountPaise: 50000, merchantOrderId: "INV-1" });
        const again = await createOrder(k, { amountPaise: 50000, merchantOrderId: "INV-1" });
        expect(again.statusCode).toBe(200);
        expect(again.body.order.orderId).toBe(first.body.order.orderId);
        expect(await Order.countDocuments()).toBe(1);
    });

    it("returns 409 MERCHANT_ORDER_ID_REUSED when the amount differs", async () => {
        const k = await setup();
        await createOrder(k, { amountPaise: 50000, merchantOrderId: "INV-1" });
        const res = await createOrder(k, { amountPaise: 60000, merchantOrderId: "INV-1" });
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("MERCHANT_ORDER_ID_REUSED");
    });

    it("returns 503 NO_BANK_AVAILABLE when the merchant has no usable bank", async () => {
        const k = await setup();
        await mongoose.model("MerchantBankMapping").deleteMany({});
        const res = await createOrder(k, { amountPaise: 50000 });
        expect(res.statusCode).toBe(503);
        expect(res.body.code).toBe("NO_BANK_AVAILABLE");
    });

    it("returns 422 AMOUNT_OUT_OF_RANGE outside the merchant's limits", async () => {
        const k = await setup({ merchant: { config: { minAmountPaise: 10000, maxAmountPaise: 200000 } } });
        const low = await createOrder(k, { amountPaise: 9999 });
        expect(low.statusCode).toBe(422);
        expect(low.body.code).toBe("AMOUNT_OUT_OF_RANGE");
        expect((await createOrder(k, { amountPaise: 10000 })).statusCode).toBe(201);
    });

    it("refuses a key from the other mode (403 WRONG_ENVIRONMENT)", async () => {
        const k = await setup({ mode: "sandbox", environment: "live" });
        const res = await createOrder(k, { amountPaise: 50000 });
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("WRONG_ENVIRONMENT");
    });

    it("creates a production order with a live key for a production merchant", async () => {
        const k = await setup({ mode: "production", environment: "live" });
        const res = await createOrder(k, { amountPaise: 50000 });
        expect(res.statusCode).toBe(201);
        expect(res.body.order.mode).toBe("production");
    });
});

describe("GET /v1/orders/:orderId", () => {
    it("returns the merchant's own order", async () => {
        const k = await setup();
        const created = await createOrder(k, { amountPaise: 50000 });
        const res = await getOrder(k, created.body.order.orderId);
        expect(res.statusCode).toBe(200);
        expect(res.body.order.orderId).toBe(created.body.order.orderId);
    });

    it("returns 404 for another merchant's order", async () => {
        const a = await setup();
        const b = await setup();
        const created = await createOrder(a, { amountPaise: 50000 });
        const res = await getOrder(b, created.body.order.orderId);
        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe("ORDER_NOT_FOUND");
    });

    it.each(["ord_unknownunknown00", "nonsense", "ord_"])("returns 404 for %s", async (id) => {
        const k = await setup();
        expect((await getOrder(k, id)).statusCode).toBe(404);
    });

    it("shows an overdue order as failed", async () => {
        const k = await setup();
        const o = await makeOrderOn(k.merchant, k.bank, { expiresAt: new Date(Date.now() - 1000) });
        const res = await getOrder(k, o.orderId);
        expect(res.body.order).toMatchObject({ status: "failed", statusReason: "expired" });
    });
});

describe("GET /api/pay/:orderId (public checkout)", () => {
    it("shows the amount and where to pay, without the account number or IFSC", async () => {
        const k = await setup();
        const created = await createOrder(k, { amountPaise: 50000, description: "T-shirt" });
        const res = await request(app).get(`/api/pay/${created.body.order.orderId}`);

        expect(res.statusCode).toBe(200);
        const o = res.body.order;
        expect(o).toMatchObject({ status: "pending", mode: "sandbox", amountPaise: 50000, merchantName: "Acme Traders", description: "T-shirt" });
        expect(o.payment).toMatchObject({ holderName: "Acme Traders", bankName: "Test Bank", upiId: k.bank.upiId });
        expect(o.payment.upiUri).toContain(`pa=${encodeURIComponent(k.bank.upiId)}`);
        expect(o.payment.upiUri).toContain("am=500.00");
        expect(o.payment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain(k.bank.accountNumber);
        expect(text).not.toContain(k.bank.ifsc);
    });

    it("omits the QR when the bank has it switched off", async () => {
        const k = await setup();
        await k.bank.updateOne({ qrEnabled: false });
        const created = await createOrder(k, { amountPaise: 50000 });
        const res = await request(app).get(`/api/pay/${created.body.order.orderId}`);
        expect(res.body.order.payment.upiId).toBe(k.bank.upiId);
        expect(res.body.order.payment.qrDataUrl).toBeNull();
    });

    it("shows no payment details once the order is closed", async () => {
        const k = await setup();
        const o = await makeOrderOn(k.merchant, k.bank, { status: "failed" });
        const res = await request(app).get(`/api/pay/${o.orderId}`);
        expect(res.body.order.status).toBe("failed");
        expect(res.body.order.payment).toBeNull();
    });

    it("returns 404 for an unknown or malformed id", async () => {
        expect((await request(app).get("/api/pay/ord_aaaaaaaaaaaaaaaa")).statusCode).toBe(404);
        expect((await request(app).get("/api/pay/not-an-order")).statusCode).toBe(404);
    });
});

describe("POST /api/pay/:orderId/claim", () => {
    // Creates an order through the API and returns what the customer and admin need.
    const orderWithCredit = async (amountPaise = 50000) => {
        const k = await setup();
        const created = await createOrder(k, { amountPaise });
        const credit = await addCredit({ bankId: String(k.bank._id), amountPaise, utr: nextUtr() });
        return { ...k, orderId: created.body.order.orderId, utr: credit.body.credit.utr };
    };
    const claim = (orderId, utr) => request(app).post(`/api/pay/${orderId}/claim`).send({ utr });

    it("completes the whole payment: order, statement, customer claim, merchant sees it paid", async () => {
        const k = await orderWithCredit();

        const res = await claim(k.orderId, k.utr);
        expect(res.statusCode).toBe(200);
        expect(res.body.order).toMatchObject({ status: "success", payment: null });

        const seen = await getOrder(k, k.orderId);
        expect(seen.body.order).toMatchObject({ status: "success", utr: k.utr });
        expect(seen.body.order.paidAt).toBeTruthy();

        const credit = await BankCredit.findOne({ utr: k.utr });
        expect(String(credit.claimedBy)).toBe(String((await Order.findOne({ orderId: k.orderId }))._id));
    });

    it("says 'not found' for a UTR that is not on the statement, and keeps the order open", async () => {
        const k = await orderWithCredit();
        const res = await claim(k.orderId, nextUtr());
        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
        expect((await getOrder(k, k.orderId)).body.order.status).toBe("pending");
    });

    it("says 'not found' when the money was for a different amount", async () => {
        const k = await setup();
        const created = await createOrder(k, { amountPaise: 50000 });
        const credit = await addCredit({ bankId: String(k.bank._id), amountPaise: 49900, utr: nextUtr() });
        const res = await claim(created.body.order.orderId, credit.body.credit.utr);
        expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("lets a second customer NOT reuse a paid UTR", async () => {
        const k = await orderWithCredit();
        await claim(k.orderId, k.utr);
        const other = await createOrder(k, { amountPaise: 50000 });
        const res = await claim(other.body.order.orderId, k.utr);
        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("answers 409 ORDER_NOT_PENDING when the order is already paid", async () => {
        const k = await orderWithCredit();
        await claim(k.orderId, k.utr);
        const res = await claim(k.orderId, k.utr);
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("ORDER_NOT_PENDING");
    });

    it("answers 409 for an expired order and leaves the credit free", async () => {
        const k = await setup();
        const o = await makeOrderOn(k.merchant, k.bank, { expiresAt: new Date(Date.now() - 1000) });
        const credit = await addCredit({ bankId: String(k.bank._id), amountPaise: 50000, utr: nextUtr() });
        const res = await claim(o.orderId, credit.body.credit.utr);
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("ORDER_NOT_PENDING");
        expect((await BankCredit.findOne({ utr: credit.body.credit.utr })).claimedBy).toBeNull();
    });

    it.each(["12345", "abcdefghijkl", "1234567890123", ""])("rejects the UTR '%s' with 400", async (utr) => {
        const k = await orderWithCredit();
        const res = await claim(k.orderId, utr);
        expect(res.statusCode).toBe(400);
    });

    it("pays an order only once when the same UTR is submitted many times at once", async () => {
        const k = await orderWithCredit();
        // Rate limit is 4 per order, so use separate orders for the parallel customers.
        const orders = [k.orderId];
        for (let i = 0; i < 3; i++) orders.push((await createOrder(k, { amountPaise: 50000 })).body.order.orderId);

        const results = await Promise.all(orders.map((id) => claim(id, k.utr)));

        expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
        expect(results.filter((r) => r.statusCode === 404)).toHaveLength(3);
        expect(await Order.countDocuments({ status: "success" })).toBe(1);
    });

    it("limits guessing: too many tries on one order get 429", async () => {
        const k = await orderWithCredit();
        const codes = [];
        for (let i = 0; i < 6; i++) codes.push((await claim(k.orderId, nextUtr())).statusCode);
        expect(codes.slice(0, 4)).toEqual([404, 404, 404, 404]);
        expect(codes.slice(4)).toEqual([429, 429]);
        // The right UTR is blocked too while the limit holds.
        expect((await claim(k.orderId, k.utr)).statusCode).toBe(429);
    });

    it("returns 404 for an unknown order", async () => {
        const res = await claim("ord_aaaaaaaaaaaaaaaa", nextUtr());
        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe("ORDER_NOT_FOUND");
    });

    it("pays the late-payment order: the new order lands on the bank that holds the money", async () => {
        const k = await setup();
        const other = await makeBank();
        await mapBank(k.merchant, other);
        // The first order expired; the customer paid it anyway; the admin enters the money.
        await makeOrderOn(k.merchant, k.bank, { expiresAt: new Date(Date.now() - 1000) });
        const credit = await addCredit({ bankId: String(k.bank._id), amountPaise: 50000, utr: nextUtr() });
        // Make the holding bank look busier, so only the preference rule can pick it.
        await makeOrderOn(k.merchant, k.bank);
        await makeOrderOn(k.merchant, k.bank);

        const created = await createOrder(k, { amountPaise: 50000 });
        const res = await claim(created.body.order.orderId, credit.body.credit.utr);
        expect(res.statusCode).toBe(200);
        expect(res.body.order.status).toBe("success");
    });
});

describe("admin bank credits", () => {
    it("lets an admin add and list statement lines", async () => {
        const bank = await makeBank();
        const utr = nextUtr();
        const added = await addCredit({ bankId: String(bank._id), amountPaise: 50000, utr, note: "Nov 17 statement" });

        expect(added.statusCode).toBe(201);
        expect(added.body.credit).toMatchObject({ utr, amountPaise: 50000, claimed: false, note: "Nov 17 statement" });

        const list = await asAdmin("get", "/api/admin/bank-credits");
        expect(list.statusCode).toBe(200);
        expect(list.body.total).toBe(1);
        expect(list.body.data[0]).toMatchObject({ utr, claimed: false });
        expect(list.body.data[0].bank).toMatchObject({ bankId: bank.bankId, bankName: "Test Bank" });
    });

    it("writes an audit entry", async () => {
        const bank = await makeBank();
        const utr = nextUtr();
        await addCredit({ bankId: String(bank._id), amountPaise: 50000, utr });
        const entry = await AuditLog.findOne({ action: "bank_credit.added" });
        expect(entry).toBeTruthy();
        expect(entry.metadata).toMatchObject({ utr, amountPaise: 50000 });
    });

    it("refuses the same UTR twice (409)", async () => {
        const bank = await makeBank();
        const utr = nextUtr();
        await addCredit({ bankId: String(bank._id), amountPaise: 50000, utr });
        const again = await addCredit({ bankId: String(bank._id), amountPaise: 70000, utr });
        expect(again.statusCode).toBe(409);
        expect(await BankCredit.countDocuments()).toBe(1);
    });

    it("refuses an unknown bank (404) and bad input (400)", async () => {
        const missing = await addCredit({ bankId: "a".repeat(24), amountPaise: 50000, utr: nextUtr() });
        expect(missing.statusCode).toBe(404);

        const bank = await makeBank();
        for (const body of [
            { amountPaise: 0, utr: nextUtr() },
            { amountPaise: 10.5, utr: nextUtr() },
            { amountPaise: 100, utr: "123" },
            { amountPaise: 100, utr: nextUtr(), receivedAt: "2999-01-01" }
        ]) {
            expect((await addCredit({ bankId: String(bank._id), ...body })).statusCode).toBe(400);
        }
    });

    it("filters the list by claimed state and bank", async () => {
        const k = await setup();
        const created = await createOrder(k, { amountPaise: 50000 });
        const paid = await addCredit({ bankId: String(k.bank._id), amountPaise: 50000, utr: nextUtr() });
        await addCredit({ bankId: String(k.bank._id), amountPaise: 70000, utr: nextUtr() });
        await request(app).post(`/api/pay/${created.body.order.orderId}/claim`).send({ utr: paid.body.credit.utr });

        const claimed = await asAdmin("get", "/api/admin/bank-credits?claimed=true");
        expect(claimed.body.total).toBe(1);
        expect(claimed.body.data[0]).toMatchObject({ utr: paid.body.credit.utr, claimed: true, claimedMode: "sandbox", claimedByOrder: created.body.order.orderId });
        expect((await asAdmin("get", "/api/admin/bank-credits?claimed=false")).body.total).toBe(1);
        expect((await asAdmin("get", `/api/admin/bank-credits?bankId=${k.bank._id}`)).body.total).toBe(2);
        expect((await asAdmin("get", `/api/admin/bank-credits?bankId=${"b".repeat(24)}`)).body.total).toBe(0);
    });

    it("is admin only", async () => {
        const bank = await makeBank();
        const body = { bankId: String(bank._id), amountPaise: 50000, utr: nextUtr() };
        expect((await request(app).post("/api/admin/bank-credits").send(body)).statusCode).toBe(401);
        const asAgent = await request(app).post("/api/admin/bank-credits").set("Authorization", `Bearer ${userToken()}`).send(body);
        expect(asAgent.statusCode).toBe(403);
        expect((await request(app).get("/api/admin/bank-credits")).statusCode).toBe(401);
        expect(await BankCredit.countDocuments()).toBe(0);
    });
});
