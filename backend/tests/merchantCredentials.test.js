jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);

const request = require("supertest");
const app = require("../app");
const { Merchant, User, AuditLog, MerchantCredential, resetAll } = require("./helpers/mockModels");
const { decrypt } = require("../utils/credentialCrypto");
const { registerMerchant, approve, asMember, issueKey, tokenFor } = require("./helpers/merchantFlow");

const ENC_KEY = "c".repeat(64);

beforeAll(() => { process.env.CREDENTIAL_ENC_KEY = ENC_KEY; });
beforeEach(() => resetAll());
afterEach(() => jest.restoreAllMocks());

// Adds a developer or finance member to a merchant and returns a token for them.
const addMember = async (ownerToken, role, email = `${role}@acme.example`) => {
    const res = await asMember(app, "post", "/api/merchant/team", ownerToken)
        .send({ email, password: "StrongPass123", merchantRole: role });
    expect(res.statusCode).toBe(201);
    return tokenFor(await User.findOne({ email }));
};

describe("issuing credentials", () => {
    test("a pending merchant can create a sandbox key, shown once with no-store caching", async () => {
        const { ownerToken, mid } = await registerMerchant(app);
        const res = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "sandbox" });

        expect(res.statusCode).toBe(201);
        expect(res.body.mid).toBe(mid);
        expect(res.body.secret).toMatch(/^sk_test_[A-Za-z0-9_-]{43}$/);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.credential).toMatchObject({ environment: "sandbox", status: "active", keyHint: `...${res.body.secret.slice(-4)}` });
    });

    test("the secret is stored encrypted and bound to its MID and environment", async () => {
        const { ownerToken, mid } = await registerMerchant(app);
        const { secret } = await issueKey(app, ownerToken, "sandbox");

        const [stored] = await MerchantCredential.find({});
        expect(JSON.stringify(stored)).not.toContain(secret);
        expect(decrypt(stored.secretEnc, `${mid}:sandbox`)).toBe(secret);
        expect(() => decrypt(stored.secretEnc, `${mid}:live`)).toThrow();
        expect(stored.last4).toBe(secret.slice(-4));
    });

    test("live keys are refused until the merchant is approved, then allowed", async () => {
        const { ownerToken, merchant } = await registerMerchant(app);

        const before = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "live" });
        expect(before.statusCode).toBe(403);
        expect(await MerchantCredential.countDocuments({})).toBe(0);

        await approve(app, merchant);
        const after = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "live" });
        expect(after.statusCode).toBe(201);
        expect(after.body.secret).toMatch(/^sk_live_/);
    });

    test("a second key for the same environment gets 409; the other environment is fine", async () => {
        const { ownerToken, merchant } = await registerMerchant(app);
        await approve(app, merchant);

        await issueKey(app, ownerToken, "sandbox");
        const dup = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "sandbox" });
        expect(dup.statusCode).toBe(409);
        expect((await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "live" })).statusCode).toBe(201);
    });

    test("an unknown environment is rejected", async () => {
        const { ownerToken } = await registerMerchant(app);
        const res = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment: "staging" });
        expect(res.statusCode).toBe(400);
    });

    test("rejected and suspended merchants cannot get keys", async () => {
        const rejected = await registerMerchant(app, { email: "r@r.example" });
        await request(app).post(`/api/admin/merchants/${rejected.merchant._id}/reject`)
            .set("Authorization", `Bearer ${require("./helpers/merchantFlow").adminToken()}`).send({ reason: "invalid papers" });

        const res = await asMember(app, "post", "/api/merchant/credentials", rejected.ownerToken).send({ environment: "sandbox" });
        expect(res.statusCode).toBe(403);
    });

    test("listing shows only metadata, never a secret", async () => {
        const { ownerToken } = await registerMerchant(app);
        const { secret } = await issueKey(app, ownerToken);

        const res = await asMember(app, "get", "/api/merchant/credentials", ownerToken);
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(JSON.stringify(res.body)).not.toContain(secret);
        expect(Object.keys(res.body.data[0]).sort()).toEqual(
            ["createdAt", "environment", "expiresAt", "id", "keyHint", "lastUsedAt", "status"]
        );
    });
});

