// Phase 2b HTTP layer, against a real (in-memory) MongoDB: the callback delivery log and resend for
// admins and merchants, and callbackUrl in Edit Config.

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
const callbackService = require("../services/callbackService");
const { issueCredential } = require("../services/credentialService");
const { adminToken, userToken } = require("./helpers/merchantFlow");
const { setupMerchantWithBank, makeOrderOn, nextUtr } = require("./helpers/realFixtures");

jest.setTimeout(60000);

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

let receiver, port, respondWith;
beforeAll(async () => {
    receiver = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.statusCode = respondWith; res.end(); }); });
    await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
    port = receiver.address().port;
});
afterAll(() => new Promise((r) => receiver.close(r)));
beforeEach(() => { respondWith = 200; });

let userSeq = 0;
const memberToken = async (merchant, merchantRole = "owner") => {
    const user = await User.create({
        email: `m${++userSeq}@acme.example`, password: "x".repeat(20), role: "merchant", merchantId: merchant._id, merchantRole
    });
    return jwt.sign({ id: String(user._id), email: user.email, role: "merchant" }, process.env.SECRET, { expiresIn: "15m" });
};

// A merchant with a key, a callback URL and one callback waiting to go out.
const setup = async () => {
    const { merchant, bank } = await setupMerchantWithBank();
    merchant.config = { ...merchant.config.toObject(), callbackUrl: `http://127.0.0.1:${port}/hook` };
    await merchant.save();
    await issueCredential({ merchant, environment: "sandbox", createdBy: null });
    const order = await Order.findOneAndUpdate(
        { _id: (await makeOrderOn(merchant, bank))._id },
        { $set: { status: "success", utr: nextUtr(), paidAt: new Date() } }, { returnDocument: "after" });
    const delivery = await callbackService.enqueueOrderCallback(order);
    return { merchant, bank, order, delivery };
};

const asAdmin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);
const as = (token, method, path) => request(app)[method](path).set("Authorization", `Bearer ${token}`);

describe("admin: GET /api/webhook-events", () => {
    it("lists deliveries with the merchant, and never returns the signed body", async () => {
        const { merchant, delivery } = await setup();
        const res = await asAdmin("get", "/api/webhook-events");

        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
            id: String(delivery._id), status: "pending", event: "order.success", attempts: 0,
            merchant: { mid: merchant.mid, businessName: "Acme Traders" }
        });
        expect(JSON.stringify(res.body)).not.toContain('"body"');
        expect(res.body.data[0].body).toBeUndefined();
    });

    it("filters by status, order and merchant", async () => {
        const { merchant, order } = await setup();
        const other = await setup();
        await callbackService.processDueCallbacks();

        expect((await asAdmin("get", "/api/webhook-events?status=delivered")).body.total).toBe(2);
        expect((await asAdmin("get", "/api/webhook-events?status=failed")).body.total).toBe(0);
        expect((await asAdmin("get", `/api/webhook-events?orderId=${order.orderId}`)).body.total).toBe(1);
        expect((await asAdmin("get", `/api/webhook-events?merchantId=${other.merchant._id}`)).body.total).toBe(1);
        expect(merchant._id).toBeTruthy();
    });

    it("rejects a bad filter with 400", async () => {
        expect((await asAdmin("get", "/api/webhook-events?status=nope")).statusCode).toBe(400);
    });

    it("filters by date range, and rejects an end date before the start", async () => {
        await setup();
        const day = 24 * 60 * 60 * 1000;
        const iso = (offset) => encodeURIComponent(new Date(Date.now() + offset).toISOString());

        expect((await asAdmin("get", `/api/webhook-events?from=${iso(-day)}&to=${iso(day)}`)).body.total).toBe(1);
        expect((await asAdmin("get", `/api/webhook-events?from=${iso(day)}`)).body.total).toBe(0);
        expect((await asAdmin("get", `/api/webhook-events?to=${iso(-day)}`)).body.total).toBe(0);
        expect((await asAdmin("get", `/api/webhook-events?from=${iso(day)}&to=${iso(-day)}`)).statusCode).toBe(400);
    });

    it("is readable by agents, and closed to merchants and anonymous callers", async () => {
        const { merchant } = await setup();
        const agent = await as(userToken(), "get", "/api/webhook-events");
        expect(agent.statusCode).toBe(200);
        expect(agent.body.total).toBe(1);
        expect((await as(await memberToken(merchant), "get", "/api/webhook-events")).statusCode).toBe(403);
        expect((await request(app).get("/api/webhook-events")).statusCode).toBe(401);
    });
});

describe("GET /api/webhook-events/:id/body", () => {
    it("returns the exact message we sent, for agents and admins, without any signature", async () => {
        const { delivery, order } = await setup();
        for (const res of [await asAdmin("get", `/api/webhook-events/${delivery._id}/body`),
            await as(userToken(), "get", `/api/webhook-events/${delivery._id}/body`)]) {
            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({ orderId: order.orderId, event: "order.success" });
            expect(res.body.body).toEqual(JSON.parse(delivery.body));
            expect(res.body.body.data).toMatchObject({ orderId: order.orderId, status: "success", amountPaise: 50000 });
            expect(JSON.stringify(res.body).toLowerCase()).not.toContain("signature");
        }
    });

    it("returns 404 for an unknown id, 400 for a malformed one, and 403 for merchants", async () => {
        const { delivery, merchant } = await setup();
        expect((await asAdmin("get", `/api/webhook-events/${"f".repeat(24)}/body`)).statusCode).toBe(404);
        expect((await asAdmin("get", "/api/webhook-events/not-an-id/body")).statusCode).toBe(400);
        expect((await as(await memberToken(merchant), "get", `/api/webhook-events/${delivery._id}/body`)).statusCode).toBe(403);
    });
});

