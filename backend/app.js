require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const path = require("path");
const { metricsMiddleware, metricsHandler } = require("./utils/metrics");
const { requestId, accessLog } = require("./middleware/requestContext");
const { allowedOrigins } = require("./config/origins");

const rateLimiter = require("./middleware/rateLimiter");
const errorMiddleware = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const userRoutes = require("./routes/userRoutes");
const healthRoutes = require("./routes/healthRoutes");
const twoFactorRoutes  = require("./routes/twoFactorRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const ValidPaymentRoutes = require("./routes/validPaymentRoutes");
const WebhookRoutes = require("./routes/webhookRoutes");
const merchantRoutes = require("./routes/merchantRoutes");
const adminMerchantRoutes = require("./routes/adminMerchantRoutes");
const adminBankRoutes = require("./routes/adminBankRoutes");
const merchantApiRoutes = require("./routes/merchantApiRoutes");

const app = express();

// Behind a reverse proxy (Render, nginx) the client IP comes from X-Forwarded-For. Without this
// the rate limiter sees the proxy's IP for everyone, so one user could lock out all the others.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

app.use(helmet());
app.use(requestId);
app.use(metricsMiddleware);
if(process.env.NODE_ENV !== "test"){
    app.use(accessLog);
}
// `verify` keeps the exact bytes of the request body in req.rawBody. The merchant API signature
// is computed over those bytes, so it cannot be checked against the parsed JSON.
app.use(express.json({ limit: "100kb", verify: (req, res, buf) => { req.rawBody = buf; } }));

app.use(cors({ origin: allowedOrigins() }));

app.get("/metrics", metricsHandler);

// Interactive API docs (OpenAPI 3) for merchants integrating with the platform
const openApiSpec = YAML.parse(fs.readFileSync(path.join(__dirname, "docs", "openapi.yaml"), "utf8"));
app.get("/api-docs.json", (req, res) => res.json(openApiSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// The signed merchant API sits BEFORE the global per-IP limiter: it has its own per-MID limit,
// and a merchant's servers should not be throttled together with everyone behind the same IP.
app.use("/v1", merchantApiRoutes);

app.use(rateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/admin", adminMerchantRoutes);
app.use("/api/admin", adminBankRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/2fa", twoFactorRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/valid-payments", ValidPaymentRoutes);
app.use("/health", healthRoutes);
app.use("/api/Webhooks", WebhookRoutes);

app.get("/", (req,res)=>{
    res.send("API Running...");
})

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found", requestId: req.id });
});

app.use(errorMiddleware);
module.exports = app;