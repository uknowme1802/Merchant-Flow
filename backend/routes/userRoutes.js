const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const { createUser, getUsers } = require("../controllers/userController");

router.post("/", authMiddleware, adminMiddleware, validate(schemas.createUser), createUser);
router.get("/", authMiddleware, adminMiddleware, getUsers);

module.exports = router;