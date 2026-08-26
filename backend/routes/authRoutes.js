const express=require("express");
const router=express.Router();

const authRateLimiter = require("../middleware/authRateLimiter");

const {login, refreshToken, logout} = require("../controllers/authController");
router.post("/login", authRateLimiter, login);
router.post("/refresh", authRateLimiter, refreshToken)
router.post('/logout', authRateLimiter, logout)

module.exports = router;