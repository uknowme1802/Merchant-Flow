const orderService = require("../services/orderService");
const { toMerchantOrderView } = require("../services/checkoutService");
const ApiError = require("../utils/ApiError");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// POST /v1/orders  (signed request)
// 201 with the new order, or 200 with the existing one when merchantOrderId was already used with
// the same amount, so a retried request is safe.
exports.createOrder = wrap(async (req, res) => {
    const { order, created } = await orderService.createOrder(req.merchant, req.merchantApi.environment, req.body);
    res.status(created ? 201 : 200).json({ success: true, order: toMerchantOrderView(order) });
});

// GET /v1/orders/:orderId  (signed request)
exports.getOrder = wrap(async (req, res) => {
    const order = await orderService.getMerchantOrder(req.merchant, req.params.orderId);
    if (!order) throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    res.json({ success: true, order: toMerchantOrderView(order) });
});
