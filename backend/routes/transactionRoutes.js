const express = require("express");
const router=express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware")
const rateLimiter = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { getTransactions, addTransaction } = require("../controllers/transactionController");

router.get("/", rateLimiter, authMiddleware, getTransactions);
router.post("/", rateLimiter, authMiddleware, roleMiddleware("admin"), validate(schemas.addTransaction), addTransaction);

module.exports = router;