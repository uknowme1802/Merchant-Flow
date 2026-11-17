// Phase 2b, against a real (in-memory) MongoDB and a real local HTTP receiver: merchant callbacks,
// the retry rule (every 5 minutes until HTTP 200), resend, mode-switch cancellation and the
// 15-minute order expiry sweep.

const http = require("http");
const db = require("./helpers/realDb");
const CallbackDelivery = require("../models/CallbackDelivery");
const Order = require("../models/Order");
const callbackService = require("../services/callbackService");
const { createOrder, expireIfDue, expireDueOrders } = require("../services/orderService");
const { claimPayment } = require("../services/claimService");
const { submitClaim } = require("../services/checkoutService");
const { issueCredential } = require("../services/credentialService");
const { updateConfig, switchMode } = require("../services/merchantService");
const { CALLBACK_RETRY_MS } = require("../constants/callback");
const { makeCredit, setupMerchantWithBank, makeOrderOn, nextUtr } = require("./helpers/realFixtures");

jest.setTimeout(60000);

beforeAll(() => { process.env.CREDENTIAL_ENC_KEY = "c".repeat(64); });
beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

// A receiver whose answer the test controls. `hits` records every request it got.
let receiver, port, hits, respondWith;
beforeAll(async () => {
    receiver = http.createServer((req, res) => {
        let raw = "";
        req.on("data", (c) => { raw += c; });
        req.on("end", () => {
            hits.push({ headers: req.headers, raw });
            res.statusCode = typeof respondWith === "function" ? respondWith(hits.length) : respondWith;
            res.end();
        });
    });
    await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
    port = receiver.address().port;
});
afterAll(() => new Promise((r) => receiver.close(r)));
beforeEach(() => { hits = []; respondWith = 200; });

const URL_OK = () => `http://127.0.0.1:${port}/hook`;

// A merchant with a bank, an active sandbox key and a callback URL.
const setup = async ({ callbackUrl = URL_OK(), config = {} } = {}) => {
    const { merchant, bank } = await setupMerchantWithBank();
    merchant.config = { ...merchant.config.toObject(), callbackUrl, ...config };
    await merchant.save();
    const { secret } = await issueCredential({ merchant, environment: "sandbox", createdBy: null });
    return { merchant, bank, secret };
};

const place = (merchant, bank, fields) => makeOrderOn(merchant, bank, fields);
const rows = () => CallbackDelivery.find({}).sort({ createdAt: 1 });
const markPaid = (order) =>
    Order.findOneAndUpdate({ _id: order._id }, { $set: { status: "success", utr: nextUtr(), paidAt: new Date() } }, { returnDocument: "after" });
// Makes every waiting callback due now, as if the 5 minutes had passed.
const fastForward = () => CallbackDelivery.updateMany({ status: "pending" }, { $set: { nextRetryAt: new Date(Date.now() - 1000) } });

