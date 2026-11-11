const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const rateLimiter= require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");

const { createCheckout, verifyPayment, getCheckoutStatus } = require("../controllers/checkoutController");

router.post("/", rateLimiter, authMiddleware, validate(schemas.createCheckout), createCheckout);
router.get("/:id", rateLimiter, authMiddleware, validateObjectId("id"), getCheckoutStatus);
router.post("/:id/verify", rateLimiter, authMiddleware, validateObjectId("id"), validate(schemas.verifyPayment), verifyPayment);

module.exports = router;