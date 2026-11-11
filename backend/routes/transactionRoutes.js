const express = require("express");
const router=express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware")
const denyRoles = require("../middleware/denyRoles");
const rateLimiter = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { getTransactions, addTransaction } = require("../controllers/transactionController");

// Lists every transaction on the platform, so merchant logins must not see it (Phase 2 adds a
// merchant-scoped list).
router.get("/", rateLimiter, authMiddleware, denyRoles("merchant"), getTransactions);
router.post("/", rateLimiter, authMiddleware, roleMiddleware("admin"), validate(schemas.addTransaction), addTransaction);

module.exports = router;