const Redis = require("ioredis");
const logger = require("../utils/logger");

let redis = null;

if(process.env.NODE_ENV!=="test"){
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      maxRetriesPerRequest: 3,

      // Never give up: a managed Redis (Upstash) can be briefly unreachable at boot or restart, and
      // a client that stops retrying stays dead until the whole server is restarted. Requests fail
      // fast (maxRetriesPerRequest) and the cache is optional, so retrying costs nothing.
      retryStrategy: (times)=>{
        if(times === 1 || times % 10 === 0){
          logger.warn("Redis unreachable, retrying", { attempt: times });
        }
        return Math.min(times*500, 10000);
      }
    });

    redis.on("connect", () => {
      logger.info("Redis connected");
    });

    redis.on("error", (err) => {
      logger.error("Redis error", { error: err.message });
    });
  } else {
    logger.warn("REDIS_URL is not configured: caching disabled")
  } 
} catch (err) {
  logger.error("Redis init failed", { error: err.message });
}
}

module.exports = redis;