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
    }
}, {timestamps: true });

webhookDeliverySchema.index({webhookId:1, createdAt:-1});
webhookDeliverySchema.index({transactionId:1, createdAt:-1});
webhookDeliverySchema.index({createdAt:-1});

module.exports = mongoose.model("WebhookDelivery", webhookDeliverySchema);