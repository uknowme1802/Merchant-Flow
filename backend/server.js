require("dotenv").config();

const http = require("http");
const logger = require("./utils/logger");
const { validateEnv } = require("./config/env");

try {
    validateEnv();
} catch (err) {
    logger.error(err.message);
    process.exit(1);
}

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const { initSocket, getIO } = require("./socket");
const { startRetryWorker } = require("./utils/webhookDispatcher");

const PORT = process.env.PORT || 5000;

connectDB();

const app = require("./app");
const server = http.createServer(app);
initSocket(server);

const stopRetryWorker = startRetryWorker();

server.listen(PORT, () => {
    logger.info(`Server running at PORT: ${PORT}`, { env: process.env.NODE_ENV || "development" });
});

// Stop accepting work, let in-flight requests finish, close the database and cache
// connections, then exit. A hard timeout stops a stuck connection from hanging the deploy.
let shuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 10000;

const gracefulShutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    stopRetryWorker();

    const forceExit = setTimeout(() => {
        logger.error("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // io.close() also closes the underlying HTTP server and disconnects socket clients
    getIO().close(async () => {
        try {
            await mongoose.connection.close();
            if (redis) await redis.quit();
        } catch (err) {
            logger.warn("Error while closing connections", { error: err.message });
        }
        logger.info("Shutdown complete");
        process.exit(exitCode);
    });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
});

process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message, stack: err.stack });
    gracefulShutdown("uncaughtException", 1);
});
