const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    role: {
        type: String,
        enum: ["admin", "user"],
        default: "user"
    },
    refreshToken: {
        type: String
    }
});

module.exports = mongoose.model("User", userSchema);