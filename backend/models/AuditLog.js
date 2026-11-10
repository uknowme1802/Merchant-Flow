const mongoose = require("mongoose");

// Append-only record of security-relevant actions: who did what, to what, when and from where.
// Nothing in the application updates or deletes these documents. Secrets, passwords and
// signatures must never be put in `metadata` (utils/audit.js redacts them as a safety net).
const auditLogSchema = new mongoose.Schema({
    actorType: {
        type: String,
        enum: ["admin", "merchant_user", "merchant_api", "anonymous", "system"],
        required: true
    },
    actorId: { type: String, default: null },
    actorEmail: { type: String, default: null },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", default: null },

    action: { type: String, required: true },          // e.g. "merchant.approved"
    targetType: { type: String, default: null },       // e.g. "merchant", "credential", "user"
    targetId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ merchantId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
