const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { setup, enable, disable, status } = require("../controllers/twoFactorController");

router.get("/status", authMiddleware, status);
router.post("/setup", authMiddleware, setup);
router.post("/enable", authMiddleware, validate(schemas.twoFactorToken), enable);
router.post("/disable", authMiddleware, validate(schemas.twoFactorToken), disable);

module.exports = router;