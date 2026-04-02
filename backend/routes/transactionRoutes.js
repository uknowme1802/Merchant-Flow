const express = require("express");
const router=express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware")

const { getTransactions, addTransaction } = require("../controllers/transactionController");

router.get("/", authMiddleware, getTransactions);
router.post("/", authMiddleware, roleMiddleware("admin"), addTransaction);

module.exports = router;