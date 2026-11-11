const Redis = require("ioredis");
const logger = require("../utils/logger");

let redis = null;

if(process.env.NODE_ENV!=="test"){
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      maxRetriesPerRequest: 3,

      retryStrategy: (times)=>{
        if(times>3){
          logger.error("Redis retry limit reached");
          return null;
        }
        return Math.min(times*500, 2000);
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