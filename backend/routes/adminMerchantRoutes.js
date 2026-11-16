const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");

const admin = require("../controllers/adminMerchantController");
const audit = require("../controllers/auditController");
const manage = require("../controllers/adminMerchantManageController");

// Everything here is admin-only.
router.use(authMiddleware, adminMiddleware);

router.get("/merchants", validateQuery(schemas.merchantListQuery), admin.listMerchants);
router.get("/merchants/:id", validateObjectId("id"), admin.getMerchant);

// Management: create, Edit Config, reset password, the Keys action and the sandbox/production switch.
router.post("/merchants", validate(schemas.adminCreateMerchant), manage.createMerchant);
router.patch("/merchants/:id/config", validateObjectId("id"), validate(schemas.merchantConfig), manage.updateConfig);
router.post("/merchants/:id/reset-password", validateObjectId("id"), validate(schemas.resetMerchantPassword), manage.resetPassword);
router.post("/merchants/:id/credentials", validateObjectId("id"), manage.generateKey);
router.post("/merchants/:id/switch-mode", validateObjectId("id"), validate(schemas.switchMerchantMode), manage.switchMode);

// Decisions. Reject and suspend must give a reason; approve and reactivate may add a note.
router.post("/merchants/:id/approve", validateObjectId("id"), validate(schemas.merchantNote), admin.approveMerchant);
router.post("/merchants/:id/reject", validateObjectId("id"), validate(schemas.merchantReason), admin.rejectMerchant);
router.post("/merchants/:id/suspend", validateObjectId("id"), validate(schemas.merchantReason), admin.suspendMerchant);
router.post("/merchants/:id/reactivate", validateObjectId("id"), validate(schemas.merchantNote), admin.reactivateMerchant);

router.delete(
    "/merchants/:id/credentials/:credentialId",
    validateObjectId("id"),
    validateObjectId("credentialId"),
    admin.revokeMerchantCredential
);

router.get("/audit-logs", validateQuery(schemas.auditQuery), audit.listAuditLogs);

module.exports = router;
