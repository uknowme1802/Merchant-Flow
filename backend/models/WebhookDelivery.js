const mongoose = require("mongoose");

const webhookDeliverySchema = new mongoose.Schema({
    webhookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Webhook",
        required: true
    },
    event:{
        type: String,
        required: true
    },
    // The human-facing order ID (TXN-...), kept on its own field so logs can be searched by it
    transactionId: {
        type: String,
        default: null
    },
    payload:{
        type: mongoose.Schema.Types.Mixed
    },
    statusCode: {
        type: Number,
        default: null //this shows got no response (network error/timeout)
    },
    success:{
        type: Boolean,
        required: true
    },
    error: {
        type: String,
        default: null
    },
    // Total send attempts so far (first send + retries + manual replays)
    attempts: {
        type: Number,
        default: 1
    },
    // When the retry worker should try again; null = no retry scheduled
    nextRetryAt: {
        type: Date,
        default: null
    }
}, {timestamps: true });

const LOG_RETENTION_DAYS = Number(process.env.WEBHOOK_LOG_RETENTION_DAYS) || 30;

webhookDeliverySchema.index({webhookId:1, createdAt:-1});
webhookDeliverySchema.index({transactionId:1, createdAt:-1});
// TTL: delivery logs are deleted automatically after the retention window
webhookDeliverySchema.index({createdAt:1}, {expireAfterSeconds: LOG_RETENTION_DAYS * 24 * 60 * 60});
webhookDeliverySchema.index({success:1, nextRetryAt:1});

module.exports = mongoose.model("WebhookDelivery", webhookDeliverySchema);