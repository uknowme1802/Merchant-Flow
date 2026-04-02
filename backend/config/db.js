const mongoose = require("mongoose");

const connectDB = async () =>{
    try{
        const mongoURI = process.env.MONGO_URI || "mongodb+srv://harshdeepsharma654_db_user:qRnksk7YDqipN9PS@merchant-flow.ebtmgyb.mongodb.net/"
        await mongoose.connect(mongoURI);
        console.log("MongoDB connected");
    } catch(err){
        console.error("DB Connection Error: ", err.message);
        process.exit(1);
    }
};

module.exports = connectDB; 