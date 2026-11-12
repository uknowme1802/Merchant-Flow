const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");
const bank = require("../controllers/adminBankController");

// Bank accounts and merchant mappings. Admin only, mounted under /api/admin.
router.use(authMiddleware, adminMiddleware);

router.get("/banks", validateQuery(schemas.bankListQuery), bank.listBanks);
router.post("/banks", validate(schemas.createBank), bank.createBank);
router.patch("/banks/:id", validateObjectId("id"), validate(schemas.updateBank), bank.updateBank);
router.post("/banks/:id/verify", validateObjectId("id"), bank.verifyBank);
router.delete("/banks/:id", validateObjectId("id"), bank.deleteBank);

router.get("/merchants/:id/banks", validateObjectId("id"), bank.listMappings);
router.post("/merchants/:id/banks", validateObjectId("id"), validate(schemas.addBankMapping), bank.addMapping);
router.delete("/merchants/:id/banks/:mappingId", validateObjectId("id"), validateObjectId("mappingId"), bank.removeMapping);

module.exports = router;
