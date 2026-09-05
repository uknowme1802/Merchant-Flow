const express=require("express");
const router=express.Router();

const authRateLimiter = require("../middleware/authRateLimiter");

const {login, refreshToken, logout, verifyTwoFactorLogin} = require("../controllers/authController");
//const { verify } = require("jsonwebtoken");
router.post("/login", authRateLimiter, login);
router.post("/2fa/verify-login", authRateLimiter, verifyTwoFactorLogin)
router.post("/refresh", authRateLimiter, refreshToken)
router.post('/logout', authRateLimiter, logout)

module.exports = router;