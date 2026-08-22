const mongoose = require("mongoose");

const connectDB = async () =>{
    
        const mongoURI = process.env.MONGO_URI
        if(!mongoURI){
            console.error("MongoDBURI is not found. Refused to connect MongoDB");
            process.exit(1);
        }
    try{
        await mongoose.connect(mongoURI);
        console.log("MongoDB connected");
    } catch(err){
        console.error("DB Connection Error: ", err.message);
        process.exit(1);
    }
};

module.exports = connectDB; 