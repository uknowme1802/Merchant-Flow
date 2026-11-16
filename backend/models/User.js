const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase:true,
        trim: true
    },
    // Optional login name (lower case letters, digits and underscore). Login accepts it in place of
    // the email. Unique, but only among users that have one.
    username: {
        type: String,
        lowercase: true,
        trim: true,
        default: undefined
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    // Set when an admin issues a temporary password; the user must choose a new one at next login.
    mustChangePassword: {
        type: Boolean,
        default: false
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

userSchema.index(
    { username: 1 },
    { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);

module.exports = mongoose.model("User", userSchema);