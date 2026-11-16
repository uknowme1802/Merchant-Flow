const AuditLog = require("../models/AuditLog");
const Merchant = require("../models/Merchant");

const toView = (log, midById) => ({
    id: String(log._id),
    actorType: log.actorType,
    actorId: log.actorId,
    actorEmail: log.actorEmail,
    merchantId: log.merchantId ? String(log.merchantId) : null,
    // The public MID, so the screen can name the merchant. A force-deleted merchant no longer
    // has a record, so fall back to the MID that was written into the entry.
    mid: (log.merchantId && midById.get(String(log.merchantId))) || log.metadata?.mid || null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata,
    ip: log.ip,
    createdAt: log.createdAt
});

const page = async (filter, { page, limit }) => {
    const [logs, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        AuditLog.countDocuments(filter)
    ]);
    const merchantIds = [...new Set(logs.filter((l) => l.merchantId).map((l) => String(l.merchantId)))];
    const merchants = merchantIds.length ? await Merchant.find({ _id: { $in: merchantIds } }) : [];
    const midById = new Map(merchants.map((m) => [String(m._id), m.mid]));

    return { total, page, limit, data: logs.map((log) => toView(log, midById)) };
};

// GET /api/admin/audit-logs?merchantId=&action=&page=&limit=
exports.listAuditLogs = async (req, res, next) => {
    try {
        const { merchantId, action, page: pageNo, limit } = req.validatedQuery;
        const filter = {};
        if (merchantId) filter.merchantId = merchantId;
        if (action) filter.action = action;

        res.json({ success: true, ...(await page(filter, { page: pageNo, limit })) });
    } catch (err) {
        next(err);
    }
};

// GET /api/merchant/audit-logs   (owner only; always limited to the caller's own merchant)
exports.listOwnAuditLogs = async (req, res, next) => {
    try {
        const { action, page: pageNo, limit } = req.validatedQuery;
        const filter = { merchantId: req.merchant._id };
        if (action) filter.action = action;

        res.json({ success: true, ...(await page(filter, { page: pageNo, limit })) });
    } catch (err) {
        next(err);
    }
};
