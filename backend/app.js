require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const path = require("path");
const { metricsMiddleware, metricsHandler } = require("./utils/metrics");

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

const app = express();

app.use(helmet());
app.use(metricsMiddleware);
app.use(express.json());

app.use(cors({
    origin: [
        "https://merchant-flow-one.vercel.app",
        "http://localhost:5173"
    ]
}))

app.get("/metrics", metricsHandler);

// Interactive API docs (OpenAPI 3) for merchants integrating with the platform
const openApiSpec = YAML.parse(fs.readFileSync(path.join(__dirname, "docs", "openapi.yaml"), "utf8"));
app.get("/api-docs.json", (req, res) => res.json(openApiSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use(rateLimiter);

app.use("/api/auth", authRoutes);
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

app.use(errorMiddleware);
module.exports = app;