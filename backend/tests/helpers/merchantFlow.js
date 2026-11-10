// Shared helpers for the Phase 1 integration tests. Requires the in-memory models to be
// mocked by the test file (see helpers/mockModels.js).

const jwt = require("jsonwebtoken");
const request = require("supertest");
const { Merchant, User } = require("./mockModels");
const { sign } = require("../../utils/requestSignature");

const tokenFor = (user) =>
    jwt.sign({ id: String(user._id), email: user.email, role: user.role }, process.env.SECRET, { expiresIn: "15m" });

const adminToken = () =>
    jwt.sign({ id: "a".repeat(24), email: "admin@test.com", role: "admin" }, process.env.SECRET, { expiresIn: "15m" });

const userToken = () =>
    jwt.sign({ id: "b".repeat(24), email: "user@test.com", role: "user" }, process.env.SECRET, { expiresIn: "15m" });

const validSignup = (overrides = {}) => ({
    businessName: "Acme Traders",
    businessType: "company",
    website: "https://acme.example",
    country: "in",
    contactName: "Asha Rao",
    contactPhone: "+91 98765 43210",
    email: "owner@acme.example",
    password: "StrongPass123",
    kyc: {
        registrationNumber: "U12345MH2020PTC000001",
        taxId: "AAAAA0000A",
        address: "12 Market Road, Mumbai"
    },
    ...overrides
});

// Signs up a merchant through the real endpoint and returns everything a test needs.
const registerMerchant = async (app, overrides = {}) => {
    const body = validSignup(overrides);
    const res = await request(app).post("/api/merchant/signup").send(body);
    if (res.statusCode !== 201) throw new Error(`signup failed: ${res.statusCode} ${JSON.stringify(res.body)}`);

    const merchant = await Merchant.findOne({ mid: res.body.merchant.mid });
    const owner = await User.findOne({ email: body.email.toLowerCase() });
    return { res, merchant, owner, mid: merchant.mid, ownerToken: tokenFor(owner) };
};

const approve = (app, merchant) =>
    request(app).post(`/api/admin/merchants/${merchant._id}/approve`)
        .set("Authorization", `Bearer ${adminToken()}`).send({});

const asMember = (app, method, path, token) =>
    request(app)[method](path).set("Authorization", `Bearer ${token}`);

// Issues a key through the dashboard endpoint and returns the one-time secret.
const issueKey = async (app, ownerToken, environment = "sandbox") => {
    const res = await asMember(app, "post", "/api/merchant/credentials", ownerToken).send({ environment });
    if (res.statusCode !== 201) throw new Error(`issue failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
    return { secret: res.body.secret, credential: res.body.credential, res };
};

// Sends a request signed the way a merchant's server would.
const signedRequest = (app, { mid, secret, method = "get", path = "/v1/whoami", body, timestamp, signPath }) => {
    const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
    const rawBody = body === undefined ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const signature = sign(secret, { timestamp: ts, method, path: signPath ?? path, rawBody });

    let req = request(app)[method](path)
        .set("X-MID", mid).set("X-Timestamp", ts).set("X-Signature", signature);
    if (rawBody) req = req.set("Content-Type", "application/json").send(rawBody.toString());
    return req;
};

module.exports = {
    tokenFor, adminToken, userToken, validSignup,
    registerMerchant, approve, asMember, issueKey, signedRequest
};
