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
        enum: ["admin", "user", "merchant"],
        default: "user"
    },
    // Set only for role "merchant": which merchant this login belongs to, and the member's
    // role inside that merchant's team (owner, developer, finance).
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
        default: null,
        index: true
    },
    merchantRole: {
        type: String,
        enum: ["owner", "developer", "finance"],
        default: null
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