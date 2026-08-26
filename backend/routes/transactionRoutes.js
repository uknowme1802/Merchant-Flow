const express = require("express");
const router=express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware")
const rateLimiter = require("../middleware/rateLimiter");

const { getTransactions, addTransaction } = require("../controllers/transactionController");

router.get("/", rateLimiter, authMiddleware, getTransactions);
router.post("/", rateLimiter, authMiddleware, roleMiddleware("admin"), addTransaction);

module.exports = router;