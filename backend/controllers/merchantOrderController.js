const payinService = require("../services/payinService");
const { recordAudit } = require("../utils/audit");
const { callbackView, toRow } = require("../utils/orderView");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// Every handler here is limited to the logged-in merchant and its CURRENT mode. The merchant comes
// from the login (req.merchant), never from anything the browser sends.
const scopeOf = (req) => ({ merchantId: req.merchant._id, mode: req.merchant.mode });

// GET /api/merchant/dashboard
exports.dashboard = wrap(async (req, res) => {
    res.json({ success: true, ...(await payinService.dashboardCards({ merchant: req.merchant.mid })) });
});

// GET /api/merchant/orders
exports.list = wrap(async (req, res) => {
    const { data, total, totals, page, limit } = await payinService.listOrders(req.validatedQuery, scopeOf(req));
    res.json({ success: true, total, page, limit, totals, data: data.map((entry) => toRow(entry, { forMerchant: true })) });
});

// POST /api/merchant/orders/:orderId/resend-callback   (owner and developer)
exports.resendCallback = wrap(async (req, res) => {
    const { order, delivery } = await payinService.resendCallbackForOrder(req.params.orderId, scopeOf(req));
    await recordAudit(req, {
        action: "order.callback_resent", merchantId: req.merchant._id, targetType: "order", targetId: order._id,
        metadata: { orderId: order.orderId, event: delivery.event, result: delivery.status, statusCode: delivery.statusCode }
    });
    res.json({ success: true, callback: callbackView(delivery) });
});
