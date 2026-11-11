const crypto = require("crypto");

// Encrypts merchant secret keys before they are stored (AES-256-GCM).
//
// Why encrypt instead of hash? To verify an HMAC signature the server needs the original
// secret, so it cannot be hashed the way a password is. Encryption protects the secrets if
// the database leaks on its own: an attacker also needs CREDENTIAL_ENC_KEY, which lives in the
// server environment (or a secret manager), never in the database.
//
// GCM also authenticates the data. We bind each ciphertext to its owner (the `aad` value, for
// example "mid_abc:live") so a ciphertext copied onto another merchant's record fails to decrypt.

const KEY_VERSION = 1;
const IV_BYTES = 12; // the size GCM is designed for

const getKey = () => {
    const hex = process.env.CREDENTIAL_ENC_KEY;
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error("CREDENTIAL_ENC_KEY must be set to 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32");
    }
    return Buffer.from(hex, "hex");
};

const encrypt = (plaintext, aad) => {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    cipher.setAAD(Buffer.from(String(aad)));

    const data = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);

    return {
        v: KEY_VERSION,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64")
    };
};

const decrypt = (payload, aad) => {
    if (!payload || payload.v !== KEY_VERSION) {
        throw new Error("Unsupported credential encryption version");
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAAD(Buffer.from(String(aad)));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

    return Buffer.concat([
        decipher.update(Buffer.from(payload.data, "base64")),
        decipher.final() // throws if the data, tag, key or aad do not match
    ]).toString("utf8");
};

module.exports = { encrypt, decrypt, KEY_VERSION };
