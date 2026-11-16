const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const validateObjectId = require("../middleware/validateObjectId");
const schemas = require("../validators/schemas");

const users = require("../controllers/userController");

// The Users tab. Admin only.
router.use(authMiddleware, adminMiddleware);

router.get("/", validateQuery(schemas.userListQuery), users.getUsers);
router.post("/", validate(schemas.createUser), users.createUser);
router.patch("/:id", validateObjectId("id"), validate(schemas.updateUser), users.updateUser);
router.post("/:id/reset-password", validateObjectId("id"), users.resetPassword);
router.post("/:id/disable-mfa", validateObjectId("id"), users.disableMfa);
router.post("/:id/require-mfa", validateObjectId("id"), users.requireMfa);

module.exports = router;
