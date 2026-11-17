const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");
const callbacks = require("../controllers/callbackController");

// The delivery log of merchant callbacks. Admin only, mounted under /api/admin.
router.use(authMiddleware, adminMiddleware);

router.get("/callbacks", validateQuery(schemas.callbackListQuery), callbacks.adminList);
router.post("/callbacks/:id/resend", validateObjectId("id"), callbacks.adminResend);

module.exports = router;
