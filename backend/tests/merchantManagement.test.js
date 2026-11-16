jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/authRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);

const request = require("supertest");
const app = require("../app");
const { Merchant, User, AuditLog, MerchantCredential, resetAll } = require("./helpers/mockModels");
const { registerMerchant, approve, adminToken, userToken } = require("./helpers/merchantFlow");
const { generateTempPassword } = require("../utils/identifiers");

beforeEach(() => resetAll());
afterEach(() => jest.restoreAllMocks());

const body = (overrides = {}) => ({
    businessName: "Acme Traders",
    businessType: "company",
    contactName: "Asha Rao",
    contactPhone: "+91 98765 43210",
    email: "owner@acme.example",
    username: "acme_owner",
    mode: "sandbox",
    kyc: { registrationNumber: "U12345MH2020PTC000001", address: "12 Market Road, Mumbai" },
    ...overrides
});

const admin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);
const create = (overrides) => admin("post", "/api/admin/merchants").send(body(overrides));
const login = (identifier, password) => request(app).post("/api/auth/login").send({ email: identifier, password });

describe("temporary passwords", () => {
    test("are 16 characters with an upper case letter, a lower case letter and a digit", () => {
        for (let i = 0; i < 50; i++) {
            const pw = generateTempPassword();
            expect(pw).toHaveLength(16);
            expect(pw).toMatch(/[A-Z]/);
            expect(pw).toMatch(/[a-z]/);
            expect(pw).toMatch(/[0-9]/);
        }
        expect(generateTempPassword()).not.toBe(generateTempPassword());
    });
});

describe("admin creates a merchant", () => {
    test("creates an approved merchant with a one-time temporary password", async () => {
        const res = await create();

        expect(res.statusCode).toBe(201);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.temporaryPassword).toHaveLength(16);
        expect(res.body.username).toBe("acme_owner");
        expect(res.body.merchant).toMatchObject({ status: "active", mode: "sandbox", businessName: "Acme Traders" });
        expect(res.body.merchant.mid).toMatch(/^mid_[a-z0-9]{12}$/);

        const owner = await User.findOne({ username: "acme_owner" });
        expect(owner.role).toBe("merchant");
        expect(owner.merchantRole).toBe("owner");
        expect(owner.mustChangePassword).toBe(true);
        expect(owner.password).not.toBe(res.body.temporaryPassword);
    });

    test("the mode is chosen at creation", async () => {
        const res = await create({ mode: "production" });
        expect(res.body.merchant.mode).toBe("production");
        expect((await create({ email: "x@y.example", username: "other_one", mode: "bogus" })).statusCode).toBe(400);
    });

    test("only admins can create merchants", async () => {
        const res = await request(app).post("/api/admin/merchants")
            .set("Authorization", `Bearer ${userToken()}`).send(body());
        expect(res.statusCode).toBe(403);
    });

    test("a duplicate email or username is a 409 and leaves nothing behind", async () => {
        await create();
        expect((await create({ username: "someone_else" })).statusCode).toBe(409);
        expect((await create({ email: "new@acme.example" })).statusCode).toBe(409);
        expect(await Merchant.countDocuments({})).toBe(1);
        expect(await User.countDocuments({})).toBe(1);
    });

    test.each([["too short", "ab"], ["upper case is lowered, but spaces are not allowed", "a b c"], ["symbols", "bad-name!"]])(
        "rejects a username that is %s", async (_l, username) => {
            expect((await create({ username })).statusCode).toBe(400);
        });

    test("the password is never written to the audit log", async () => {
        const res = await create();
        const entries = AuditLog.__docs();
        expect(entries.map((e) => e.action)).toContain("merchant.created_by_admin");
        expect(JSON.stringify(entries)).not.toContain(res.body.temporaryPassword);
    });
});

describe("login with a temporary password", () => {
    const setup = async () => {
        const res = await create();
        return { password: res.body.temporaryPassword, merchant: res.body.merchant };
    };

    test("works with the username or the email, and reports mustChangePassword", async () => {
        const { password } = await setup();

        const byName = await login("acme_owner", password);
        expect(byName.statusCode).toBe(200);
        expect(byName.body.mustChangePassword).toBe(true);
        expect(byName.body.user.username).toBe("acme_owner");

        expect((await login("OWNER@acme.example", password)).statusCode).toBe(200);
        expect((await login("acme_owner", "wrong")).statusCode).toBe(401);
    });

    test("nothing else works until the password is changed", async () => {
        const { password } = await setup();
        const { body: session } = await login("acme_owner", password);

        const blocked = await request(app).get("/api/merchant/me").set("Authorization", `Bearer ${session.accessToken}`);
        expect(blocked.statusCode).toBe(403);
        expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");

        const changed = await request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${session.accessToken}`)
            .send({ currentPassword: password, newPassword: "BrandNewPass9" });
        expect(changed.statusCode).toBe(200);

        const ok = await request(app).get("/api/merchant/me").set("Authorization", `Bearer ${changed.body.accessToken}`);
        expect(ok.statusCode).toBe(200);

        // The old token and the old password no longer work, the new password does.
        expect((await login("acme_owner", password)).statusCode).toBe(401);
        const again = await login("acme_owner", "BrandNewPass9");
        expect(again.body.mustChangePassword).toBe(false);
    });

    test("the new password must differ and the current one must be right", async () => {
        const { password } = await setup();
        const { body: session } = await login("acme_owner", password);
        const call = (data) => request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${session.accessToken}`).send(data);

        expect((await call({ currentPassword: "nope", newPassword: "BrandNewPass9" })).statusCode).toBe(401);
        expect((await call({ currentPassword: password, newPassword: password })).statusCode).toBe(400);
        expect((await call({ currentPassword: password, newPassword: "short" })).statusCode).toBe(400);
    });
});

