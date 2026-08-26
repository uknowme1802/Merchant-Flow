const rateLimit = require("express-rate-limit");

const authRateLimiter = rateLimit ({
    windwsMs: 15*60*1000,
    max: 10,
    message: {
        success: false,
        message: "Too many requests, please wait some time!"
    },
    standardHeaders: true,
    legacyHeader: false
})

module.exports = authRateLimiter;