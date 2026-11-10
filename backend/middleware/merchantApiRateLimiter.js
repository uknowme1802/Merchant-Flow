const rateLimit = require("express-rate-limit");

// Rate limit for the signed merchant API, counted per MID (not per IP: a merchant's servers may
// share an address with others). Use AFTER signatureAuth, which sets req.merchantApi.
module.exports = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.MERCHANT_API_RATE_LIMIT) || 300,
    keyGenerator: (req) => req.merchantApi?.mid || "unknown",
    message: {
        success: false,
        message: "Rate limit exceeded for this merchant, slow down and retry shortly"
    },
    standardHeaders: true,
    legacyHeaders: false
});