describe("rotating and revoking", () => {
    test("rotation keeps the old key for a grace period and returns a new secret once", async () => {
        const { ownerToken } = await registerMerchant(app);
        const first = await issueKey(app, ownerToken);

        const res = await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken);

        expect(res.statusCode).toBe(201);
        expect(res.body.secret).not.toBe(first.secret);
        expect(res.headers["cache-control"]).toBe("no-store");

        const docs = await MerchantCredential.find({});
        const old = docs.find((d) => String(d._id) === first.credential.id);
        const fresh = docs.find((d) => String(d._id) === res.body.credential.id);
        expect(old.status).toBe("retiring");
        expect(fresh.status).toBe("active");

        const hours = (old.expiresAt - Date.now()) / 3600000;
        expect(hours).toBeGreaterThan(23.9);
        expect(hours).toBeLessThanOrEqual(24);
    });

    test("the grace period is configurable", async () => {
        process.env.CREDENTIAL_ROTATION_GRACE_HOURS = "2";
        try {
            const { ownerToken } = await registerMerchant(app);
            await issueKey(app, ownerToken);
            const res = await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken);
            const hours = (new Date(res.body.previousKeyExpiresAt) - Date.now()) / 3600000;
            expect(hours).toBeGreaterThan(1.9);
            expect(hours).toBeLessThanOrEqual(2);
        } finally {
            delete process.env.CREDENTIAL_ROTATION_GRACE_HOURS;
        }
    });

    test("rotating with no existing key gets 404, and a bad environment 400", async () => {
        const { ownerToken } = await registerMerchant(app);
        expect((await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken)).statusCode).toBe(404);
        expect((await asMember(app, "post", "/api/merchant/credentials/staging/rotate", ownerToken)).statusCode).toBe(400);
    });

    test("if creating the new key fails, the old key is put back", async () => {
        const { ownerToken } = await registerMerchant(app);
        const first = await issueKey(app, ownerToken);
        jest.spyOn(MerchantCredential, "create").mockRejectedValueOnce(new Error("database went away"));
        jest.spyOn(console, "error").mockImplementation(() => {});

        const res = await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken);

        expect(res.statusCode).toBe(500);
        const [only] = await MerchantCredential.find({});
        expect(String(only._id)).toBe(first.credential.id);
        expect(only.status).toBe("active");
        expect(only.expiresAt).toBeNull();
    });

    test("revoking is immediate, and a second revoke gets 404", async () => {
        const { ownerToken } = await registerMerchant(app);
        const { credential } = await issueKey(app, ownerToken);

        const res = await asMember(app, "delete", `/api/merchant/credentials/${credential.id}`, ownerToken);
        expect(res.statusCode).toBe(200);
        expect(res.body.credential.status).toBe("revoked");
        expect((await asMember(app, "delete", `/api/merchant/credentials/${credential.id}`, ownerToken)).statusCode).toBe(404);
    });

    test("a merchant cannot revoke another merchant's key", async () => {
        const a = await registerMerchant(app, { email: "a@a.example" });
        const b = await registerMerchant(app, { email: "b@b.example" });
        const { credential } = await issueKey(app, a.ownerToken);

        const res = await asMember(app, "delete", `/api/merchant/credentials/${credential.id}`, b.ownerToken);

        expect(res.statusCode).toBe(404);
        expect((await MerchantCredential.find({}))[0].status).toBe("active");
    });

    test("an admin can revoke any merchant's key in an emergency, and it is audited", async () => {
        const { ownerToken, merchant } = await registerMerchant(app);
        const { credential } = await issueKey(app, ownerToken);
        const { adminToken } = require("./helpers/merchantFlow");

        const res = await request(app).delete(`/api/admin/merchants/${merchant._id}/credentials/${credential.id}`)
            .set("Authorization", `Bearer ${adminToken()}`);

        expect(res.statusCode).toBe(200);
        expect((await AuditLog.find({ action: "credential.revoked_by_admin" }))).toHaveLength(1);
    });
});

