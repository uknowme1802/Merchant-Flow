const AuditLog = require("../models/AuditLog");

const toView = (log) => ({
    id: String(log._id),
    actorType: log.actorType,
    actorId: log.actorId,
    actorEmail: log.actorEmail,
    merchantId: log.merchantId ? String(log.merchantId) : null,
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
    return { total, page, limit, data: logs.map(toView) };
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
