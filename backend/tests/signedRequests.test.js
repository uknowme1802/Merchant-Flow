process.env.MERCHANT_API_RATE_LIMIT = "20";
process.env.CREDENTIAL_ENC_KEY = "c".repeat(64);

jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);

const express = require("express");
const request = require("supertest");
const app = require("../app");
const signatureAuth = require("../middleware/signatureAuth");
const { MerchantCredential, resetAll } = require("./helpers/mockModels");
const { registerMerchant, approve, asMember, issueKey, signedRequest } = require("./helpers/merchantFlow");

beforeEach(() => resetAll());

const setup = async (env = "sandbox", { approved = false } = {}) => {
    const m = await registerMerchant(app);
    if (approved || env === "live") await approve(app, m.merchant);
    const key = await issueKey(app, m.ownerToken, env);
    return { ...m, ...key };
};

describe("signed API access", () => {
    test.each(["sandbox", "live"])("a correctly signed %s request is accepted", async (env) => {
        const { mid, secret } = await setup(env);
        const res = await signedRequest(app, { mid, secret });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ mid, environment: env });
    });

    test("the secret itself is never echoed back", async () => {
        const { mid, secret } = await setup();
        const res = await signedRequest(app, { mid, secret });
        expect(JSON.stringify(res.body)).not.toContain(secret);
    });

    test("missing headers get 401", async () => {
        expect((await request(app).get("/v1/whoami")).statusCode).toBe(401);
        const { mid } = await setup();
        expect((await request(app).get("/v1/whoami").set("X-MID", mid)).statusCode).toBe(401);
    });

    test.each([
        ["a stale timestamp", () => Math.floor(Date.now() / 1000) - 3600],
        ["a far-future timestamp", () => Math.floor(Date.now() / 1000) + 3600]
    ])("rejects %s", async (_l, ts) => {
        const { mid, secret } = await setup();
        expect((await signedRequest(app, { mid, secret, timestamp: ts() })).statusCode).toBe(401);
    });

    test("bad, unknown and wrong-secret credentials all get the same generic 401", async () => {
        const { mid, secret } = await setup();
        const bodies = [];
        for (const attempt of [
            { mid: "not-a-mid", secret },
            { mid: "mid_" + "z".repeat(12), secret },
            { mid, secret: "sk_test_wrong" }
        ]) {
            const res = await signedRequest(app, attempt);
            expect(res.statusCode).toBe(401);
            bodies.push(res.body.message);
        }
        expect(new Set(bodies).size).toBe(1);
        expect(bodies[0]).toBe("Invalid credentials");
    });

    test("a signature made for another path or query is rejected", async () => {
        const { mid, secret } = await setup();
        const res = await signedRequest(app, { mid, secret, path: "/v1/whoami?x=1", signPath: "/v1/whoami" });
        expect(res.statusCode).toBe(401);
    });

    test("a revoked key stops working at once", async () => {
        const { mid, secret, credential, ownerToken } = await setup();
        expect((await signedRequest(app, { mid, secret })).statusCode).toBe(200);
        await asMember(app, "delete", `/api/merchant/credentials/${credential.id}`, ownerToken);
        expect((await signedRequest(app, { mid, secret })).statusCode).toBe(401);
    });

    test("a sandbox key's secret does not work as a live key, and vice versa", async () => {
        const { mid, secret } = await setup("live", { approved: true });
        const sandbox = await issueKey(app, (await registerMerchant(app, { email: "o2@o.example" })).ownerToken);
        expect(sandbox.secret).not.toBe(secret);
        expect((await signedRequest(app, { mid, secret: sandbox.secret })).statusCode).toBe(401);
    });
});

describe("rotation grace period", () => {
    test("both old and new secrets work during grace; the old one fails after it ends", async () => {
        const { mid, secret: oldSecret, ownerToken } = await setup();
        const rotated = await asMember(app, "post", "/api/merchant/credentials/sandbox/rotate", ownerToken);
        const newSecret = rotated.body.secret;

        expect((await signedRequest(app, { mid, secret: oldSecret })).statusCode).toBe(200);
        expect((await signedRequest(app, { mid, secret: newSecret })).statusCode).toBe(200);

        const retiring = (await MerchantCredential.find({})).find((c) => c.status === "retiring");
        retiring.expiresAt = new Date(Date.now() - 1000);

        expect((await signedRequest(app, { mid, secret: oldSecret })).statusCode).toBe(401);
        expect((await signedRequest(app, { mid, secret: newSecret })).statusCode).toBe(200);
    });
});

describe("merchant status", () => {
    test.each(["suspended", "rejected"])("a %s merchant gets 403", async (status) => {
        const { mid, secret, merchant } = await setup();
        merchant.status = status;
        expect((await signedRequest(app, { mid, secret })).statusCode).toBe(403);
    });

    test("a live key is refused if the merchant is no longer active", async () => {
        const { mid, secret, merchant } = await setup("live");
        merchant.status = "suspended";
        expect((await signedRequest(app, { mid, secret })).statusCode).toBe(403);
    });
});

describe("usage tracking and limits", () => {
    test("lastUsedAt is recorded", async () => {
        const { mid, secret } = await setup();
        await signedRequest(app, { mid, secret });
        await new Promise((r) => setTimeout(r, 20));
        expect((await MerchantCredential.find({}))[0].lastUsedAt).toBeTruthy();
    });

    test("requests above the per-MID limit get 429, other merchants are unaffected", async () => {
        const a = await setup();
        const b = await registerMerchant(app, { email: "b@b.example" });
        const bKey = await issueKey(app, b.ownerToken);

        let last;
        for (let i = 0; i < 25; i++) last = await signedRequest(app, { mid: a.mid, secret: a.secret });
        expect(last.statusCode).toBe(429);
        expect((await signedRequest(app, { mid: b.mid, secret: bKey.secret })).statusCode).toBe(200);
    });
});

describe("body signing (POST)", () => {
    const mini = () => {
        const a = express();
        a.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
        a.post("/echo", signatureAuth, (req, res) => res.json({ got: req.body }));
        return a;
    };

    test("the exact signed body is accepted; a changed or re-formatted body is not", async () => {
        const { mid, secret } = await setup();
        const server = mini();
        const body = '{"amount":1000,"currency":"INR"}';

        const ok = await signedRequest(server, { mid, secret, method: "post", path: "/echo", body });
        expect(ok.statusCode).toBe(200);
        expect(ok.body.got.amount).toBe(1000);

        const ts = String(Math.floor(Date.now() / 1000));
        const { sign } = require("../utils/requestSignature");
        const signature = sign(secret, { timestamp: ts, method: "post", path: "/echo", rawBody: Buffer.from(body) });
        const send = (payload) => request(server).post("/echo").set("X-MID", mid).set("X-Timestamp", ts)
            .set("X-Signature", signature).set("Content-Type", "application/json").send(payload);

        expect((await send('{"amount":9999,"currency":"INR"}')).statusCode).toBe(401);
        expect((await send('{ "amount": 1000, "currency": "INR" }')).statusCode).toBe(401);
    });
});

describe("legacy platform-wide endpoints", () => {
    test("merchant logins are refused on the dashboard and the transaction list", async () => {
        const { ownerToken } = await registerMerchant(app);
        expect((await asMember(app, "get", "/api/dashboard", ownerToken)).statusCode).toBe(403);
        expect((await asMember(app, "get", "/api/transactions", ownerToken)).statusCode).toBe(403);
    });
});

