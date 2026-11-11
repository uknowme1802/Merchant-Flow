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

router.get("/audit-logs", requireMerchantRole("owner"), validateQuery(schemas.auditQuery), audit.listOwnAuditLogs);

module.exports = router;
