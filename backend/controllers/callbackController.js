const callbackService = require("../services/callbackService");
const { recordAudit } = require("../utils/audit");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// What a screen may show about a delivery. The signed body is never sent, only what happened.
const toView = (d) => ({
    id: d._id,
    orderId: d.orderPublicId,
    merchant: d.merchantId && d.merchantId.mid
        ? { id: d.merchantId._id, mid: d.merchantId.mid, businessName: d.merchantId.businessName }
        : undefined,
    mode: d.mode,
    event: d.event,
    url: d.url,
    status: d.status,
    attempts: d.attempts,
    maxAttempts: d.maxAttempts,
    statusCode: d.statusCode,
    error: d.error,
    lastAttemptAt: d.lastAttemptAt,
    nextRetryAt: d.nextRetryAt,
    deliveredAt: d.deliveredAt,
    createdAt: d.createdAt
});

// GET /api/webhook-events   (admins and agents)
exports.staffList = wrap(async (req, res) => {
    const { data, total, page, limit } = await callbackService.listCallbacks(req.validatedQuery);
    res.json({ success: true, total, page, limit, data: data.map(toView) });
});

// GET /api/webhook-events/:id/body   (the exact message we sent, for the Data Sent view)
exports.staffBody = wrap(async (req, res) => {
    const delivery = await callbackService.getCallback(req.params.id);
    res.json({
        success: true,
        id: delivery._id,
        orderId: delivery.orderPublicId,
        event: delivery.event,
        url: delivery.url,
        // The signature is not stored and not shown: it is made at send time from the secret key.
        headers: { "Content-Type": "application/json", "X-Callback-Event": delivery.event },
        body: JSON.parse(delivery.body)
    });
});

// POST /api/webhook-events/:id/resend   (admin only)
exports.adminResend = wrap(async (req, res) => {
    const delivery = await callbackService.resendCallback(req.params.id);
    await recordAudit(req, {
        action: "callback.resent", merchantId: delivery.merchantId, targetType: "callback", targetId: delivery._id,
        metadata: { orderId: delivery.orderPublicId, event: delivery.event }
    });
    res.json({ success: true, callback: toView(delivery) });
});

// GET /api/merchant/callbacks   (only the merchant's own, in its current mode)
exports.merchantList = wrap(async (req, res) => {
    const { data, total, page, limit } = await callbackService.listCallbacks({
        ...req.validatedQuery, merchantId: req.merchant._id, mode: req.merchant.mode
    });
    res.json({ success: true, total, page, limit, data: data.map(toView) });
});

// POST /api/merchant/callbacks/:id/resend
exports.merchantResend = wrap(async (req, res) => {
    const delivery = await callbackService.resendCallback(req.params.id, {
        merchantId: req.merchant._id, mode: req.merchant.mode
    });
    await recordAudit(req, {
        action: "callback.resent", merchantId: req.merchant._id, targetType: "callback", targetId: delivery._id,
        metadata: { orderId: delivery.orderPublicId, event: delivery.event }
    });
    res.json({ success: true, callback: toView(delivery) });
});
