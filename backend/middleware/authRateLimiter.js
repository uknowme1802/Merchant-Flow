const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

// Accounts the login limit does not apply to: AUTH_RATE_LIMIT_EXEMPT_EMAILS, a comma-separated
// list of email addresses. Leave it empty unless you need it: an exempt account can be tried
// with any number of passwords, so it should have a strong password and two-factor turned on.
const exemptEmails = () => new Set(
    (process.env.AUTH_RATE_LIMIT_EXEMPT_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
);

// Only the two login steps can be exempt. Step one is recognised by the email typed, step two by
// the email inside the signed 5-minute token that step one issued (it cannot be forged).
const isExempt = (req) => {
    const exempt = exemptEmails();
    if (!exempt.size) return false;

    if (req.path === "/login") {
        return typeof req.body?.email === "string" && exempt.has(req.body.email.trim().toLowerCase());
    }
    if (req.path === "/2fa/verify-login" && typeof req.body?.pendingToken === "string") {
        try {
            const decoded = jwt.verify(req.body.pendingToken, process.env.SECRET);
            return decoded.type === "2fa_pending" && exempt.has(String(decoded.email || "").toLowerCase());
        } catch {
            return false;
        }
    }
    return false;
};

const authRateLimiter = rateLimit ({
    windowMs: 15*60*1000,
    max: 10,
    message: {
        success: false,
        message: "Too many requests, please wait some time!"
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: isExempt
})

module.exports = authRateLimiter;
module.exports.isExempt = isExempt;
