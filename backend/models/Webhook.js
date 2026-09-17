const mongoose = require("mongoose");
const crypto = require("crypto");

const WEBHOOK_EVENTS = ["checkout.created", "payment.sucess"];

const webhookSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
        trim: true
    },
    events:{
        type: [String],
        enum: WEBHOOK_EVENTS,
        default: WEBHOOK_EVENTS
    },
    secret: {
        type: String,
        required: true,
        select: false
    },
    active:{
        type: Boolean,
        default: true
    }
}, { timestamps: true });

webhookSchema.statics.EVENTS = WEBHOOK_EVENTS;

webhookSchema.statics.generateSecret = () => crypto.randomBytes(24).toString("hex");

module.exports = mongoose.mongoose.model("Webhook", webhookSchema);