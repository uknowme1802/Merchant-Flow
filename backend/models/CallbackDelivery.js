const mongoose = require("mongoose");
const { CALLBACK_EVENTS, CALLBACK_STATUS } = require("../constants/callback");
const { MERCHANT_MODES } = require("../constants/merchant");

// One callback to a merchant about one order event, and everything that happened while delivering it.
const callbackDeliverySchema = new mongoose.Schema({
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderPublicId: { type: String, required: true },
    mode: { type: String, enum: MERCHANT_MODES, required: true },
    event: { type: String, enum: CALLBACK_EVENTS, required: true },

    // Where it goes, and the exact text that is sent. Fixed when the callback is created, so every
    // retry sends the same body with the same signature.
    url: { type: String, required: true },
    body: { type: String, required: true },

    status: { type: String, enum: CALLBACK_STATUS, default: "pending" },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    nextRetryAt: { type: Date, default: null },

    // The latest attempt.
    statusCode: { type: Number, default: null },
    error: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null }
}, { timestamps: true });

// An order event is called back once; a resend reuses the same row.
callbackDeliverySchema.index({ orderId: 1, event: 1 }, { unique: true });
callbackDeliverySchema.index({ merchantId: 1, mode: 1, createdAt: -1 });
callbackDeliverySchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model("CallbackDelivery", callbackDeliverySchema);
