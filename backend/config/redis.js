const Redis =  require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
    tls:{},
});

redis.on("connect", ()=> console.log("✅ Redis connected"));
redis.on("error", ()=> console.error("❌ Redis Error"));

module.exports = Redis;