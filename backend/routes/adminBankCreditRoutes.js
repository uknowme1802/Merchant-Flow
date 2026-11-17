const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const schemas = require("../validators/schemas");
const credits = require("../controllers/adminBankCreditController");

// The bank statement: money that arrived in a bank account. Admin only, mounted under /api/admin.
router.use(authMiddleware, adminMiddleware);

router.get("/bank-credits", validateQuery(schemas.bankCreditListQuery), credits.listCredits);
router.post("/bank-credits", validate(schemas.createBankCredit), credits.addCredit);

module.exports = router;
