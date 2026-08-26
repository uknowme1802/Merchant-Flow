const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const { createUser, getUsers } = require("../controllers/userController");

router.post("/", authMiddleware, adminMiddleware, createUser);
router.get("/", authMiddleware, adminMiddleware, getUsers);

module.exports = router;