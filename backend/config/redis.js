const Redis = require("ioredis");

let redis = null;

try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });

    redis.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redis.on("error", (err) => {
      console.error("❌ Redis error:", err.message);
    });
  }
} catch (err) {
  console.error("❌ Redis init failed:", err.message);
}

module.exports = redis;