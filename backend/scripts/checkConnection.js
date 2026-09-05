require("dotenv").config();
const mongoose = require("mongoose");
const { Connection, Collection } = require("mongoose");

async function diagnose(){
    if(!process.env.MONGO_URI){
        console.log("MONGOURI is not set in .env")
        process.exit(1);
    }

    console.log("Connecting to DB");
    console.log(process.env.MONGO_URI.replace(/:([^:@]+)@/, ":****@"));

    try{
        await mongoose.connect(process.env.MONGO_URI);
    } catch(err){
        console.error("❌Connection failed", err.message); 
        process.exit(1);
    }

    const dbName = mongoose.connection.db.databaseName;
    console.log(`\n Connected with ${dbName}`);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("\n Collections in Database");

    if(collections.length === 0){
        console.log("Empty Collections");
    }
    for (const c of collections){
        console.log(` -${c.name}`);
    }

    if(collections.some((c)=> c.name === "users")){
     const count = await mongoose.connection.db.collection("users").countDocuments();
     console.log(`\n "users" collection has ${count} documents`);
     
     if(count>0){
        const sample = await mongoose.connection.db.collection("users").findOne({},{projection: {email:1, role: 1}});
        console.log("Sample document (email/role)", sample);
     }

    } else{
        console.log("No users found in collection")
     }

    await mongoose.disconnect();
}

diagnose();