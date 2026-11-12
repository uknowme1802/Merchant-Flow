const mongoose = require("mongoose");
const { BANK_STATUS, BANK_METHODS } = require("../constants/bank");

// A bank account that receives customer payments. One account can be mapped to many merchants
// (see MerchantBankMapping). Limits are stored and shown but not enforced yet.
const bankAccountSchema = new mongoose.Schema({
    // Public id, for example "bank_k3x9f2ab". Not a secret.
    bankId: { type: String, required: true, unique: true, immutable: true },
    holderName: { type: String, required: true, trim: true, maxlength: 120 },
    bankName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumber: { type: String, required: true, trim: true },
    ifsc: { type: String, required: true, uppercase: true, trim: true },
    upiId: { type: String, required: true, trim: true, lowercase: true },

    minPaise: { type: Number, default: null, min: 0 },
    maxPaise: { type: Number, default: null, min: 0 },
    dailyLimitPaise: { type: Number, default: null, min: 0 },

    methods: { type: [String], enum: BANK_METHODS, default: ["UPI"] },
    qrEnabled: { type: Boolean, default: true },
    // A label only (for example "Level1"); it does not affect routing.
    level: { type: String, trim: true, maxlength: 30, default: "Level1" },

    status: { type: String, enum: BANK_STATUS, default: "active" },
    // The tick icon: an admin confirmed the account details.
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

// The same account must not be added twice.
bankAccountSchema.index({ accountNumber: 1, ifsc: 1 }, { unique: true });
bankAccountSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("BankAccount", bankAccountSchema);