describe("enqueueOrderCallback", () => {
    it("creates one delivery for a paid order, with the right event, url and body", async () => {
        const { merchant, bank } = await setup();
        const order = await markPaid(await place(merchant, bank));

        const d = await callbackService.enqueueOrderCallback(order);
        expect(d).toMatchObject({ event: "order.success", status: "pending", attempts: 0, url: URL_OK(), mode: "sandbox", orderPublicId: order.orderId });
        const body = JSON.parse(d.body);
        expect(body.event).toBe("order.success");
        expect(body.data).toMatchObject({ orderId: order.orderId, status: "success", amountPaise: 50000, mode: "sandbox", utr: order.utr });
    });

    it("uses order.failed for an expired order", async () => {
        const { merchant, bank } = await setup();
        const order = await Order.findOneAndUpdate(
            { _id: (await place(merchant, bank))._id }, { $set: { status: "failed", statusReason: "expired" } }, { returnDocument: "after" });
        const d = await callbackService.enqueueOrderCallback(order);
        expect(d.event).toBe("order.failed");
        expect(JSON.parse(d.body).data.statusReason).toBe("expired");
    });

    it("is idempotent: the same order and event never creates a second delivery", async () => {
        const { merchant, bank } = await setup();
        const order = await markPaid(await place(merchant, bank));
        await callbackService.enqueueOrderCallback(order);
        await callbackService.enqueueOrderCallback(order);
        expect(await CallbackDelivery.countDocuments()).toBe(1);
    });

    it.each([
        ["no callback URL is set", { callbackUrl: null }],
        ["callbacks are switched off", { config: { webhookAutoTrigger: false } }]
    ])("sends nothing when %s", async (_n, opts) => {
        const { merchant, bank } = await setup(opts);
        const order = await markPaid(await place(merchant, bank));
        expect(await callbackService.enqueueOrderCallback(order)).toBeNull();
        expect(await CallbackDelivery.countDocuments()).toBe(0);
    });

    it("skips an order from the other mode", async () => {
        const { merchant, bank } = await setup();
        const order = await markPaid(await place(merchant, bank, { mode: "production" }));
        expect(await callbackService.enqueueOrderCallback(order)).toBeNull();
    });
});

describe("delivery and retry", () => {
    it("marks a delivery delivered on HTTP 200, with a signature the receiver can verify", async () => {
        const { merchant, bank, secret } = await setup();
        const order = await markPaid(await place(merchant, bank));
        await callbackService.enqueueOrderCallback(order);

        expect(await callbackService.processDueCallbacks()).toBe(1);
        const [d] = await rows();
        expect(d).toMatchObject({ status: "delivered", attempts: 1, statusCode: 200, nextRetryAt: null });
        expect(d.deliveredAt).toBeInstanceOf(Date);

        expect(hits).toHaveLength(1);
        expect(hits[0].headers["x-callback-event"]).toBe("order.success");
        expect(hits[0].headers["x-callback-signature"]).toBe(callbackService.sign(secret, hits[0].raw));
        expect(hits[0].raw).toBe(d.body);
    });

    it("retries after the retry interval, not before", async () => {
        const { merchant, bank } = await setup();
        respondWith = 500;
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.processDueCallbacks();

        const [d] = await rows();
        expect(d).toMatchObject({ status: "pending", attempts: 1, statusCode: 500 });
        expect(d.error).toMatch(/expected 200/);
        const wait = d.nextRetryAt.getTime() - Date.now();
        expect(wait).toBeGreaterThan(CALLBACK_RETRY_MS - 10000);
        expect(wait).toBeLessThanOrEqual(CALLBACK_RETRY_MS);

        // Not due yet: nothing is sent.
        expect(await callbackService.processDueCallbacks()).toBe(0);
        expect(hits).toHaveLength(1);
    });

    it("keeps retrying until the receiver answers 200, sending the same body every time", async () => {
        const { merchant, bank } = await setup();
        respondWith = (n) => (n < 3 ? 503 : 200);
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));

        for (let i = 0; i < 3; i++) {
            await callbackService.processDueCallbacks();
            await fastForward();
        }
        const [d] = await rows();
        expect(d).toMatchObject({ status: "delivered", attempts: 3 });
        expect(new Set(hits.map((h) => h.raw)).size).toBe(1);
    });

    it("counts only HTTP 200 as delivered (201 and 204 are not)", async () => {
        const { merchant, bank } = await setup();
        respondWith = 204;
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.processDueCallbacks();
        expect((await rows())[0]).toMatchObject({ status: "pending", statusCode: 204 });
    });

    it("gives up as failed after the maximum attempts", async () => {
        const { merchant, bank } = await setup();
        respondWith = 500;
        const d = await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await CallbackDelivery.updateOne({ _id: d._id }, { $set: { maxAttempts: 3 } });

        for (let i = 0; i < 5; i++) {
            await callbackService.processDueCallbacks();
            await fastForward();
        }
        expect((await rows())[0]).toMatchObject({ status: "failed", attempts: 3, nextRetryAt: null });
        expect(hits).toHaveLength(3);
    });

    it("records a network error when the receiver is unreachable", async () => {
        const { merchant, bank } = await setup({ callbackUrl: "http://127.0.0.1:1/hook" });
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.processDueCallbacks();
        const [d] = await rows();
        expect(d).toMatchObject({ status: "pending", attempts: 1, statusCode: null });
        expect(d.error).toBeTruthy();
    });

    it("fails the attempt, without sending, when the merchant has no active key", async () => {
        const { merchant, bank } = await setup();
        await require("../models/MerchantCredential").updateMany({}, { $set: { status: "revoked" } });
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.processDueCallbacks();
        expect(hits).toHaveLength(0);
        expect((await rows())[0].error).toMatch(/No active API key/);
    });

    it("two workers racing never send the same delivery twice", async () => {
        const { merchant, bank } = await setup();
        await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await Promise.all([callbackService.processDueCallbacks(), callbackService.processDueCallbacks()]);
        expect(hits).toHaveLength(1);
    });
});

