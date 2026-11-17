const rateLimit = require("express-rate-limit");

// The customer checkout page has no login, so it is limited per IP and order instead.
//
//   viewLimiter  : the page polls its status every few seconds, so this is generous.
//   claimLimiter : every UTR try is a guess against the bank statement, so this is tight: 10 tries
//                  per 10 minutes for one order from one address.
const keyFor = (req) => `${req.ip}:${req.params.orderId}`;

const viewLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: keyFor,
    message: { success: false, message: "Too many requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false
});

const claimLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.CLAIM_RATE_LIMIT) || 10,
    keyGenerator: keyFor,
    message: { success: false, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait a few minutes and try again." },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { viewLimiter, claimLimiter };
