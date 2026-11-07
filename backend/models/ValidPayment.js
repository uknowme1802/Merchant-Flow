const mongoose = require("mongoose");
const { roundMoney } = require("../utils/money");


const ValidPaymentSchema = new mongoose.Schema({
    utr: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        set: roundMoney
    },
    used: {
        type: Boolean,
        default: false
    },
    // The order that consumed this code (lets a concurrent retry of the same order be recognised)
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
        default: null
    }
}, {timestamps: true});

module.exports = mongoose.model("ValidPayment", ValidPaymentSchema);