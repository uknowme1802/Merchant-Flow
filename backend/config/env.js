const logger = require("../utils/logger");

const REQUIRED = ["MONGO_URI", "SECRET", "REFRESH_SECRET"];

// Fails fast at startup instead of crashing later on the first request.
const validateEnv = (env = process.env) => {
    const missing = REQUIRED.filter((name) => !env[name]);
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    // Merchant API keys are stored encrypted; without a valid key, issuing or checking them fails
    // with a 500 on the first request. In production refuse to start instead.
    if (env.NODE_ENV === "production" && !/^[0-9a-fA-F]{64}$/.test(env.CREDENTIAL_ENC_KEY || "")) {
        throw new Error("CREDENTIAL_ENC_KEY must be set to 64 hex characters. Generate one with: openssl rand -hex 32");
    }

    const warnings = [];
    if (env.SECRET.length < 32 || env.REFRESH_SECRET.length < 32) {
        warnings.push("SECRET and REFRESH_SECRET should be at least 32 random characters");
    }
    if (env.SECRET === env.REFRESH_SECRET) {
        warnings.push("SECRET and REFRESH_SECRET must be different");
    }
    if (env.NODE_ENV === "production") {
        if (!env.REDIS_URL) warnings.push("REDIS_URL is not set: caching is disabled and /health/ready will report not ready");
        if (!env.UPI_ID) warnings.push("UPI_ID is not set: checkout QR codes use a placeholder payee");
        if (!env.ALLOWED_ORIGINS) warnings.push("ALLOWED_ORIGINS is not set: only the default origins are allowed");
        if (!env.METRICS_TOKEN) warnings.push("METRICS_TOKEN is not set: /metrics is public");
    }

    warnings.forEach((w) => logger.warn(w));
    return warnings;
};

module.exports = { validateEnv, REQUIRED };
