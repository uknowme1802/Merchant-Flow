const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { createValidPayment, listValidPayments } = require("../controllers/validPaymentcontroller");

router.post("/", authMiddleware, adminMiddleware, validate(schemas.createValidPayment), createValidPayment);
router.get("/", authMiddleware, adminMiddleware, listValidPayments);

module.exports = router;