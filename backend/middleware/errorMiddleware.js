const logger = require("../utils/logger");

// Last-resort error handler. 5xx details are logged (with the request ID) but never sent to
// clients in production, so internals such as DB errors or stack traces don't leak.
// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
    const status = err.statusCode || err.status || 500;

    logger.error("Request failed", {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status,
        error: err.message,
        stack: status >= 500 ? err.stack : undefined
    });

    const expose = status < 500 || process.env.NODE_ENV !== "production";

    res.status(status).json({
        success: false,
        message: expose ? (err.message || "Internal Server error") : "Internal Server error",
        requestId: req.id
    });
};

module.exports = errorMiddleware;
