const mongoose = require("mongoose");
const { ENVIRONMENTS, CREDENTIAL_STATUS } = require("../constants/merchant");

// Shape of the encrypted secret (see utils/credentialCrypto.js). `v` is the encryption key
// version, so the server-side key can be rotated later without losing old secrets.
const secretEncSchema = new mongoose.Schema({
    v: { type: Number, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    data: { type: String, required: true }
}, { _id: false });

// One document per secret key. A merchant has at most one ACTIVE secret per environment,
// plus any number of retiring (still valid until expiresAt) or revoked ones.
//
// The secret itself is never stored in plain text: only the AES-256-GCM encrypted form
// (secretEnc) and the last four characters for display. secretEnc is excluded from queries
// unless a caller asks for it with .select("+secretEnc").
const credentialSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
    // Copy of the merchant's MID so a signed request can be looked up in one query.
    mid: { type: String, required: true },
    environment: { type: String, enum: ENVIRONMENTS, required: true },

    secretEnc: { type: secretEncSchema, required: true, select: false },
    last4: { type: String, required: true },

    status: { type: String, enum: CREDENTIAL_STATUS, default: "active" },
    // Only set while status is "retiring": the moment the old secret stops working.
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastUsedAt: { type: Date, default: null }
}, { timestamps: true });

credentialSchema.index({ mid: 1, status: 1 });
credentialSchema.index({ merchantId: 1, environment: 1 });
// Database-level guarantee: never two active secrets for the same merchant and environment,
// even if two requests race.
credentialSchema.index(
    { merchantId: 1, environment: 1 },
    { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_per_env" }
);

module.exports = mongoose.model("MerchantCredential", credentialSchema);
