const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { setup, enable, disable, status } = require("../controllers/twoFactorController");

router.get("/status", authMiddleware, status);
router.post("/setup", authMiddleware, setup);
router.post("/enable", authMiddleware, enable);
router.post("/disable", authMiddleware, disable);

module.exports = router;