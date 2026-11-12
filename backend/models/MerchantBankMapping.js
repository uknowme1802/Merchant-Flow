const mongoose = require("mongoose");

// Links one merchant to one bank account (the PAYIN page). Banks are shared, so one bank can
// appear in many mappings, but a merchant can map the same bank only once.
const mappingSchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", required: true },
    active: { type: Boolean, default: true },
    // Optional limits for this merchant; they may only be stricter than the bank's own.
    minPaise: { type: Number, default: null, min: 0 },
    maxPaise: { type: Number, default: null, min: 0 },
    dailyLimitPaise: { type: Number, default: null, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

mappingSchema.index({ merchantId: 1, bankId: 1 }, { unique: true });
mappingSchema.index({ bankId: 1 });

module.exports = mongoose.model("MerchantBankMapping", mappingSchema);
