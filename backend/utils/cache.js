const redis = require("../config/redis");
const logger = require("./logger");

// Deletes every cached transactions page. Uses SCAN (non-blocking) instead of KEYS, which
// freezes Redis while it walks the whole keyspace. Never throws: a cache problem must not
// fail the request that triggered it.
const clearTransactionCache = async () => {
    if (!redis) return;
    try {
        const stream = redis.scanStream({ match: "transactions:*", count: 100 });
        for await (const keys of stream) {
            if (keys.length) await redis.del(...keys);
        }
    } catch (err) {
        logger.warn("Could not clear transactions cache", { error: err.message });
    }
};

module.exports = { clearTransactionCache };