describe("admin: POST /api/webhook-events/:id/resend", () => {
    it("resends, returns the new state and audits it", async () => {
        const { delivery, merchant } = await setup();
        respondWith = 500;
        await callbackService.processDueCallbacks();

        respondWith = 200;
        const res = await asAdmin("post", `/api/webhook-events/${delivery._id}/resend`).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body.callback).toMatchObject({ status: "delivered", attempts: 1, statusCode: 200 });

        const audit = await AuditLog.findOne({ action: "callback.resent" });
        expect(audit).toBeTruthy();
        expect(String(audit.merchantId)).toBe(String(merchant._id));
    });

    it("returns 404 for an unknown id and 400 for a malformed one", async () => {
        expect((await asAdmin("post", `/api/webhook-events/${"f".repeat(24)}/resend`).send({})).statusCode).toBe(404);
        expect((await asAdmin("post", "/api/webhook-events/not-an-id/resend").send({})).statusCode).toBe(400);
    });

    it("returns 409 for a cancelled callback", async () => {
        const { delivery, merchant } = await setup();
        await callbackService.cancelPendingCallbacks(merchant._id, "sandbox");
        expect((await asAdmin("post", `/api/webhook-events/${delivery._id}/resend`).send({})).statusCode).toBe(409);
    });

    it("is closed to agents", async () => {
        const { delivery } = await setup();
        expect((await as(userToken(), "post", `/api/webhook-events/${delivery._id}/resend`).send({})).statusCode).toBe(403);
    });
});

describe("merchant: /api/merchant/callbacks", () => {
    it("shows a merchant only its own callbacks in its current mode", async () => {
        const mine = await setup();
        await setup(); // another merchant's
        await CallbackDelivery.create({
            merchantId: mine.merchant._id, orderId: mine.merchant._id, orderPublicId: "ord_prodprodprodprod",
            mode: "production", event: "order.success", url: "https://x.example", body: "{}", maxAttempts: 10
        });

        const res = await as(await memberToken(mine.merchant, "finance"), "get", "/api/merchant/callbacks");
        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0].orderId).toBe(mine.order.orderId);
    });

    it("ignores merchantId and mode in the query: they cannot widen the view", async () => {
        const mine = await setup();
        const other = await setup();
        const res = await as(await memberToken(mine.merchant), "get", `/api/merchant/callbacks?merchantId=${other.merchant._id}&mode=production`);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0].orderId).toBe(mine.order.orderId);
    });

    it("lets an owner or developer resend, and refuses finance", async () => {
        const { merchant, delivery } = await setup();
        const url = `/api/merchant/callbacks/${delivery._id}/resend`;

        expect((await as(await memberToken(merchant, "finance"), "post", url).send({})).statusCode).toBe(403);
        const res = await as(await memberToken(merchant, "developer"), "post", url).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body.callback.status).toBe("delivered");
        expect((await as(await memberToken(merchant, "owner"), "post", url).send({})).statusCode).toBe(200);
    });

    it("returns 404, not 403, when a merchant resends another merchant's callback", async () => {
        const mine = await setup();
        const theirs = await setup();
        const res = await as(await memberToken(mine.merchant), "post", `/api/merchant/callbacks/${theirs.delivery._id}/resend`).send({});
        expect(res.statusCode).toBe(404);
        expect((await CallbackDelivery.findById(theirs.delivery._id)).attempts).toBe(0);
    });

    it("is closed to admins and anonymous callers", async () => {
        expect((await asAdmin("get", "/api/merchant/callbacks")).statusCode).toBe(403);
        expect((await request(app).get("/api/merchant/callbacks")).statusCode).toBe(401);
    });
});

describe("PATCH /api/admin/merchants/:id/config with callbackUrl", () => {
    it("saves a callback URL, shows it back and audits the change", async () => {
        const { merchant } = await setup();
        const res = await asAdmin("patch", `/api/admin/merchants/${merchant._id}/config`).send({ callbackUrl: "https://shop.example.com/hook" });
        expect(res.statusCode).toBe(200);
        expect(res.body.merchant.config.callbackUrl).toBe("https://shop.example.com/hook");

        const audit = await AuditLog.findOne({ action: "merchant.config_updated" });
        expect(audit.metadata.after.callbackUrl).toBe("https://shop.example.com/hook");
    });

    it("clears it with null", async () => {
        const { merchant } = await setup();
        const res = await asAdmin("patch", `/api/admin/merchants/${merchant._id}/config`).send({ callbackUrl: null });
        expect(res.body.merchant.config.callbackUrl).toBeNull();
    });

    it.each(["ftp://shop.example.com", "not a url", "javascript:alert(1)"])("rejects %s with 400", async (callbackUrl) => {
        const { merchant } = await setup();
        expect((await asAdmin("patch", `/api/admin/merchants/${merchant._id}/config`).send({ callbackUrl })).statusCode).toBe(400);
    });
});
