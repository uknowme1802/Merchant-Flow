require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User= require("../models/User");

const EMAIL = process.env.SEED_ADMIN_EMAIL || "Prime@merchantflow.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "AccessMasterControl@10"

async function seed() {
    if(!process.env.MONGO_URI){
        console.error("MONGO URI is not set. Aborting!")
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const existing = await User.findOne({email: EMAIL.toLowerCase()});

    if(existing){
        console.log(`A user is already exist with email ${EMAIL} - Exit`);
        await mongoose.disconnect();
        return;
    }

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    await User.create({
        email: EMAIL.toLowerCase(),
        password: hashedPassword,
        role: "admin"
    })

    console.log(`✅Admin Access created with Email: ${EMAIL} and Password: ${PASSWORD}`);
    console.log("Delete this one after successful login.");

    await mongoose.disconnect()
}

seed().catch((err)=>{
    console.error("seeding Failed:", err.message);
    process.exit(1);
})