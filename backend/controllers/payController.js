const checkoutService = require("../services/checkoutService");
const ApiError = require("../utils/ApiError");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// The customer's checkout page. No login: the order id in the address is the only key.

// GET /api/pay/:orderId
exports.getCheckout = wrap(async (req, res) => {
    const view = await checkoutService.getCheckoutView(req.params.orderId);
    if (!view) throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    res.json({ success: true, order: view });
});

// POST /api/pay/:orderId/claim   { utr }
exports.claim = wrap(async (req, res) => {
    const view = await checkoutService.submitClaim(req.params.orderId, req.body.utr);
    res.json({ success: true, order: view });
});
