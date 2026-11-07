const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter= require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { createCheckout, verifyPayment, getCheckoutStatus } = require("../controllers/checkoutController");

router.post("/", rateLimiter, authMiddleware, validate(schemas.createCheckout), createCheckout);
router.get("/:id", rateLimiter, authMiddleware, getCheckoutStatus);
router.post("/:id/verify", rateLimiter, authMiddleware, validate(schemas.verifyPayment), verifyPayment);

module.exports = router;