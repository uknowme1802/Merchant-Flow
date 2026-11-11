const DEFAULT_ORIGINS = ["https://merchant-flow-one.vercel.app", "http://localhost:5173"];

// ALLOWED_ORIGINS is a comma-separated list; it replaces the defaults when set.
const allowedOrigins = () =>
    process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
        : DEFAULT_ORIGINS;

module.exports = { allowedOrigins };
