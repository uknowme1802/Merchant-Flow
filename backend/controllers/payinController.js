const payinService = require("../services/payinService");
const { recordAudit } = require("../utils/audit");
const { callbackView, toRow } = require("../utils/orderView");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// The audit entry for an action: who, which order, what changed and why.
const audit = (req, action, order, metadata) => recordAudit(req, {
    action, merchantId: order.merchantId, targetType: "order", targetId: order._id,
    metadata: { orderId: order.orderId, ...metadata }
});

// GET /api/payin/orders
exports.list = wrap(async (req, res) => {
    const { data, total, totals, page, limit } = await payinService.listOrders(req.validatedQuery);
    res.json({ success: true, total, page, limit, totals, data: data.map(toRow) });
});

// GET /api/payin/dashboard?merchant=<mid>
exports.dashboard = wrap(async (req, res) => {
    res.json({ success: true, ...(await payinService.dashboardCards(req.validatedQuery)) });
});

// GET /api/payin/filter-options
exports.filterOptions = wrap(async (req, res) => {
    res.json({ success: true, ...(await payinService.filterOptions()) });
});

// POST /api/payin/orders/:orderId/resend-callback
exports.resendCallback = wrap(async (req, res) => {
    const { order, delivery } = await payinService.resendCallbackForOrder(req.params.orderId);
    await audit(req, "order.callback_resent", order, {
        event: delivery.event, result: delivery.status, statusCode: delivery.statusCode
    });
    res.json({ success: true, callback: callbackView(delivery) });
});

// PATCH /api/payin/orders/:orderId/amount
exports.updateAmount = wrap(async (req, res) => {
    const { before, after } = await payinService.updateAmount(req.params.orderId, req.body.amountPaise);
    await audit(req, "order.amount_updated", after, {
        from: before.amountPaise, to: after.amountPaise, status: after.status, reason: req.body.reason
    });
    res.json({ success: true, order: toRow({ order: after }) });
});

// PATCH /api/payin/orders/:orderId/utr
exports.updateUtr = wrap(async (req, res) => {
    const { before, after } = await payinService.updateUtr(req.params.orderId, req.body.utr);
    await audit(req, "order.utr_updated", after, { from: before.utr, to: after.utr, reason: req.body.reason });
    res.json({ success: true, order: toRow({ order: after }) });
});

// POST /api/payin/orders/:orderId/fail
exports.fail = wrap(async (req, res) => {
    const { before, after } = await payinService.failOrder(req.params.orderId);
    await audit(req, "order.failed_by_staff", after, { from: before.status, reason: req.body.reason });
    res.json({ success: true, order: toRow({ order: after }) });
});