describe("Edit Config", () => {
    const patch = (id, data) => admin("patch", `/api/admin/merchants/${id}/config`).send(data);

    test("saves settings and audits the old and new values", async () => {
        const { body: created } = await create();
        const id = created.merchant.id;

        const res = await patch(id, { payinBps: 250, settlementDays: 2, minAmountPaise: 10000, maxAmountPaise: 500000, webhookAutoTrigger: false, remark: "VIP" });
        expect(res.statusCode).toBe(200);
        expect(res.body.merchant.config).toMatchObject({ payinBps: 250, settlementDays: 2, minAmountPaise: 10000, maxAmountPaise: 500000, webhookAutoTrigger: false });
        expect(res.body.merchant.remark).toBe("VIP");

        const entry = AuditLog.__docs().find((e) => e.action === "merchant.config_updated");
        expect(entry.metadata.before.payinBps).toBe(0);
        expect(entry.metadata.after.payinBps).toBe(250);
    });

    test("an untouched field keeps its value", async () => {
        const { body: created } = await create();
        await patch(created.merchant.id, { payinBps: 300 });
        const res = await patch(created.merchant.id, { settlementDays: 0 });
        expect(res.body.merchant.config).toMatchObject({ payinBps: 300, settlementDays: 0 });
    });

    test.each([
        ["a charge above 100%", { payinBps: 10001 }],
        ["a negative charge", { settlementBps: -1 }],
        ["a fractional basis point", { payinBps: 2.5 }],
        ["a settlement cycle above 30 days", { settlementDays: 31 }],
        ["min above max", { minAmountPaise: 9000, maxAmountPaise: 100 }],
        ["a remark over 200 characters", { remark: "x".repeat(201) }],
        ["an empty update", {}]
    ])("rejects %s", async (_l, data) => {
        const { body: created } = await create();
        expect((await patch(created.merchant.id, data)).statusCode).toBe(400);
    });

    test("min is checked against the stored max, not only the same request", async () => {
        const { body: created } = await create();
        await patch(created.merchant.id, { maxAmountPaise: 1000 });
        expect((await patch(created.merchant.id, { minAmountPaise: 5000 })).statusCode).toBe(400);
    });

    test("unknown merchant is a 404 and non-admins are refused", async () => {
        expect((await patch("d".repeat(24), { payinBps: 1 })).statusCode).toBe(404);
        const { body: created } = await create();
        const res = await request(app).patch(`/api/admin/merchants/${created.merchant.id}/config`)
            .set("Authorization", `Bearer ${userToken()}`).send({ payinBps: 1 });
        expect(res.statusCode).toBe(403);
    });
});

describe("reset password", () => {
    test("issues a new temporary password, signs the user out and forces a change", async () => {
        const { body: created } = await create();
        const first = created.temporaryPassword;
        const owner = await User.findOne({ username: "acme_owner" });
        owner.refreshToken = "old-refresh-token";

        const res = await admin("post", `/api/admin/merchants/${created.merchant.id}/reset-password`).send({});
        expect(res.statusCode).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.temporaryPassword).toHaveLength(16);
        expect(res.body.temporaryPassword).not.toBe(first);
        expect(owner.refreshToken).toBeNull();
        expect(owner.mustChangePassword).toBe(true);

        expect((await login("acme_owner", first)).statusCode).toBe(401);
        expect((await login("acme_owner", res.body.temporaryPassword)).statusCode).toBe(200);
        expect(JSON.stringify(AuditLog.__docs())).not.toContain(res.body.temporaryPassword);
    });

    test("a user from another merchant cannot be targeted", async () => {
        const { body: a } = await create();
        const { body: b } = await create({ email: "b@acme.example", username: "other_owner" });
        const bOwner = await User.findOne({ username: "other_owner" });

        const res = await admin("post", `/api/admin/merchants/${a.merchant.id}/reset-password`).send({ userId: String(bOwner._id) });
        expect(res.statusCode).toBe(404);
        expect(b.merchant.id).not.toBe(a.merchant.id);
    });
});

