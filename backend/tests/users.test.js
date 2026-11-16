jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/authRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);

const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const app = require("../app");
const { User, AuditLog, resetAll } = require("./helpers/mockModels");
const { registerMerchant, tokenFor, userToken } = require("./helpers/merchantFlow");
const sessionRevocation = require("../utils/sessionRevocation");
const { normaliseRole } = require("../constants/roles");

let admin;      // a real admin document, so "yourself" and "the last admin" rules can be tested
let adminAuth;

beforeEach(async () => {
    resetAll();
    sessionRevocation.reset();
    admin = await User.create({
        email: "root@test.com", username: "root", role: "admin", password: await bcrypt.hash("RootPass123", 4)
    });
    adminAuth = `Bearer ${tokenFor(admin)}`;
});
afterEach(() => jest.restoreAllMocks());

const as = (method, path, auth = adminAuth) => request(app)[method](path).set("Authorization", auth);
const create = (overrides = {}) =>
    as("post", "/api/users").send({ username: "asha", email: "asha@test.com", role: "agent", ...overrides });
const login = (identifier, password) => request(app).post("/api/auth/login").send({ email: identifier, password });

describe("the agent role", () => {
    test("a token issued before the rename (role 'user') is read as agent", async () => {
        const old = jwt.sign({ id: "c".repeat(24), email: "old@test.com", role: "user" }, process.env.SECRET);
        const res = await as("get", "/api/users", `Bearer ${old}`);
        // Still not an admin, and the message names the new role.
        expect(res.statusCode).toBe(403);
        expect(normaliseRole("user")).toBe("agent");
        expect(normaliseRole("admin")).toBe("admin");
        expect(normaliseRole("constructor")).toBe("constructor");
    });

    test("a login stored with the old role gets an agent token", async () => {
        await User.create({ email: "legacy@test.com", role: "user", password: await bcrypt.hash("LegacyPass1", 4) });
        const res = await login("legacy@test.com", "LegacyPass1");
        expect(res.statusCode).toBe(200);
        expect(res.body.user.role).toBe("agent");
        expect(jwt.decode(res.body.accessToken).role).toBe("agent");
    });

    test("new users default to agent, and 'user' is no longer accepted", async () => {
        const res = await as("post", "/api/users").send({ username: "plain", email: "plain@test.com" });
        expect(res.statusCode).toBe(201);
        expect(res.body.user.role).toBe("agent");
        expect((await create({ role: "user" })).statusCode).toBe(400);
        expect((await create({ role: "merchant" })).statusCode).toBe(400);
    });
});

describe("creating a user", () => {
    test("returns a one-time temporary password and forces a change at first login", async () => {
        const res = await create();

        expect(res.statusCode).toBe(201);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.temporaryPassword).toHaveLength(16);
        expect(res.body.user).toMatchObject({
            username: "asha", email: "asha@test.com", role: "agent", disabled: false, mfaEnabled: false
        });
        expect(JSON.stringify(res.body.user)).not.toMatch(/password"|refreshToken|secret/);

        const session = await login("asha", res.body.temporaryPassword);
        expect(session.statusCode).toBe(200);
        expect(session.body.mustChangePassword).toBe(true);
    });

    test("a password sent by the client is ignored", async () => {
        const res = await create({ password: "ChosenByClient1" });
        expect(res.statusCode).toBe(201);
        expect((await login("asha", "ChosenByClient1")).statusCode).toBe(401);
    });

    test("the password is never written to the audit log", async () => {
        const res = await create();
        const entries = AuditLog.__docs();
        expect(entries.map((e) => e.action)).toContain("user.created");
        expect(JSON.stringify(entries)).not.toContain(res.body.temporaryPassword);
    });

    test("a duplicate username or email is a 409", async () => {
        await create();
        const sameName = await create({ email: "other@test.com" });
        const sameEmail = await create({ username: "someone_else" });
        expect(sameName.statusCode).toBe(409);
        expect(sameName.body.message).toMatch(/username/i);
        expect(sameEmail.statusCode).toBe(409);
        expect(sameEmail.body.message).toMatch(/email/i);
    });

    test.each([
        ["a missing username", { username: undefined }],
        ["a short username", { username: "ab" }],
        ["a username with symbols", { username: "bad-name!" }],
        ["a bad email", { email: "nope" }]
    ])("rejects %s", async (_label, overrides) => {
        expect((await create(overrides)).statusCode).toBe(400);
    });

    test("only admins can use the Users API", async () => {
        const agent = `Bearer ${userToken()}`;
        expect((await as("get", "/api/users", agent)).statusCode).toBe(403);
        expect((await as("post", "/api/users", agent).send({ username: "x_y", email: "x@y.com" })).statusCode).toBe(403);
        expect((await as("patch", `/api/users/${admin._id}`, agent).send({ disabled: true })).statusCode).toBe(403);
        expect((await as("post", `/api/users/${admin._id}/reset-password`, agent)).statusCode).toBe(403);
        expect((await request(app).get("/api/users")).statusCode).toBe(401);
    });
});

