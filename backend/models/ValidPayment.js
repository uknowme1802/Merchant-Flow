const mongoose = require("mongoose");


const ValidPaymentSchema = new mongoose.Schema({
    utr: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

module.exports = mongoose.model("ValidPayment", ValidPaymentSchema);