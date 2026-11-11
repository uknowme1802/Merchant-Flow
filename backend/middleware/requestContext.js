const crypto = require("crypto");
const morgan = require("morgan");
const logger = require("../utils/logger");

// Gives every request an ID (reusing the caller's X-Request-Id when present) so one request can
// be followed through the logs and quoted in a support ticket.
const requestId = (req, res, next) => {
    const incoming = req.get("X-Request-Id");
    req.id = incoming && /^[\w\-.:]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.set("X-Request-Id", req.id);
    next();
};

morgan.token("id", (req) => req.id);

// One structured access-log line per request; health checks and metrics scrapes are skipped.
const accessLog = morgan(
    (tokens, req, res) => JSON.stringify({
        requestId: tokens.id(req, res),
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: Number(tokens.status(req, res)),
        ms: Number(tokens["response-time"](req, res)),
        ip: req.ip
    }),
    {
        skip: (req) => req.path === "/metrics" || req.path.startsWith("/health"),
        stream: { write: (line) => logger.info("request", JSON.parse(line)) }
    }
);

module.exports = { requestId, accessLog };
