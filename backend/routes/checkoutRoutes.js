const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter= require("../middleware/rateLimiter");

const { createCheckout, verifyPayment, getCheckoutStatus } = require("../controllers/checkoutController");

router.post("/", rateLimiter, authMiddleware, createCheckout);
router.post("/", rateLimiter, authMiddleware, getCheckoutStatus);
router.post("/", rateLimiter, authMiddleware, verifyPayment);

module.exports = router;