describe("team roles", () => {
    test("finance cannot touch credentials; developer can; neither can manage the team", async () => {
        const { ownerToken } = await registerMerchant(app);
        const developer = await addMember(ownerToken, "developer");
        const finance = await addMember(ownerToken, "finance");

        expect((await asMember(app, "get", "/api/merchant/credentials", finance)).statusCode).toBe(403);
        expect((await asMember(app, "post", "/api/merchant/credentials", finance).send({ environment: "sandbox" })).statusCode).toBe(403);
        expect((await asMember(app, "post", "/api/merchant/credentials", developer).send({ environment: "sandbox" })).statusCode).toBe(201);

        const add = { email: "x@acme.example", password: "StrongPass123", merchantRole: "finance" };
        expect((await asMember(app, "post", "/api/merchant/team", developer).send(add)).statusCode).toBe(403);
        expect((await asMember(app, "post", "/api/merchant/team", finance).send(add)).statusCode).toBe(403);
    });

    test("the owner can add members but not a second owner", async () => {
        const { ownerToken } = await registerMerchant(app);
        const res = await asMember(app, "post", "/api/merchant/team", ownerToken)
            .send({ email: "boss@acme.example", password: "StrongPass123", merchantRole: "owner" });
        expect(res.statusCode).toBe(400);
    });

    test("a duplicate email gets 409", async () => {
        const { ownerToken } = await registerMerchant(app);
        await addMember(ownerToken, "developer");
        const res = await asMember(app, "post", "/api/merchant/team", ownerToken)
            .send({ email: "developer@acme.example", password: "StrongPass123", merchantRole: "finance" });
        expect(res.statusCode).toBe(409);
    });

    test("members are listed, and the owner cannot be removed", async () => {
        const { ownerToken, owner } = await registerMerchant(app);
        await addMember(ownerToken, "developer");

        const list = await asMember(app, "get", "/api/merchant/team", ownerToken);
        expect(list.body.data.map((m) => m.merchantRole)).toEqual(["owner", "developer"]);
        expect(JSON.stringify(list.body)).not.toContain("password");

        const res = await asMember(app, "delete", `/api/merchant/team/${owner._id}`, ownerToken);
        expect(res.statusCode).toBe(400);
    });

    test("a removed member loses access immediately, even with an unexpired token", async () => {
        const { ownerToken } = await registerMerchant(app);
        const developer = await addMember(ownerToken, "developer");
        const member = await User.findOne({ email: "developer@acme.example" });
        expect((await asMember(app, "get", "/api/merchant/me", developer)).statusCode).toBe(200);

        await asMember(app, "delete", `/api/merchant/team/${member._id}`, ownerToken);

        expect((await asMember(app, "get", "/api/merchant/me", developer)).statusCode).toBe(403);
    });

    test("members of one merchant cannot see or remove another merchant's team", async () => {
        const a = await registerMerchant(app, { email: "a@a.example" });
        const b = await registerMerchant(app, { email: "b@b.example" });
        await addMember(a.ownerToken, "developer", "dev@a.example");
        const victim = await User.findOne({ email: "dev@a.example" });

        const res = await asMember(app, "delete", `/api/merchant/team/${victim._id}`, b.ownerToken);

        expect(res.statusCode).toBe(404);
        expect(await User.findOne({ email: "dev@a.example" })).not.toBeNull();
        const list = await asMember(app, "get", "/api/merchant/team", b.ownerToken);
        expect(list.body.data).toHaveLength(1);
    });
});

describe("merchant account endpoints", () => {
    test("/me reports what the account may do", async () => {
        const { ownerToken, merchant } = await registerMerchant(app);

        const pending = await asMember(app, "get", "/api/merchant/me", ownerToken);
        expect(pending.body.capabilities).toEqual({ sandbox: true, live: false });
        expect(pending.body.teamRole).toBe("owner");

        await approve(app, merchant);
        const active = await asMember(app, "get", "/api/merchant/me", ownerToken);
        expect(active.body.capabilities).toEqual({ sandbox: true, live: true });
    });

    test("non-merchant accounts cannot use the merchant dashboard API", async () => {
        const { userToken, adminToken } = require("./helpers/merchantFlow");
        expect((await request(app).get("/api/merchant/me")).statusCode).toBe(401);
        expect((await request(app).get("/api/merchant/me").set("Authorization", `Bearer ${userToken()}`)).statusCode).toBe(403);
        expect((await request(app).get("/api/merchant/me").set("Authorization", `Bearer ${adminToken()}`)).statusCode).toBe(403);
    });
});

describe("audit trail", () => {
    test("key events are recorded and no entry ever contains a secret", async () => {
        const { ownerToken } = await registerMerchant(app);
        const first = await issueKey(app, ownerToken);
        const rotated = await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken);
        await asMember(app, "delete", `/api/merchant/credentials/${first.credential.id}`, ownerToken);

        const actions = (await AuditLog.find({})).map((l) => l.action);
        expect(actions).toEqual(expect.arrayContaining(["merchant.signup", "credential.issued", "credential.rotated", "credential.revoked"]));

        const everything = JSON.stringify(await AuditLog.find({}));
        expect(everything).not.toContain(first.secret);
        expect(everything).not.toContain(rotated.body.secret);
        expect(everything).not.toContain("StrongPass123");
    });

    test("the owner sees only their own merchant's entries; other roles are refused", async () => {
        const a = await registerMerchant(app, { email: "a@a.example" });
        const b = await registerMerchant(app, { email: "b@b.example" });
        await issueKey(app, a.ownerToken);
        await issueKey(app, b.ownerToken);
        const developer = await addMember(a.ownerToken, "developer");

        const res = await asMember(app, "get", "/api/merchant/audit-logs", a.ownerToken);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data.every((log) => log.merchantId === String(a.merchant._id))).toBe(true);

        expect((await asMember(app, "get", "/api/merchant/audit-logs", developer)).statusCode).toBe(403);
    });
});

test("the Merchant model is untouched by key operations", async () => {
    const { ownerToken, merchant } = await registerMerchant(app);
    await issueKey(app, ownerToken);
    expect((await Merchant.findById(merchant._id)).status).toBe("pending");
});
