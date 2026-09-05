const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase:true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ["admin", "user"],
        default: "user"
    },
    refreshToken: {
        type: String,
        default: null,
        select: false
    },
    twoFactor:{
        enabled: {
            type: Boolean,
            default: false
        },
        secret:{
            type: String,
            default: null,
            select: false
        },
        tempSecret:{
            type: String,
            default: null,
            select: false
        }
    }
}, {timestamps:true});

module.exports = mongoose.model("User", userSchema);