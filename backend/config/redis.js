const Redis = require("ioredis");

let redis = null;

if(process.env.NODE_ENV!=="test"){
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      maxRetriesPerRequest: 3,

      retryStrategy: (times)=>{
        if(times>3){
          console.error("❌Redis retries limit reached");
          return null;
        }
        return Math.min(times*500, 2000);
      }
    });

    redis.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redis.on("error", (err) => {
      console.error("❌ Redis error:", err.message);
    });
  } else {
    console.warn("⚠️ REDIS_URL is not configured!")
  } 
} catch (err) {
  console.error("❌ Redis init failed:", err.message);
}
}

module.exports = redis;