const mongoose = require("mongoose");
const { MERCHANT_MODES } = require("../constants/merchant");

// One line of a bank statement: money that arrived in a bank account. An admin adds it by hand.
// A customer's order claims it by entering the same UTR; it can be claimed only once.
const bankCreditSchema = new mongoose.Schema({
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", required: true },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    // The bank reference number. Unique across all credits, so the same transfer cannot be entered twice.
    utr: { type: String, required: true, unique: true, immutable: true },
    receivedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 200, default: "" },

    // Null until an order claims it. The claim is one atomic update that only matches null.
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    claimedAt: { type: Date, default: null },
    claimedMode: { type: String, enum: [...MERCHANT_MODES, null], default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

// "Which unclaimed credits does this bank hold for this amount?" (bank selection) and the claim itself.
bankCreditSchema.index({ bankId: 1, amountPaise: 1, claimedBy: 1 });
bankCreditSchema.index({ receivedAt: -1 });

module.exports = mongoose.model("BankCredit", bankCreditSchema);
