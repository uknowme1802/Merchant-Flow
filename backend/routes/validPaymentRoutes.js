const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const { createVallidPayment, listValidPayments } = require("../controllers/validPaymentcontroller");

router.post("/", authMiddleware, adminMiddleware, createVallidPayment);
router.post("/", authMiddleware, adminMiddleware, listValidPayments);

module.exports = router;