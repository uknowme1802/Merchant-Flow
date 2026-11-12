const mongoose = require("mongoose");
const { MERCHANT_STATUS, BUSINESS_TYPES, KYC_STATUS, MERCHANT_MODES, DEFAULT_MERCHANT_CONFIG } = require("../constants/merchant");

const merchantSchema = new mongoose.Schema({
    // Public merchant ID. Safe to show in URLs and logs; it is NOT a secret.
    mid: {
        type: String,
        required: true,
        unique: true,
        immutable: true
    },
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    businessType: { type: String, enum: BUSINESS_TYPES, required: true },
    website: { type: String, trim: true, default: null },
    country: { type: String, trim: true, uppercase: true, maxlength: 2, default: null },

    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },

    // Simulated KYC: this project does not verify documents, it records what was submitted
    // and lets an admin approve or reject it.
    kyc: {
        registrationNumber: { type: String, required: true, trim: true, maxlength: 64 },
        taxId: { type: String, trim: true, maxlength: 64, default: null },
        address: { type: String, required: true, trim: true, maxlength: 300 },
        status: { type: String, enum: KYC_STATUS, default: "submitted" },
        reviewNote: { type: String, default: null }
    },

    // Sandbox or production. Everything the merchant creates is tagged with the mode it was
    // created in, and screens only show the current mode.
    mode: { type: String, enum: MERCHANT_MODES, default: "sandbox" },

    // Admin-only note shown in the Merchant List.
    remark: { type: String, trim: true, maxlength: 200, default: "" },

    // Edit Config. Percentages are integer basis points so there is no floating-point drift.
    config: {
        webhookAutoTrigger: { type: Boolean, default: DEFAULT_MERCHANT_CONFIG.webhookAutoTrigger },
        payinBps: { type: Number, default: DEFAULT_MERCHANT_CONFIG.payinBps, min: 0, max: 10000 },
        payoutBps: { type: Number, default: DEFAULT_MERCHANT_CONFIG.payoutBps, min: 0, max: 10000 },
        settlementBps: { type: Number, default: DEFAULT_MERCHANT_CONFIG.settlementBps, min: 0, max: 10000 },
        settlementDays: { type: Number, default: DEFAULT_MERCHANT_CONFIG.settlementDays, min: 0, max: 30 },
        minAmountPaise: { type: Number, default: null, min: 0 },
        maxAmountPaise: { type: Number, default: null, min: 0 }
    },

    status: { type: String, enum: MERCHANT_STATUS, default: "pending" },
    statusReason: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

merchantSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Merchant", merchantSchema);
