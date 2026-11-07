const express=require("express");
const router=express.Router();

const authRateLimiter = require("../middleware/authRateLimiter");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const {login, refreshToken, logout, verifyTwoFactorLogin} = require("../controllers/authController");
//const { verify } = require("jsonwebtoken");
router.post("/login", authRateLimiter, validate(schemas.login), login);
router.post("/2fa/verify-login", authRateLimiter, validate(schemas.verifyTwoFactorLogin), verifyTwoFactorLogin)
router.post("/refresh", authRateLimiter, validate(schemas.refreshToken), refreshToken)
router.post('/logout', authRateLimiter, validate(schemas.logout), logout)

module.exports = router;