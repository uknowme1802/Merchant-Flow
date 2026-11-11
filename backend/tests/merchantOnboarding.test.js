jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);

const request = require("supertest");
const app = require("../app");
const { Merchant, User, AuditLog, MerchantCredential, resetAll } = require("./helpers/mockModels");
const { validSignup, registerMerchant, approve, adminToken, userToken, tokenFor, asMember } = require("./helpers/merchantFlow");

beforeEach(() => resetAll());
afterEach(() => jest.restoreAllMocks());

describe("merchant sign-up", () => {
    test("creates a pending merchant and its owner login", async () => {
        const res = await request(app).post("/api/merchant/signup").send(validSignup());

        expect(res.statusCode).toBe(201);
        expect(res.body.merchant).toEqual({
            mid: expect.stringMatching(/^mid_[a-z0-9]{12}$/),
            businessName: "Acme Traders",
            status: "pending"
        });

        const merchant = await Merchant.findOne({ mid: res.body.merchant.mid });
        expect(merchant.status).toBe("pending");
        expect(merchant.kyc.status).toBe("submitted");

        const owner = await User.findOne({ email: "owner@acme.example" });
        expect(owner.role).toBe("merchant");
        expect(owner.merchantRole).toBe("owner");
        expect(String(owner.merchantId)).toBe(String(merchant._id));
    });

    test("the password is stored hashed and never returned", async () => {
        const res = await request(app).post("/api/merchant/signup").send(validSignup());
        const owner = await User.findOne({ email: "owner@acme.example" });

        expect(owner.password).not.toBe("StrongPass123");
        expect(owner.password).toMatch(/^\$2[aby]\$/);
        expect(JSON.stringify(res.body)).not.toContain("StrongPass123");
        expect(JSON.stringify(res.body)).not.toContain(owner.password);
    });

    test("normalises the email and country", async () => {
        await request(app).post("/api/merchant/signup").send(validSignup({ email: "Owner@ACME.example", country: "in" }));
        const merchant = (await Merchant.find({}))[0];
        expect(merchant.contactEmail).toBe("owner@acme.example");
        expect(merchant.country).toBe("IN");
    });

    test("ignores fields a caller must not control (no mass assignment)", async () => {
        const res = await request(app).post("/api/merchant/signup")
            .send(validSignup({ status: "active", role: "admin", mid: "mid_chosenbyme1", merchantRole: "owner" }));

        expect(res.statusCode).toBe(201);
        expect(res.body.merchant.status).toBe("pending");
        expect(res.body.merchant.mid).not.toBe("mid_chosenbyme1");
        expect((await User.findOne({ email: "owner@acme.example" })).role).toBe("merchant");
    });

    test("writes an audit entry", async () => {
        await request(app).post("/api/merchant/signup").send(validSignup());
        const logs = await AuditLog.find({ action: "merchant.signup" });
        expect(logs).toHaveLength(1);
        expect(logs[0].metadata.businessName).toBe("Acme Traders");
    });

    test.each([
        ["a weak password", { password: "short" }],
        ["a bad email", { email: "not-an-email" }],
        ["a bad business type", { businessType: "pirate" }],
        ["a bad phone number", { contactPhone: "abc" }],
        ["a missing business name", { businessName: "" }],
        ["a missing KYC block", { kyc: undefined }],
        ["a missing registration number", { kyc: { address: "12 Market Road, Mumbai" } }],
        ["a bad website", { website: "javascript:alert(1)" }]
    ])("rejects %s and creates nothing", async (_label, overrides) => {
        const res = await request(app).post("/api/merchant/signup").send(validSignup(overrides));

        expect(res.statusCode).toBe(400);
        expect(await Merchant.countDocuments({})).toBe(0);
        expect(await User.countDocuments({})).toBe(0);
    });

    test("an email that is already registered gets 409 and leaves no second merchant", async () => {
        await registerMerchant(app);
        const res = await request(app).post("/api/merchant/signup").send(validSignup({ businessName: "Other Co" }));

        expect(res.statusCode).toBe(409);
        expect(await Merchant.countDocuments({})).toBe(1);
    });

    test("removes the merchant again if creating its owner login fails", async () => {
        jest.spyOn(User, "create").mockRejectedValueOnce(new Error("database went away"));
        jest.spyOn(console, "error").mockImplementation(() => {});

        const res = await request(app).post("/api/merchant/signup").send(validSignup());

        expect(res.statusCode).toBe(500);
        expect(await Merchant.countDocuments({})).toBe(0);
    });

    test("retries with a new MID if one collides", async () => {
        jest.spyOn(Merchant, "create").mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));

        const res = await request(app).post("/api/merchant/signup").send(validSignup());

        expect(res.statusCode).toBe(201);
        expect(await Merchant.countDocuments({})).toBe(1);
    });
});

