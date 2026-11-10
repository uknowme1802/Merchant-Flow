const crypto = require("crypto");

// Request signing for the merchant API.
//
// A merchant's server sends three headers with every call:
//   X-MID        : the public merchant ID
//   X-Timestamp  : unix time in seconds
//   X-Signature  : hex HMAC-SHA256 of the "signing string" below, keyed with their secret
//
// The signing string is four lines:
//   <timestamp>\n<METHOD>\n<path including query string>\n<sha256 hex of the raw body>
//
// Signing the path and query stops an attacker re-using a signature on another URL; signing the
// body hash stops them changing the amount; the timestamp limits how long a captured request
// stays valid. The secret itself never travels over the network.

const DEFAULT_TOLERANCE_SECONDS = 300; // five minutes

const sha256Hex = (data) => crypto.createHash("sha256").update(data ?? "").digest("hex");

const buildSigningString = ({ timestamp, method, path, rawBody }) =>
    [String(timestamp), String(method).toUpperCase(), path, sha256Hex(rawBody)].join("\n");

const sign = (secret, parts) =>
    crypto.createHmac("sha256", secret).update(buildSigningString(parts)).digest("hex");

// Constant-time comparison. timingSafeEqual throws on different lengths, so check that first
// (the length of a hex digest is not a secret).
const safeEqualHex = (a, b) => {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

const verify = (secret, parts, signature) => safeEqualHex(sign(secret, parts), signature);

const isTimestampFresh = (timestamp, nowMs = Date.now(), toleranceSeconds = DEFAULT_TOLERANCE_SECONDS) => {
    if (!/^\d{9,12}$/.test(String(timestamp))) return false;
    const skewSeconds = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
    return skewSeconds <= toleranceSeconds;
};

module.exports = {
    DEFAULT_TOLERANCE_SECONDS,
    buildSigningString,
    sign,
    verify,
    safeEqualHex,
    isTimestampFresh
};
