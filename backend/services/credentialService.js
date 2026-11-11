const MerchantCredential = require("../models/MerchantCredential");
const ApiError = require("../utils/ApiError");
const { generateSecret, lastFour } = require("../utils/identifiers");
const { encrypt, decrypt } = require("../utils/credentialCrypto");

const GRACE_HOURS = () => Number(process.env.CREDENTIAL_ROTATION_GRACE_HOURS) || 24;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

// What the API and dashboard may show about a credential. Never includes the secret.
const toPublicView = (cred, now = new Date()) => {
    const expired = cred.status === "retiring" && cred.expiresAt && new Date(cred.expiresAt) <= now;
    return {
        id: String(cred._id),
        environment: cred.environment,
        keyHint: `...${cred.last4}`,
        status: expired ? "expired" : cred.status,
        expiresAt: cred.expiresAt || null,
        createdAt: cred.createdAt,
        lastUsedAt: cred.lastUsedAt || null
    };
};

// Rules shared by issue and rotate: who may hold which environment's keys.
const assertEnvironmentAllowed = (merchant, environment) => {
    if (environment === "live") {
        if (merchant.status !== "active") {
            throw new ApiError(403, "Live credentials are available after your account is approved");
        }
    } else if (!["pending", "active"].includes(merchant.status)) {
        throw new ApiError(403, "This merchant account cannot use the API");
    }
};

// Creates the secret document. Returns the plain secret exactly once; callers must pass it to
// the client in this response and never store or log it.
const createSecret = async ({ merchant, environment, createdBy }) => {
    const secret = generateSecret(environment);
    const credential = await MerchantCredential.create({
        merchantId: merchant._id,
        mid: merchant.mid,
        environment,
        secretEnc: encrypt(secret, `${merchant.mid}:${environment}`),
        last4: lastFour(secret),
        status: "active",
        createdBy: createdBy || null
    });
    return { credential, secret };
};

const issueCredential = async ({ merchant, environment, createdBy }) => {
    assertEnvironmentAllowed(merchant, environment);

    const existing = await MerchantCredential.findOne({ merchantId: merchant._id, environment, status: "active" });
    if (existing) {
        throw new ApiError(409, `A ${environment} key already exists. Rotate it to get a new one.`);
    }

    try {
        const { credential, secret } = await createSecret({ merchant, environment, createdBy });
        return { credential: toPublicView(credential), secret };
    } catch (err) {
        // Two simultaneous issue requests: the unique index lets only one win.
        if (err.code === 11000) {
            throw new ApiError(409, `A ${environment} key already exists. Rotate it to get a new one.`);
        }
        throw err;
    }
};

// Rotation without downtime: the current secret keeps working for a grace period (default 24h)
// while the merchant deploys the new one. Revoke the old one immediately if it leaked.
const rotateCredential = async ({ merchant, environment, createdBy }) => {
    assertEnvironmentAllowed(merchant, environment);

    const expiresAt = new Date(Date.now() + GRACE_HOURS() * 60 * 60 * 1000);
    const current = await MerchantCredential.findOneAndUpdate(
        { merchantId: merchant._id, environment, status: "active" },
        { $set: { status: "retiring", expiresAt } },
        { returnDocument: "after" }
    );

    if (!current) {
        throw new ApiError(404, `No active ${environment} key to rotate. Create one first.`);
    }

    try {
        const { credential, secret } = await createSecret({ merchant, environment, createdBy });
        return { credential: toPublicView(credential), secret, previousKeyExpiresAt: expiresAt };
    } catch (err) {
        // Creating the new key failed: put the old one back so the merchant is not locked out.
        await MerchantCredential.updateOne(
            { _id: current._id },
            { $set: { status: "active", expiresAt: null } }
        );
        throw err;
    }
};

const revokeCredential = async ({ merchantId, credentialId }) => {
    const credential = await MerchantCredential.findOneAndUpdate(
        { _id: credentialId, merchantId, status: { $ne: "revoked" } },
        { $set: { status: "revoked", revokedAt: new Date(), expiresAt: null } },
        { returnDocument: "after" }
    );
    if (!credential) {
        throw new ApiError(404, "Credential not found or already revoked");
    }
    return toPublicView(credential);
};

const listCredentials = async (merchantId) => {
    const credentials = await MerchantCredential.find({ merchantId }).sort({ createdAt: -1 });
    return credentials.map((c) => toPublicView(c));
};

// Used by the signature middleware: every secret that may currently sign requests for this MID,
// decrypted in memory only. Retiring secrets count until they expire; revoked ones never do.
const getUsableSecrets = async (mid, now = new Date()) => {
    const credentials = await MerchantCredential.find({
        mid,
        $or: [
            { status: "active" },
            { status: "retiring", expiresAt: { $gt: now } }
        ]
    }).select("+secretEnc");

    const usable = [];
    for (const cred of credentials) {
        try {
            usable.push({
                credentialId: cred._id,
                environment: cred.environment,
                lastUsedAt: cred.lastUsedAt,
                secret: decrypt(cred.secretEnc, `${cred.mid}:${cred.environment}`)
            });
        } catch (err) {
            // Wrong key or tampered record: skip it rather than crash, but make it visible.
            console.error(`Credential ${cred._id} could not be decrypted:`, err.message);
        }
    }
    return usable;
};

// Records the last time a key was used, at most once every five minutes per key, so a busy
// merchant does not cause a database write on every request. Fire-and-forget.
const touchLastUsed = (credentialId, lastUsedAt, now = new Date()) => {
    if (lastUsedAt && now - new Date(lastUsedAt) < LAST_USED_THROTTLE_MS) return;
    Promise.resolve(MerchantCredential.updateOne({ _id: credentialId }, { $set: { lastUsedAt: now } }))
        .catch((err) => console.warn("Warning: could not update lastUsedAt:", err.message));
};

module.exports = {
    toPublicView,
    issueCredential,
    rotateCredential,
    revokeCredential,
    listCredentials,
    getUsableSecrets,
    touchLastUsed
};
