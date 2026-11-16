const mongoose = require("mongoose");
const { ROLES, LEGACY_ROLE_ALIASES } = require("../constants/roles");

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
        // The old name "user" is still accepted so a login that has not been migrated yet can be
        // saved (Mongoose validates the stored role on every save, including at login). The API
        // only ever writes the current names, and reads the old one as "agent".
        enum: [...ROLES, ...Object.keys(LEGACY_ROLE_ALIASES)],
        default: "agent"
    },
    // A disabled user cannot log in or refresh, and their open sessions stop at once.
    disabled: {
        type: Boolean,
        default: false
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
    // Set by an admin (the MFA switch). While it is on and two-factor is not set up yet, the user
    // must set it up right after logging in, before anything else works.
    mfaRequired: {
        type: Boolean,
        default: false
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