describe("the user list", () => {
    test("is paged and never returns secrets", async () => {
        for (let i = 1; i <= 12; i++) await create({ username: `agent_${i}`, email: `agent${i}@test.com` });

        const first = await as("get", "/api/users?limit=10");
        expect(first.statusCode).toBe(200);
        expect(first.body).toMatchObject({ total: 13, page: 1, limit: 10 });
        expect(first.body.data).toHaveLength(10);
        expect(Object.keys(first.body.data[0]).sort()).toEqual(
            ["createdAt", "disabled", "email", "id", "mfaEnabled", "mfaRequired", "mustChangePassword", "role", "username"]);

        const second = await as("get", "/api/users?limit=10&page=2");
        expect(second.body.data).toHaveLength(3);
        expect((await as("get", "/api/users?limit=500")).statusCode).toBe(400);
    });

    test("searches username and email, literally", async () => {
        await create();
        await create({ username: "ravi", email: "ravi@shop.example" });

        expect((await as("get", "/api/users?search=ASH")).body.data.map((u) => u.username)).toEqual(["asha"]);
        expect((await as("get", "/api/users?search=shop.example")).body.total).toBe(1);
        // A regular expression is not interpreted: ".*" matches nothing.
        expect((await as("get", "/api/users?search=.*")).body.total).toBe(0);
    });

    test("shows whether two-factor is on", async () => {
        const { body } = await create();
        (await User.findById(body.user.id)).twoFactor = { enabled: true, secret: "TOPSECRET" };
        const list = await as("get", "/api/users?search=asha");
        expect(list.body.data[0].mfaEnabled).toBe(true);
        expect(JSON.stringify(list.body)).not.toContain("TOPSECRET");
    });
});

