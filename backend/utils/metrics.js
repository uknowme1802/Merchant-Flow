const client = require("prom-client");

const register = new client.Registry();
register.setDefaultLabels({ service: "merchantflow-backend" });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register]
});

const webhookDeliveries = new client.Counter({
    name: "webhook_deliveries_total",
    help: "Outbound webhook deliveries by event and outcome",
    labelNames: ["event", "outcome"],
    registers: [register]
});

const paymentVerifications = new client.Counter({
    name: "payment_verifications_total",
    help: "UTR payment verification attempts by outcome",
    labelNames: ["outcome"], // verified | pending | already_used
    registers: [register]
});

// Uses the matched route pattern (e.g. /api/checkout/:id) so labels stay low-cardinality.
const metricsMiddleware = (req, res, next) => {
    const end = httpDuration.startTimer();
    res.on("finish", () => {
        const route = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched";
        end({ method: req.method, route, status_code: res.statusCode });
    });
    next();
};

// Optional protection: set METRICS_TOKEN and Prometheus must send it as a bearer token.
const metricsHandler = async (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
};

module.exports = { metricsMiddleware, metricsHandler, webhookDeliveries, paymentVerifications };