describe("admin: merchant review queue", () => {
    const asAdmin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);

    test("lists merchants, filterable by status", async () => {
        const a = await registerMerchant(app, { email: "a@a.example", businessName: "Alpha Foods" });
        await registerMerchant(app, { email: "b@b.example", businessName: "Beta Books" });
        await approve(app, a.merchant);

        const all = await asAdmin("get", "/api/admin/merchants");
        expect(all.body.total).toBe(2);

        const pending = await asAdmin("get", "/api/admin/merchants?status=pending");
        expect(pending.body.data.map((m) => m.businessName)).toEqual(["Beta Books"]);
    });

    test("search matches name, email or MID, ignoring case", async () => {
        const a = await registerMerchant(app, { email: "a@a.example", businessName: "Alpha Foods" });
        await registerMerchant(app, { email: "b@b.example", businessName: "Beta Books" });

        const byName = await asAdmin("get", "/api/admin/merchants?search=alpha");
        expect(byName.body.data).toHaveLength(1);
        const byMid = await asAdmin("get", `/api/admin/merchants?search=${a.mid}`);
        expect(byMid.body.data).toHaveLength(1);
    });

    test("regular-expression characters in a search are treated as plain text", async () => {
        await registerMerchant(app);
        const res = await asAdmin("get", "/api/admin/merchants?search=" + encodeURIComponent("Acme (.*"));
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    test("an unknown status filter is rejected", async () => {
        expect((await asAdmin("get", "/api/admin/merchants?status=hacked")).statusCode).toBe(400);
    });

    test("is closed to everyone but admins", async () => {
        const { ownerToken, merchant } = await registerMerchant(app);

        expect((await request(app).get("/api/admin/merchants")).statusCode).toBe(401);
        expect((await request(app).get("/api/admin/merchants").set("Authorization", `Bearer ${userToken()}`)).statusCode).toBe(403);
        expect((await asMember(app, "get", "/api/admin/merchants", ownerToken)).statusCode).toBe(403);
        expect((await asMember(app, "post", `/api/admin/merchants/${merchant._id}/approve`, ownerToken).send({})).statusCode).toBe(403);
        expect(merchant.status).toBe("pending");
    });

    test("shows one merchant with its credential metadata", async () => {
        const { merchant } = await registerMerchant(app);
        const res = await asAdmin("get", `/api/admin/merchants/${merchant._id}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.merchant.mid).toBe(merchant.mid);
        expect(res.body.credentials).toEqual([]);
        expect(res.body.merchant.kyc.registrationNumber).toBe("U12345MH2020PTC000001");
    });

    test("a malformed or unknown id gets a clean 400 or 404", async () => {
        expect((await asAdmin("get", "/api/admin/merchants/not-an-id")).statusCode).toBe(400);
        expect((await asAdmin("get", `/api/admin/merchants/${"c".repeat(24)}`)).statusCode).toBe(404);
    });
});

describe("admin: approval decisions", () => {
    const decide = (merchant, action, body = {}) =>
        request(app).post(`/api/admin/merchants/${merchant._id}/${action}`)
            .set("Authorization", `Bearer ${adminToken()}`).send(body);

    test("approve activates the merchant, approves KYC and is audited", async () => {
        const { merchant } = await registerMerchant(app);
        const res = await decide(merchant, "approve", { reason: "documents look fine" });

        expect(res.statusCode).toBe(200);
        expect(res.body.merchant.status).toBe("active");
        expect(res.body.merchant.kyc.status).toBe("approved");
        expect(merchant.statusChangedBy).toBe("a".repeat(24));

        const [log] = await AuditLog.find({ action: "merchant.approved" });
        expect(log.metadata).toMatchObject({ from: "pending", to: "active", reason: "documents look fine" });
        expect(log.actorType).toBe("admin");
    });

    test("reject needs a reason, then records it", async () => {
        const { merchant } = await registerMerchant(app);

        expect((await decide(merchant, "reject")).statusCode).toBe(400);
        expect(merchant.status).toBe("pending");

        const res = await decide(merchant, "reject", { reason: "registration number invalid" });
        expect(res.body.merchant).toMatchObject({ status: "rejected", statusReason: "registration number invalid" });
        expect(res.body.merchant.kyc).toMatchObject({ status: "rejected", reviewNote: "registration number invalid" });
    });

    test("suspend needs a reason and only works on an active merchant", async () => {
        const { merchant } = await registerMerchant(app);

        expect((await decide(merchant, "suspend", { reason: "too early" })).statusCode).toBe(409);
        await decide(merchant, "approve");
        expect((await decide(merchant, "suspend")).statusCode).toBe(400);
        const res = await decide(merchant, "suspend", { reason: "chargeback spike" });
        expect(res.body.merchant.status).toBe("suspended");
    });

    test("reactivate only works on a suspended merchant", async () => {
        const { merchant } = await registerMerchant(app);
        await decide(merchant, "approve");

        expect((await decide(merchant, "reactivate")).statusCode).toBe(409);
        await decide(merchant, "suspend", { reason: "review" });
        const res = await decide(merchant, "reactivate");
        expect(res.body.merchant.status).toBe("active");
    });

    test.each([
        ["approve an already active merchant", ["approve"], "approve"],
        ["approve a rejected merchant", ["reject"], "approve"],
        ["approve a suspended merchant (that is reactivate)", ["approve", "suspend"], "approve"],
        ["reject an active merchant", ["approve"], "reject"]
    ])("refuses to %s", async (_label, setup, attempt) => {
        const { merchant } = await registerMerchant(app);
        for (const step of setup) await decide(merchant, step, { reason: "setup reason" });

        const before = merchant.status;
        const res = await decide(merchant, attempt, { reason: "should not work" });

        expect(res.statusCode).toBe(409);
        expect(merchant.status).toBe(before);
    });

    test("an unknown merchant gets 404", async () => {
        const res = await request(app).post(`/api/admin/merchants/${"d".repeat(24)}/approve`)
            .set("Authorization", `Bearer ${adminToken()}`).send({});
        expect(res.statusCode).toBe(404);
    });

    test("the audit log can be read by admins only, and filtered", async () => {
        const { merchant } = await registerMerchant(app);
        await decide(merchant, "approve");

        const res = await request(app).get("/api/admin/audit-logs?action=merchant.approved")
            .set("Authorization", `Bearer ${adminToken()}`);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0].action).toBe("merchant.approved");

        const denied = await request(app).get("/api/admin/audit-logs").set("Authorization", `Bearer ${tokenFor({ _id: "x", email: "u@u.com", role: "user" })}`);
        expect(denied.statusCode).toBe(403);
    });
});

// Keeps the unused-import linter quiet and documents that credentials start empty.
test("a new merchant has no credentials", async () => {
    await registerMerchant(app);
    expect(await MerchantCredential.countDocuments({})).toBe(0);
});