describe("resend", () => {
    it("restarts the cycle and sends immediately, even for a delivered callback", async () => {
        const { merchant, bank } = await setup();
        const d = await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.processDueCallbacks();

        const again = await callbackService.resendCallback(d._id);
        expect(again).toMatchObject({ status: "delivered", attempts: 1 });
        expect(hits).toHaveLength(2);
    });

    it("lets a merchant resend only its own, in its current mode", async () => {
        const mine = await setup();
        const d = await callbackService.enqueueOrderCallback(await markPaid(await place(mine.merchant, mine.bank)));
        const other = await setup();

        await expect(callbackService.resendCallback(d._id, { merchantId: other.merchant._id, mode: "sandbox" }))
            .rejects.toMatchObject({ statusCode: 404 });
        await expect(callbackService.resendCallback(d._id, { merchantId: mine.merchant._id, mode: "production" }))
            .rejects.toMatchObject({ statusCode: 404 });
        await expect(callbackService.resendCallback(d._id, { merchantId: mine.merchant._id, mode: "sandbox" }))
            .resolves.toMatchObject({ status: "delivered" });
    });

    it("refuses a cancelled callback with 409", async () => {
        const { merchant, bank } = await setup();
        const d = await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await callbackService.cancelPendingCallbacks(merchant._id, "sandbox");
        await expect(callbackService.resendCallback(d._id)).rejects.toMatchObject({ statusCode: 409 });
        expect(hits).toHaveLength(0);
    });
});

describe("mode switch", () => {
    it("cancels what is still waiting in the mode being left, and nothing in the other mode", async () => {
        const { merchant, bank } = await setup();
        const waiting = await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        const prod = await CallbackDelivery.create({
            merchantId: merchant._id, orderId: merchant._id, orderPublicId: "ord_x", mode: "production",
            event: "order.success", url: URL_OK(), body: "{}", maxAttempts: 10
        });

        expect(await callbackService.cancelPendingCallbacks(merchant._id, "sandbox")).toBe(1);
        expect((await CallbackDelivery.findById(waiting._id)).status).toBe("cancelled");
        expect((await CallbackDelivery.findById(prod._id)).status).toBe("pending");
    });

    it("switchMode runs the cancellation, so a test order never calls the production URL", async () => {
        const { merchant, bank } = await setup();
        const d = await callbackService.enqueueOrderCallback(await markPaid(await place(merchant, bank)));
        await switchMode({ merchantId: merchant._id, mode: "production", confirmMid: merchant.mid, adminId: null });
        expect((await CallbackDelivery.findById(d._id)).status).toBe("cancelled");
        expect(await callbackService.processDueCallbacks()).toBe(0);
        expect(hits).toHaveLength(0);
    });
});