describe("editing a user", () => {
    const patch = (id, data) => as("patch", `/api/users/${id}`).send(data);

    test("changes email and role, and audits the old and new values", async () => {
        const { body } = await create();
        const res = await patch(body.user.id, { email: "Asha.New@test.com", role: "admin" });

        expect(res.statusCode).toBe(200);
        expect(res.body.user).toMatchObject({ email: "asha.new@test.com", role: "admin" });

        const entry = AuditLog.__docs().find((e) => e.action === "user.updated");
        expect(entry.metadata.before).toEqual({ email: "asha@test.com", role: "agent" });
        expect(entry.metadata.after).toEqual({ email: "asha.new@test.com", role: "admin" });
    });

    test("saving the same values changes nothing and writes no audit entry", async () => {
        const { body } = await create();
        const res = await patch(body.user.id, { role: "agent", disabled: false });
        expect(res.statusCode).toBe(200);
        expect(AuditLog.__docs().some((e) => e.action === "user.updated")).toBe(false);
    });

    test("an email or username that is taken is a 409", async () => {
        const { body } = await create();
        expect((await patch(body.user.id, { email: "root@test.com" })).statusCode).toBe(409);
        expect((await patch(body.user.id, { username: "root" })).statusCode).toBe(409);
    });

    test.each([
        ["an empty update", {}],
        ["an unknown role", { role: "owner" }],
        ["the merchant role", { role: "merchant" }],
        ["disabled as text", { disabled: "yes" }]
    ])("rejects %s", async (_label, data) => {
        const { body } = await create();
        expect((await patch(body.user.id, data)).statusCode).toBe(400);
    });

    test("an admin cannot disable or demote themself", async () => {
        expect((await patch(admin._id, { disabled: true })).statusCode).toBe(400);
        expect((await patch(admin._id, { role: "agent" })).statusCode).toBe(400);
        expect(admin.disabled).toBeFalsy();
        expect(admin.role).toBe("admin");
    });

    test("the last active admin cannot be disabled or demoted", async () => {
        // A second admin acts on the first, while the second is itself disabled in the database:
        // the first is then the only admin who can still log in.
        const second = await User.create({ email: "two@test.com", role: "admin", password: "x", disabled: true });
        const auth = `Bearer ${tokenFor(second)}`;

        expect((await as("patch", `/api/users/${admin._id}`, auth).send({ disabled: true })).statusCode).toBe(409);
        expect((await as("patch", `/api/users/${admin._id}`, auth).send({ role: "agent" })).statusCode).toBe(409);

        // With another active admin it is allowed.
        second.disabled = false;
        expect((await as("patch", `/api/users/${admin._id}`, auth).send({ role: "agent" })).statusCode).toBe(200);
    });

    test("merchant logins are read-only here", async () => {
        const { owner } = await registerMerchant(app);
        expect((await patch(owner._id, { disabled: true })).statusCode).toBe(409);
        expect((await as("post", `/api/users/${owner._id}/reset-password`)).statusCode).toBe(409);
        expect((await patch("d".repeat(24), { disabled: true })).statusCode).toBe(404);
        expect((await patch("not-an-id", { disabled: true })).statusCode).toBe(400);
    });
});

