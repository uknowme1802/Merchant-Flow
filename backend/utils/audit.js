const AuditLog = require("../models/AuditLog");

const SENSITIVE_KEY = /secret|password|token|signature|authorization|api[_-]?key/i;

// Safety net: even if a caller passes a secret by mistake, it never reaches the audit log.
const redact = (value, depth = 0) => {
    if (value === null || typeof value !== "object" || depth > 4) return value;
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

    const clean = {};
    for (const [key, val] of Object.entries(value)) {
        clean[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(val, depth + 1);
    }
    return clean;
};

const describeActor = (req) => {
    if (req.merchantApi) {
        return { actorType: "merchant_api", actorId: req.merchantApi.mid, actorEmail: null };
    }
    if (req.user?.role === "admin") {
        return { actorType: "admin", actorId: String(req.user.id), actorEmail: req.user.email || null };
    }
    if (req.user?.role === "merchant") {
        return { actorType: "merchant_user", actorId: String(req.user.id), actorEmail: req.user.email || null };
    }
    return { actorType: "anonymous", actorId: null, actorEmail: null };
};

// Writes one audit entry. It never throws: a failure to log must not break the action that
// was just performed, so errors are only reported to the console.
//
//   recordAudit(req, { action: "merchant.approved", merchantId, targetType: "merchant",
//                      targetId: String(id), metadata: { note } })
//
// Pass `actor` to override who is recorded (for example at sign-up, before anyone is logged in).
const recordAudit = async (req, { action, merchantId = null, targetType = null, targetId = null, metadata = {}, actor } = {}) => {
    try {
        await AuditLog.create({
            ...(actor || describeActor(req)),
            merchantId,
            action,
            targetType,
            targetId: targetId === null ? null : String(targetId),
            metadata: redact(metadata),
            ip: req.ip || null,
            userAgent: (req.get?.("user-agent") || "").slice(0, 200) || null
        });
    } catch (err) {
        console.warn("Warning: could not write audit log:", err.message);
    }
};

module.exports = { recordAudit, redact };
