const express = require("express");
const router= express.Router();

const mongoose = require("mongoose");

const redis = require("../config/redis");

//Health check
router.get("/", (req,res)=>{
    return res.status(200).json({
        success:true,
        service: "Merchant-Flow Backend",
        status: "healthy",
        timestamp: new Date().toISOString()
    })
});

//Rediness check
router.get("/ready", async (req,res) =>{
    let mongoStatus = "disconnected";
    let redisStatus = "disconnected";

    if(mongoose.connection.readyState === 1){
        mongoStatus = "connected";
    }

    try{
        if(redis && typeof redis.ping == "function"){
            await redis.ping();
            redisStatus = "connected"
        }
    } catch (err){
        console.error("Redis Connection Error:",err.message)
    }

    const isReady = mongoStatus === "connected" && redisStatus === "connected";

    return res.status(isReady?200:503).json({
        success: isReady,
        status: isReady?"ready":"not ready",
        service:{
            mongodb:mongoStatus,
            redis:redisStatus
        },
        timestamp: new Date().toISOString()
    })

})

module.exports = router;