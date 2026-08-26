const rateLimit = require("express-rate-limit");

const authRateLimiter = rateLimit ({
    windowsMs: 15*60*1000,
    max: 10,
    message: {
        success: false,
        message: "Too many requests, please wait some time!"
    },
    standardHeaders: true,
    legacyHeaders: false
})

module.exports = authRateLimiter;