describe("the Keys action", () => {
    const keys = (id) => admin("post", `/api/admin/merchants/${id}/credentials`).send();

    test("generates a key for the current mode, shown once", async () => {
        const { body: created } = await create();
        const res = await keys(created.merchant.id);

        expect(res.statusCode).toBe(201);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.secret).toMatch(/^sk_test_/);
        expect(res.body.regenerated).toBe(false);
        expect(res.body.credential.keyHint).toBe(`...${res.body.secret.slice(-4)}`);

        const detail = await admin("get", `/api/admin/merchants/${created.merchant.id}`);
        expect(JSON.stringify(detail.body)).not.toContain(res.body.secret);
        expect(JSON.stringify(AuditLog.__docs())).not.toContain(res.body.secret);
    });

    test("a second call regenerates: new secret, old key kept for the grace period", async () => {
        const { body: created } = await create();
        const first = await keys(created.merchant.id);
        const second = await keys(created.merchant.id);

        expect(second.body.regenerated).toBe(true);
        expect(second.body.secret).not.toBe(first.body.secret);
        expect(second.body.previousKeyExpiresAt).toBeTruthy();

        const statuses = MerchantCredential.__docs().map((c) => c.status).sort();
        expect(statuses).toEqual(["active", "retiring"]);
    });

    test("a pending merchant can get a sandbox key", async () => {
        const { merchant } = await registerMerchant(app);
        const res = await keys(merchant._id);
        expect(res.statusCode).toBe(201);
        expect(res.body.secret).toMatch(/^sk_test_/);
    });

    test("only admins, and unknown merchants are a 404", async () => {
        expect((await keys("d".repeat(24))).statusCode).toBe(404);
        const { body: created } = await create();
        const res = await request(app).post(`/api/admin/merchants/${created.merchant.id}/credentials`)
            .set("Authorization", `Bearer ${userToken()}`);
        expect(res.statusCode).toBe(403);
    });
});

describe("switching between sandbox and production", () => {
    const sw = (id, data) => admin("post", `/api/admin/merchants/${id}/switch-mode`).send(data);

    test("moves to production: sandbox key revoked, live key issued once, data hidden by mode", async () => {
        const { body: created } = await create();
        const id = created.merchant.id;
        const sandboxKey = await admin("post", `/api/admin/merchants/${id}/credentials`).send();

        const res = await sw(id, { mode: "production", confirmMid: created.merchant.mid });
        expect(res.statusCode).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.merchant.mode).toBe("production");
        expect(res.body.secret).toMatch(/^sk_live_/);
        expect(res.body.secret).not.toBe(sandboxKey.body.secret);

        const creds = MerchantCredential.__docs();
        expect(creds.find((c) => c.environment === "sandbox").status).toBe("revoked");
        expect(creds.find((c) => c.environment === "live").status).toBe("active");

        const entry = AuditLog.__docs().find((e) => e.action === "merchant.mode_changed");
        expect(entry.metadata).toMatchObject({ from: "sandbox", to: "production" });
        expect(JSON.stringify(AuditLog.__docs())).not.toContain(res.body.secret);
    });

    test("needs the typed MID, an approved merchant and a real change", async () => {
        const { body: created } = await create();
        const id = created.merchant.id;

        expect((await sw(id, { mode: "production", confirmMid: "mid_wrong" })).statusCode).toBe(400);
        expect((await sw(id, { mode: "sandbox", confirmMid: created.merchant.mid })).statusCode).toBe(409);

        const { merchant } = await registerMerchant(app, { email: "pending@acme.example" });
        expect((await sw(merchant._id, { mode: "production", confirmMid: merchant.mid })).statusCode).toBe(409);
        expect((await Merchant.findById(merchant._id)).mode).toBe("sandbox");
    });

    test("moving back to sandbox needs a reason and revokes the live key", async () => {
        const { body: created } = await create({ mode: "production" });
        const id = created.merchant.id;
        await admin("post", `/api/admin/merchants/${id}/credentials`).send();

        expect((await sw(id, { mode: "sandbox", confirmMid: created.merchant.mid })).statusCode).toBe(400);

        const res = await sw(id, { mode: "sandbox", confirmMid: created.merchant.mid, reason: "Back to testing" });
        expect(res.statusCode).toBe(200);
        expect(res.body.secret).toMatch(/^sk_test_/);
        expect(MerchantCredential.__docs().find((c) => c.environment === "live").status).toBe("revoked");
    });

    test("an approved merchant (after review) can switch too", async () => {
        const { merchant } = await registerMerchant(app);
        await approve(app, merchant);
        const res = await sw(merchant._id, { mode: "production", confirmMid: merchant.mid });
        expect(res.statusCode).toBe(200);
    });
});

describe("Merchant List", () => {
    test("shows username, mode, config and two-factor state, and searches by username", async () => {
        await create();
        await create({ email: "b@acme.example", username: "zeta_shop", businessName: "Zeta Shop", mode: "production" });

        const list = await admin("get", "/api/admin/merchants");
        expect(list.body.total).toBe(2);
        const row = list.body.data.find((m) => m.businessName === "Acme Traders");
        expect(row).toMatchObject({ username: "acme_owner", mode: "sandbox", mfaEnabled: false });
        expect(row.config).toMatchObject({ payinBps: 0, settlementDays: 1, webhookAutoTrigger: true });

        const found = await admin("get", "/api/admin/merchants?search=zeta_shop");
        expect(found.body.total).toBe(1);
        expect(found.body.data[0].mode).toBe("production");
    });
});