describe("disabling a user", () => {
    const setup = async () => {
        const { body } = await create();
        const first = await login("asha", body.temporaryPassword);
        const changed = await request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${first.body.accessToken}`)
            .send({ currentPassword: body.temporaryPassword, newPassword: "AshaOwnPass9" });
        return { id: body.user.id, ...changed.body };
    };
    const dashboard = (token) => request(app).get("/api/2fa/status").set("Authorization", `Bearer ${token}`);

    test("takes effect at once: the open session, refresh and login all stop", async () => {
        const { id, accessToken, refreshToken } = await setup();
        expect((await dashboard(accessToken)).statusCode).toBe(200);

        const res = await as("patch", `/api/users/${id}`).send({ disabled: true });
        expect(res.body.user.disabled).toBe(true);

        expect((await dashboard(accessToken)).statusCode).toBe(401);
        const refresh = await request(app).post("/api/auth/refresh").send({ token: refreshToken });
        expect(refresh.statusCode).toBe(403);
        const again = await login("asha", "AshaOwnPass9");
        expect(again.statusCode).toBe(403);
        expect(again.body.code).toBe("ACCOUNT_DISABLED");
        expect(again.body.accessToken).toBeUndefined();
    });

    test("a wrong password does not reveal that the account is disabled", async () => {
        const { id } = await setup();
        await as("patch", `/api/users/${id}`).send({ disabled: true });
        const res = await login("asha", "not-the-password");
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBeUndefined();
    });

    test("enabling again lets the user log in, but the old session stays closed", async () => {
        const { id, accessToken } = await setup();
        await as("patch", `/api/users/${id}`).send({ disabled: true });
        await as("patch", `/api/users/${id}`).send({ disabled: false });

        expect((await dashboard(accessToken)).statusCode).toBe(401);
        const again = await login("asha", "AshaOwnPass9");
        expect(again.statusCode).toBe(200);
        expect((await dashboard(again.body.accessToken)).statusCode).toBe(200);
    });

    test("disabled users are blocked again after a restart", async () => {
        const { id, accessToken } = await setup();
        await as("patch", `/api/users/${id}`).send({ disabled: true });

        sessionRevocation.reset();   // what a restart does to the in-memory state
        expect(await sessionRevocation.hydrate(User)).toBe(1);
        expect((await dashboard(accessToken)).statusCode).toBe(401);
    });

    test("a role change signs the user out at once; the next login has the new role", async () => {
        const { id, accessToken, refreshToken } = await setup();
        await as("patch", `/api/users/${id}`).send({ role: "admin" });

        expect((await dashboard(accessToken)).statusCode).toBe(401);
        expect((await request(app).post("/api/auth/refresh").send({ token: refreshToken })).statusCode).toBe(403);

        const again = await login("asha", "AshaOwnPass9");
        expect(again.statusCode).toBe(200);
        expect(again.body.user.role).toBe("admin");
        expect((await as("get", "/api/users", `Bearer ${again.body.accessToken}`)).statusCode).toBe(200);
    });

    test("the session check answers 200 for a live session and 401 once it is ended", async () => {
        const { id, accessToken } = await setup();
        const session = () => request(app).get("/api/auth/session").set("Authorization", `Bearer ${accessToken}`);

        expect((await session()).statusCode).toBe(200);
        await as("patch", `/api/users/${id}`).send({ disabled: true });
        expect((await session()).statusCode).toBe(401);
        expect((await request(app).get("/api/auth/session")).statusCode).toBe(401);
    });
});

describe("resetting a user's password", () => {
    test("issues a new temporary password, signs the user out and forces a change", async () => {
        const { body } = await create();
        const first = await login("asha", body.temporaryPassword);

        const res = await as("post", `/api/users/${body.user.id}/reset-password`);
        expect(res.statusCode).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.temporaryPassword).toHaveLength(16);
        expect(res.body.temporaryPassword).not.toBe(body.temporaryPassword);

        // The old session and the old password are gone.
        const stale = await request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${first.body.accessToken}`)
            .send({ currentPassword: body.temporaryPassword, newPassword: "Whatever123" });
        expect(stale.statusCode).toBe(401);
        expect((await request(app).post("/api/auth/refresh").send({ token: first.body.refreshToken })).statusCode).toBe(403);
        expect((await login("asha", body.temporaryPassword)).statusCode).toBe(401);

        // The new one works straight away, and must be changed.
        const session = await login("asha", res.body.temporaryPassword);
        expect(session.statusCode).toBe(200);
        expect(session.body.mustChangePassword).toBe(true);
        const changed = await request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${session.body.accessToken}`)
            .send({ currentPassword: res.body.temporaryPassword, newPassword: "AshaOwnPass9" });
        expect(changed.statusCode).toBe(200);

        expect(AuditLog.__docs().map((e) => e.action)).toContain("user.password_reset");
        expect(JSON.stringify(AuditLog.__docs())).not.toContain(res.body.temporaryPassword);
    });

    test("an admin cannot reset their own password here, and unknown users are a 404", async () => {
        expect((await as("post", `/api/users/${admin._id}/reset-password`)).statusCode).toBe(400);
        expect((await as("post", `/api/users/${"d".repeat(24)}/reset-password`)).statusCode).toBe(404);
    });
});

describe("login is not case sensitive", () => {
    test("an email stored with capital letters is found, however it is typed", async () => {
        // Rows like this exist from before the application lower-cased emails on save.
        await User.create({ email: "Harsh@admin.com", role: "agent", password: await bcrypt.hash("HarshPass123", 4) });

        for (const typed of ["Harsh@admin.com", "harsh@admin.com", "HARSH@ADMIN.COM"]) {
            const res = await login(typed, "HarshPass123");
            expect(res.statusCode).toBe(200);
            expect(res.body.user.email).toBe("Harsh@admin.com");
        }
        expect((await login("Harsh@admin.com", "wrong-password")).statusCode).toBe(401);
    });

    test("it works after an admin reset, which is where it used to fail", async () => {
        const legacy = await User.create({ email: "Harsh@admin.com", role: "agent", password: "x" });
        const reset = await as("post", `/api/users/${legacy._id}/reset-password`);

        const res = await login("Harsh@admin.com", reset.body.temporaryPassword);
        expect(res.statusCode).toBe(200);
        expect(res.body.mustChangePassword).toBe(true);
    });

    test("a username is matched in any case", async () => {
        const { body } = await create();
        expect((await login("ASHA", body.temporaryPassword)).statusCode).toBe(200);
        expect((await login("Asha", body.temporaryPassword)).statusCode).toBe(200);
    });

    test("the match is exact, not a pattern", async () => {
        await create();
        expect((await login("ash.", "whatever")).statusCode).toBe(401);
        expect((await login(".*", "whatever")).statusCode).toBe(401);
        expect((await login("asha@test.co", "whatever")).statusCode).toBe(401);
    });
});

describe("turning two-factor off for a user", () => {
    const enableMfa = async (id) => { (await User.findById(id)).twoFactor = { enabled: true, secret: "TOPSECRET", tempSecret: null }; };

    test("an admin can turn it off, and it is audited", async () => {
        const { body } = await create();
        await enableMfa(body.user.id);

        const res = await as("post", `/api/users/${body.user.id}/disable-mfa`);
        expect(res.statusCode).toBe(200);
        expect(res.body.user.mfaEnabled).toBe(false);
        expect((await User.findById(body.user.id)).twoFactor).toEqual({ enabled: false, secret: null, tempSecret: null });

        // The user now logs in with the password alone.
        const session = await login("asha", body.temporaryPassword);
        expect(session.body.twoFactorRequired).toBeUndefined();
        expect(session.body.accessToken).toBeTruthy();

        expect(AuditLog.__docs().map((e) => e.action)).toContain("user.mfa_disabled");
        expect(JSON.stringify(AuditLog.__docs())).not.toContain("TOPSECRET");
    });

    test("it cannot be turned on, used on yourself, or used on a merchant login", async () => {
        const { body } = await create();
        expect((await as("post", `/api/users/${body.user.id}/disable-mfa`)).statusCode).toBe(409);

        await enableMfa(admin._id);
        expect((await as("post", `/api/users/${admin._id}/disable-mfa`)).statusCode).toBe(400);

        const { owner } = await registerMerchant(app);
        await enableMfa(owner._id);
        expect((await as("post", `/api/users/${owner._id}/disable-mfa`)).statusCode).toBe(409);

        expect((await as("post", `/api/users/${body.user.id}/disable-mfa`, `Bearer ${userToken()}`)).statusCode).toBe(403);
    });
});

describe("accounts exempt from the login rate limit", () => {
    // This file replaces the limiter with a pass-through, so load the real one for these tests.
    const { isExempt } = jest.requireActual("../middleware/authRateLimiter");
    const pending = (email, type = "2fa_pending", secret = process.env.SECRET) => jwt.sign({ id: "x", type, email }, secret);
    afterEach(() => { delete process.env.AUTH_RATE_LIMIT_EXEMPT_EMAILS; });

    test("nobody is exempt unless the setting names them", () => {
        expect(isExempt({ path: "/login", body: { email: "prime@test.com" } })).toBe(false);
    });

    test("only the named account is exempt, at both login steps, in any case", () => {
        process.env.AUTH_RATE_LIMIT_EXEMPT_EMAILS = " Prime@Test.com , second@test.com";

        expect(isExempt({ path: "/login", body: { email: "PRIME@test.com " } })).toBe(true);
        expect(isExempt({ path: "/login", body: { email: "someone@test.com" } })).toBe(false);
        expect(isExempt({ path: "/2fa/verify-login", body: { pendingToken: pending("prime@test.com") } })).toBe(true);
        expect(isExempt({ path: "/2fa/verify-login", body: { pendingToken: pending("someone@test.com") } })).toBe(false);
    });

    test("the exemption cannot be claimed with a forged token or on other routes", () => {
        process.env.AUTH_RATE_LIMIT_EXEMPT_EMAILS = "prime@test.com";

        expect(isExempt({ path: "/2fa/verify-login", body: { pendingToken: pending("prime@test.com", "2fa_pending", "wrong-secret") } })).toBe(false);
        expect(isExempt({ path: "/2fa/verify-login", body: { pendingToken: pending("prime@test.com", "something_else") } })).toBe(false);
        expect(isExempt({ path: "/2fa/verify-login", body: { pendingToken: "garbage", email: "prime@test.com" } })).toBe(false);
        expect(isExempt({ path: "/refresh", body: { email: "prime@test.com", token: "t" } })).toBe(false);
        expect(isExempt({ path: "/login", body: { email: { $ne: null } } })).toBe(false);
        expect(isExempt({ path: "/login", body: undefined })).toBe(false);
    });

    test("the 2FA step of a real login carries the email the limiter needs", async () => {
        const { body } = await create();
        (await User.findById(body.user.id)).twoFactor = { enabled: true, secret: "S" };
        const first = await login("asha", body.temporaryPassword);
        expect(jwt.decode(first.body.pendingToken)).toMatchObject({ type: "2fa_pending", email: "asha@test.com" });
    });
});

describe("the MFA switch: requiring two-factor", () => {
    const { authenticator } = require("otplib");
    const setup = async () => {
        const { body } = await create();
        const first = await login("asha", body.temporaryPassword);
        const changed = await request(app).post("/api/auth/change-password")
            .set("Authorization", `Bearer ${first.body.accessToken}`)
            .send({ currentPassword: body.temporaryPassword, newPassword: "AshaOwnPass9" });
        return { id: body.user.id, ...changed.body };
    };
    const get = (path, token) => request(app).get(path).set("Authorization", `Bearer ${token}`);
    const post = (path, token) => request(app).post(path).set("Authorization", `Bearer ${token}`);

    // Does what the setup screen does: start, read the code from the authenticator, confirm.
    const enrol = async (token) => {
        const started = await post("/api/2fa/setup", token);
        const confirmed = await post("/api/2fa/enable", token).send({ token: authenticator.generate(started.body.secret) });
        return { started, confirmed, secret: started.body.secret };
    };

    test("turning it on signs the user out and shows as required", async () => {
        const { id, accessToken, refreshToken } = await setup();

        const res = await as("post", `/api/users/${id}/require-mfa`);
        expect(res.statusCode).toBe(200);
        expect(res.body.user).toMatchObject({ mfaRequired: true, mfaEnabled: false });

        expect((await get("/api/auth/session", accessToken)).statusCode).toBe(401);
        expect((await request(app).post("/api/auth/refresh").send({ token: refreshToken })).statusCode).toBe(403);
        expect(AuditLog.__docs().map((e) => e.action)).toContain("user.mfa_required");
    });

    test("at the next login nothing works until two-factor is set up", async () => {
        const { id } = await setup();
        await as("post", `/api/users/${id}/require-mfa`);

        const session = await login("asha", "AshaOwnPass9");
        expect(session.statusCode).toBe(200);
        expect(session.body.mfaSetupRequired).toBe(true);

        const blocked = await get("/api/dashboard", session.body.accessToken);
        expect(blocked.statusCode).toBe(403);
        expect(blocked.body.code).toBe("MFA_SETUP_REQUIRED");
        expect((await get("/api/auth/session", session.body.accessToken)).statusCode).toBe(403);

        const { started, confirmed } = await enrol(session.body.accessToken);
        expect(started.statusCode).toBe(200);
        expect(confirmed.statusCode).toBe(200);

        // The old token is still limited; a refreshed one is a normal session.
        const refreshed = await request(app).post("/api/auth/refresh").send({ token: session.body.refreshToken });
        expect(refreshed.statusCode).toBe(200);
        expect(jwt.decode(refreshed.body.accessToken).mfaSetup).toBeUndefined();
        expect((await get("/api/auth/session", refreshed.body.accessToken)).statusCode).toBe(200);

        // From now on the login asks for the code.
        const next = await login("asha", "AshaOwnPass9");
        expect(next.body.twoFactorRequired).toBe(true);
        expect(next.body.accessToken).toBeUndefined();
    });

    test("off then on resets the authenticator: the old code stops working and a new one is set up", async () => {
        const { id } = await setup();
        await as("post", `/api/users/${id}/require-mfa`);
        const first = await login("asha", "AshaOwnPass9");
        const { secret: oldSecret } = await enrol(first.body.accessToken);

        expect((await as("post", `/api/users/${id}/disable-mfa`)).body.user).toMatchObject({ mfaRequired: false, mfaEnabled: false });
        expect((await as("post", `/api/users/${id}/require-mfa`)).statusCode).toBe(200);

        const second = await login("asha", "AshaOwnPass9");
        expect(second.body.twoFactorRequired).toBeUndefined();
        expect(second.body.mfaSetupRequired).toBe(true);
        const { secret: newSecret } = await enrol(second.body.accessToken);
        expect(newSecret).not.toBe(oldSecret);

        const step = await login("asha", "AshaOwnPass9");
        const oldCode = await request(app).post("/api/auth/2fa/verify-login")
            .send({ pendingToken: step.body.pendingToken, token: authenticator.generate(oldSecret) });
        const newCode = await request(app).post("/api/auth/2fa/verify-login")
            .send({ pendingToken: step.body.pendingToken, token: authenticator.generate(newSecret) });
        expect(oldCode.statusCode).toBe(401);
        expect(newCode.statusCode).toBe(200);
    });

    test("a user who already has two-factor keeps their session; the switch only records the rule", async () => {
        const { id, accessToken } = await setup();
        (await User.findById(id)).twoFactor = { enabled: true, secret: "S" };

        expect((await as("post", `/api/users/${id}/require-mfa`)).body.user).toMatchObject({ mfaRequired: true, mfaEnabled: true });
        expect((await get("/api/auth/session", accessToken)).statusCode).toBe(200);
    });

    test("turning off also works when it was required but never set up", async () => {
        const { id } = await setup();
        await as("post", `/api/users/${id}/require-mfa`);
        expect((await as("post", `/api/users/${id}/disable-mfa`)).statusCode).toBe(200);
        expect((await login("asha", "AshaOwnPass9")).body.mfaSetupRequired).toBe(false);
    });

    test("a temporary password is changed first, then two-factor is set up", async () => {
        const { body } = await create();
        await as("post", `/api/users/${body.user.id}/require-mfa`);

        const session = await login("asha", body.temporaryPassword);
        expect(session.body).toMatchObject({ mustChangePassword: true, mfaSetupRequired: true });
        expect((await post("/api/2fa/setup", session.body.accessToken)).body.code).toBe("PASSWORD_CHANGE_REQUIRED");

        const changed = await post("/api/auth/change-password", session.body.accessToken)
            .send({ currentPassword: body.temporaryPassword, newPassword: "AshaOwnPass9" });
        expect(changed.body.mfaSetupRequired).toBe(true);
        expect((await get("/api/dashboard", changed.body.accessToken)).body.code).toBe("MFA_SETUP_REQUIRED");
        expect((await post("/api/2fa/setup", changed.body.accessToken)).statusCode).toBe(200);
    });

    test("not twice, not on yourself, not on a merchant login, and admin only", async () => {
        const { id } = await setup();
        expect((await as("post", `/api/users/${id}/require-mfa`)).statusCode).toBe(200);
        expect((await as("post", `/api/users/${id}/require-mfa`)).statusCode).toBe(409);
        expect((await as("post", `/api/users/${admin._id}/require-mfa`)).statusCode).toBe(400);

        const { owner } = await registerMerchant(app);
        expect((await as("post", `/api/users/${owner._id}/require-mfa`)).statusCode).toBe(409);
        expect((await as("post", `/api/users/${id}/require-mfa`, `Bearer ${userToken()}`)).statusCode).toBe(403);
    });
});
