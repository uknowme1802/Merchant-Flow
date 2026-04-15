const rateLimit = require("express-rate-limit");

const rateLimiter = rateLimit({
    windowMs: 15*60*1000, //15 mins
    max: 100,
    message: {
        success: false,
        message: "To many requests, try again later!"
    }
});

module.exports = rateLimiter;