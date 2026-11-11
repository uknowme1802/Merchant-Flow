const express=require("express");
const router=express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const denyRoles = require("../middleware/denyRoles");

const {getDashboardStats} = require("../controllers/dashboardController");

// These stats cover every transaction on the platform, so merchant logins must not see them.
router.get("/", authMiddleware, denyRoles("merchant"), getDashboardStats);

module.exports = router;