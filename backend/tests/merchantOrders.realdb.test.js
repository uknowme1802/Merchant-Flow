// The merchant's own view of its orders and cards, against a real (in-memory) MongoDB: scoped to
// the logged-in merchant and its current mode, the account number masked, resend by role.

process.env.CREDENTIAL_ENC_KEY = "c".repeat(64);

jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());

const http = require("http");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const db = require("./helpers/realDb");
const app = require("../app");
const User = require("../models/User");
const Merchant = require("../models/Merchant");
const AuditLog = require("../models/AuditLog");
const { issueCredential } = require("../services/credentialService");
const { computeFee } = require("../utils/fees");
const { userToken } = require("./helpers/merchantFlow");
const { setupMerchantWithBank, makeMerchant, makeOrderOn, nextUtr } = require("./helpers/realFixtures");

jest.setTimeout(60000);

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

let receiver, port, received;
beforeAll(async () => {
    receiver = http.createServer((req, res) => {
        let data = "";
        req.on("data", (c) => { data += c; });
        req.on("end", () => { received.push(JSON.parse(data)); res.statusCode = 200; res.end(); });
    });
    await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
    port = receiver.address().port;
});
afterAll(() => new Promise((r) => receiver.close(r)));
beforeEach(() => { received = []; });

let userSeq = 0;
const memberToken = async (merchant, merchantRole = "owner") => {
    const user = await User.create({
        email: `m${++userSeq}@acme.example`, password: "x".repeat(20), role: "merchant", merchantId: merchant._id, merchantRole
    });
    return jwt.sign({ id: String(user._id), email: user.email, role: "merchant" }, process.env.SECRET, { expiresIn: "15m" });
};
const as = (token, method, path) => request(app)[method](path).set("Authorization", `Bearer ${token}`);

const setup = async () => {
    const { merchant, bank } = await setupMerchantWithBank();
    merchant.config = { ...merchant.config.toObject(), payinBps: 250, callbackUrl: `http://127.0.0.1:${port}/hook` };
    await merchant.save();
    await issueCredential({ merchant, environment: "sandbox", createdBy: null });
    return { merchant, bank };
};

const successOrder = (merchant, bank, amountPaise = 50000) =>
    makeOrderOn(merchant, bank, {
        status: "success", utr: nextUtr(), paidAt: new Date(), amountPaise, payinBps: 250, ...computeFee(amountPaise, 250)
    });

describe("GET /api/merchant/orders", () => {
    it("shows only the logged-in merchant's orders in its current mode, with the account number masked", async () => {
        const { merchant, bank } = await setup();
        const mine = await successOrder(merchant, bank);
        const other = await makeMerchant({ mid: "mid_otherother01" });
        await successOrder(other, bank, 20000);

        const res = await as(await memberToken(merchant), "get", "/api/merchant/orders");
        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.totals.amountPaise).toBe(50000);
        const row = res.body.data[0];
        expect(row.orderId).toBe(mine.orderId);
        expect(row.bank.accountNumber.endsWith(bank.accountNumber.slice(-4))).toBe(true);
        expect(row.bank.accountNumber).not.toBe(bank.accountNumber);
        expect(row.bank.accountNumber).toMatch(/^\*+\d{4}$/);
        expect(row.merchant).toBeUndefined();
        expect(row.statusReason).toBeUndefined();
    });

    it("does not let the browser widen the scope with merchant, bank or mode filters", async () => {
        const { merchant, bank } = await setup();
        await successOrder(merchant, bank);
        const other = await makeMerchant({ mid: "mid_otherother01" });
        await successOrder(other, bank, 20000);

        const res = await as(await memberToken(merchant), "get", `/api/merchant/orders?merchant=${other.mid}&bank=x&mode=production`);
        // Either the unknown keys are refused, or they are ignored; they never show another merchant's order.
        expect([200, 400]).toContain(res.statusCode);
        if (res.statusCode === 200) expect(res.body.total).toBe(1);
    });

    it("hides orders from the merchant's other mode", async () => {
        const { merchant, bank } = await setup();
        await successOrder(merchant, bank);
        await Merchant.updateOne({ _id: merchant._id }, { $set: { mode: "production" } });

        const res = await as(await memberToken(merchant), "get", "/api/merchant/orders");
        expect(res.body.total).toBe(0);
    });

    it("is closed to staff and to people who are not logged in", async () => {
        expect((await as(userToken(), "get", "/api/merchant/orders")).statusCode).toBe(403);
        expect((await request(app).get("/api/merchant/orders")).statusCode).toBe(401);
    });
});

describe("GET /api/merchant/dashboard", () => {
    it("returns the cards for the logged-in merchant only", async () => {
        const { merchant, bank } = await setup();
        await successOrder(merchant, bank, 50000);
        const other = await makeMerchant({ mid: "mid_otherother01" });
        await successOrder(other, bank, 20000);

        const res = await as(await memberToken(merchant, "finance"), "get", "/api/merchant/dashboard");
        expect(res.statusCode).toBe(200);
        expect(res.body.cards.totalPayinPaise).toBe(50000);
        expect(res.body.cards.payinChargesPaise).toBe(1250);
        expect(res.body.merchant.mid).toBe(merchant.mid);
    });

    it("cannot be pointed at another merchant", async () => {
        const { merchant, bank } = await setup();
        const other = await makeMerchant({ mid: "mid_otherother01" });
        await successOrder(other, bank, 20000);

        const res = await as(await memberToken(merchant), "get", `/api/merchant/dashboard?merchant=${other.mid}`);
        expect(res.statusCode === 400 || res.body.cards.totalPayinPaise === 0).toBe(true);
    });
});

describe("POST /api/merchant/orders/:orderId/resend-callback", () => {
    it("lets an owner or developer resend their own order's callback, and audits it", async () => {
        const { merchant, bank } = await setup();
        const order = await successOrder(merchant, bank);

        for (const role of ["owner", "developer"]) {
            const res = await as(await memberToken(merchant, role), "post", `/api/merchant/orders/${order.orderId}/resend-callback`);
            expect(res.statusCode).toBe(200);
            expect(res.body.callback.status).toBe("delivered");
        }
        expect(received.length).toBeGreaterThanOrEqual(1);
        const log = await AuditLog.findOne({ action: "order.callback_resent" });
        expect(log).toMatchObject({ actorType: "merchant_user", merchantId: merchant._id });
    });

    it("refuses finance, and refuses an order that belongs to another merchant", async () => {
        const { merchant, bank } = await setup();
        const order = await successOrder(merchant, bank);
        const other = await makeMerchant({ mid: "mid_otherother01" });
        other.config = { ...other.config.toObject(), callbackUrl: `http://127.0.0.1:${port}/hook` };
        await other.save();

        const finance = await as(await memberToken(merchant, "finance"), "post", `/api/merchant/orders/${order.orderId}/resend-callback`);
        expect(finance.statusCode).toBe(403);

        const crossed = await as(await memberToken(other), "post", `/api/merchant/orders/${order.orderId}/resend-callback`);
        expect(crossed.statusCode).toBe(404);
        expect(received.length).toBe(0);
    });

    it("answers 404 for a malformed order id", async () => {
        const { merchant } = await setup();
        const res = await as(await memberToken(merchant), "post", "/api/merchant/orders/not-an-order/resend-callback");
        expect(res.statusCode).toBe(404);
    });
});
