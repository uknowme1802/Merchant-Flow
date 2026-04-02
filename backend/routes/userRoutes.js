const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const { createUser, getUsers } = require("../controllers/userController");

router.post("/", authMiddleware, createUser);
router.get("/", authMiddleware, getUsers);

module.exports = router;