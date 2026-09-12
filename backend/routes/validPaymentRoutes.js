const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const { createValidPayment, listValidPayments } = require("../controllers/validPaymentcontroller");

router.post("/", authMiddleware, adminMiddleware, createValidPayment);
router.get("/", authMiddleware, adminMiddleware, listValidPayments);

module.exports = router;