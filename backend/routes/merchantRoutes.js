const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { requireMerchantUser, requireMerchantRole } = require("../middleware/merchantAuth");
const signupRateLimiter = require("../middleware/signupRateLimiter");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");

const merchant = require("../controllers/merchantController");
const credentials = require("../controllers/merchantCredentialController");
const audit = require("../controllers/auditController");
const callbacks = require("../controllers/callbackController");
const merchantOrders = require("../controllers/merchantOrderController");

// Public: a business applies for an account. Logging in afterwards uses the normal /api/auth/login.
router.post("/signup", signupRateLimiter, validate(schemas.merchantSignup), merchant.signup);

// Everything below needs a logged-in merchant team member.
router.use(authMiddleware, requireMerchantUser);

router.get("/me", merchant.me);

// API credentials (MID + secret key): owner and developer only.
const canManageKeys = requireMerchantRole("owner", "developer");
router.get("/credentials", canManageKeys, credentials.listCredentials);
router.post("/credentials", canManageKeys, validate(schemas.credentialEnvironment), credentials.issueCredential);
router.post("/credentials/:environment/rotate", canManageKeys, credentials.rotateCredential);
router.delete("/credentials/:id", canManageKeys, validateObjectId("id"), credentials.revokeCredential);

// Team: everyone can see it, only the owner can change it.
router.get("/team", merchant.listTeam);
router.post("/team", requireMerchantRole("owner"), validate(schemas.addTeamMember), merchant.addTeamMember);
router.delete("/team/:id", requireMerchantRole("owner"), validateObjectId("id"), merchant.removeTeamMember);

// Callbacks sent to this merchant: everyone can see them, owner and developer can resend.
router.get("/callbacks", validateQuery(schemas.callbackListQuery), callbacks.merchantList);
router.post("/callbacks/:id/resend", requireMerchantRole("owner", "developer"), validateObjectId("id"), callbacks.merchantResend);

// The merchant's own orders and cards (current mode only). Everyone on the team can read them;
// owner and developer can resend a callback. The last four digits are all of the bank account shown.
router.get("/dashboard", merchantOrders.dashboard);
router.get("/orders", validateQuery(schemas.merchantOrderListQuery), merchantOrders.list);
router.post("/orders/:orderId/resend-callback", requireMerchantRole("owner", "developer"), (req, res, next) => {
    if (!/^ord_[a-z0-9]{16}$/.test(req.params.orderId)) {
        return res.status(404).json({ success: false, code: "ORDER_NOT_FOUND", message: "Order not found" });
    }
    next();
}, merchantOrders.resendCallback);

router.get("/audit-logs", requireMerchantRole("owner"), validateQuery(schemas.auditQuery), audit.listOwnAuditLogs);

module.exports = router;
