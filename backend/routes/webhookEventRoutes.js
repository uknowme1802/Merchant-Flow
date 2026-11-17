const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const denyRoles = require("../middleware/denyRoles");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");
const callbacks = require("../controllers/callbackController");

// Webhook Events: the log of callbacks sent to merchants. Dashboard staff (admins and agents) can
// read it; merchants cannot. Resending is admin only.
router.use(authMiddleware, denyRoles("merchant"));

router.get("/", validateQuery(schemas.callbackListQuery), callbacks.staffList);
router.get("/:id/body", validateObjectId("id"), callbacks.staffBody);
router.post("/:id/resend", adminMiddleware, validateObjectId("id"), callbacks.adminResend);

module.exports = router;
