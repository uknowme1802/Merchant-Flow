const express = require("express");
const router = express.Router();

const signatureAuth = require("../middleware/signatureAuth");
const merchantApiRateLimiter = require("../middleware/merchantApiRateLimiter");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");
const { whoami } = require("../controllers/merchantApiController");
const { createOrder, getOrder } = require("../controllers/orderController");

// The signed merchant API (server to server). Every route is authenticated by MID + signature,
// then rate limited per MID.
router.use(signatureAuth, merchantApiRateLimiter);

router.get("/whoami", whoami);

router.post("/orders", validate(schemas.createOrder), createOrder);
router.get("/orders/:orderId", (req, res, next) => {
    // A malformed id cannot match any order.
    if (!/^ord_[a-z0-9]{16}$/.test(req.params.orderId)) {
        return res.status(404).json({ success: false, code: "ORDER_NOT_FOUND", message: "Order not found" });
    }
    next();
}, getOrder);

module.exports = router;