describe("wired into the order flow", () => {
    it("a successful claim queues an order.success callback", async () => {
        const { merchant, bank } = await setup();
        const order = await place(merchant, bank);
        const credit = await makeCredit(bank, 50000);

        await submitClaim(order.orderId, credit.utr);
        const [d] = await rows();
        expect(d).toMatchObject({ event: "order.success", orderPublicId: order.orderId });
    });

    it("a failed claim queues nothing", async () => {
        const { merchant, bank } = await setup();
        const order = await place(merchant, bank);
        await expect(submitClaim(order.orderId, "999999999999")).rejects.toMatchObject({ statusCode: 404 });
        expect(await CallbackDelivery.countDocuments()).toBe(0);
    });

    it("reading an expired order queues one order.failed callback", async () => {
        const { merchant, bank } = await setup();
        const order = await place(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        await expireIfDue(order);
        await expireIfDue(order);
        const all = await rows();
        expect(all).toHaveLength(1);
        expect(all[0].event).toBe("order.failed");
    });

    it("the sweep fails each due order once, queues its callback, and leaves live and paid orders alone", async () => {
        const { merchant, bank } = await setup();
        const late1 = await place(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        const late2 = await place(merchant, bank, { expiresAt: new Date(Date.now() - 2000) });
        const live = await place(merchant, bank);
        const paid = await place(merchant, bank, { status: "success", expiresAt: new Date(Date.now() - 1000) });

        expect(await expireDueOrders()).toBe(2);
        expect(await expireDueOrders()).toBe(0);

        expect((await Order.findById(late1._id)).status).toBe("failed");
        expect((await Order.findById(late2._id)).statusReason).toBe("expired");
        expect((await Order.findById(live._id)).status).toBe("pending");
        expect((await Order.findById(paid._id)).status).toBe("success");
        expect(await CallbackDelivery.countDocuments({ event: "order.failed" })).toBe(2);
    });

    it("an order that is paid at the last second is not expired by the sweep", async () => {
        const { merchant, bank } = await setup();
        const order = await place(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        await Order.updateOne({ _id: order._id }, { $set: { status: "success" } });
        expect(await expireDueOrders()).toBe(0);
        expect(await CallbackDelivery.countDocuments()).toBe(0);
    });

    it("a callback problem never breaks the payment", async () => {
        const { merchant, bank } = await setup();
        const order = await place(merchant, bank);
        const credit = await makeCredit(bank, 50000);
        const spy = jest.spyOn(CallbackDelivery, "findOneAndUpdate").mockRejectedValueOnce(new Error("db down"));
        await expect(submitClaim(order.orderId, credit.utr)).resolves.toBeTruthy();
        spy.mockRestore();
        expect((await Order.findById(order._id)).status).toBe("success");
    });
});

describe("callbackUrl in Edit Config", () => {
    it("saves and returns the URL, and clears it with null", async () => {
        const { merchant } = await setup({ callbackUrl: null });
        let res = await updateConfig(merchant._id, { callbackUrl: "https://shop.example.com/hook" });
        expect(res.merchant.config.callbackUrl).toBe("https://shop.example.com/hook");
        res = await updateConfig(merchant._id, { callbackUrl: null });
        expect(res.merchant.config.callbackUrl).toBeNull();
    });
});

describe("a full run through createOrder", () => {
    it("delivers to the receiver after a real order is claimed", async () => {
        const { merchant, bank } = await setup();
        const { order } = await createOrder(merchant, "sandbox", { amountPaise: 70000, description: "", customerName: "", merchantOrderId: "INV-1" });
        const credit = await makeCredit(bank, 70000);
        await submitClaim(order.orderId, credit.utr);
        await callbackService.processDueCallbacks();

        expect(hits).toHaveLength(1);
        expect(JSON.parse(hits[0].raw).data).toMatchObject({ orderId: order.orderId, merchantOrderId: "INV-1", status: "success" });
    });
});
