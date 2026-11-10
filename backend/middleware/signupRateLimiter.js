const rateLimit = require("express-rate-limit");

// Merchant sign-up is public, so it gets a much tighter limit than the rest of the API
// to slow down scripted account creation.
module.exports = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    message: {
        success: false,
        message: "Too many sign-up attempts from this address, please try again later"
    },
    standardHeaders: true,
    legacyHeaders: false
});
