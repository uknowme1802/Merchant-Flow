const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () =>{
    
        const mongoURI = process.env.MONGO_URI
        if(!mongoURI){
            logger.error("MONGO_URI is not set. Refusing to start");
            process.exit(1);
        }
    try{
        await mongoose.connect(mongoURI);
        logger.info("MongoDB connected");
    } catch(err){
        logger.error("MongoDB connection failed", { error: err.message });
        process.exit(1);
    }
};

module.exports = connectDB; 