const winston = require("winston");

const isProduction = process.env.NODE_ENV === "production";

// JSON lines in production (easy to ship to Loki/CloudWatch/Datadog); readable text elsewhere.
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    silent: process.env.NODE_ENV === "test",
    defaultMeta: { service: "merchantflow-backend" },
    format: isProduction
        ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: "HH:mm:ss" }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, service: _service, stack, ...meta }) => {
                const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
                return `${timestamp} ${level} ${message}${extra}${stack ? `\n${stack}` : ""}`;
            })
        ),
    transports: [new winston.transports.Console()]
});

module.exports = logger;
