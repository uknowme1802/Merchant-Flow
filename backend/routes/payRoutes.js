const express = require("express");
const router = express.Router();

const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");
const { viewLimiter, claimLimiter } = require("../middleware/payRateLimiter");
const { getCheckout, claim } = require("../controllers/payController");

const ORDER_ID = /^ord_[a-z0-9]{16}$/;

// A malformed id cannot match any order, so answer 404 without touching the database.
router.param("orderId", (req, res, next, value) => {
    if (!ORDER_ID.test(value)) return res.status(404).json({ success: false, code: "ORDER_NOT_FOUND", message: "Order not found" });
    next();
});

// The public checkout page API (no login). Mounted under /api/pay.
router.get("/:orderId", viewLimiter, getCheckout);
router.post("/:orderId/claim", claimLimiter, validate(schemas.claimPayment), claim);

module.exports = router;
