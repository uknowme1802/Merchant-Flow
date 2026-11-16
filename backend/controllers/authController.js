  require("dotenv").config();

  //const { v4: uuidv4 } = require("uuid");
  //const crypto = require("crypto");
  const bcrypt = require("bcryptjs")
  const {authenticator} = require("otplib");
  const User = require("../models/User");
  const Merchant = require("../models/Merchant");
  const jwt = require("jsonwebtoken");
  const { normaliseRole } = require("../constants/roles");
  const sessionRevocation = require("../utils/sessionRevocation");


  const SECRET = process.env.SECRET;
  const REFRESH_SECRET = process.env.REFRESH_SECRET;

  const needsMfaSetup = (user) => Boolean(user.mfaRequired) && !user.twoFactor?.enabled;

  const signAccessToken = (user) =>
    jwt.sign({id: user._id, email:user.email, role: normaliseRole(user.role),
      // Normally "now"; see utils/sessionRevocation.js for the one case where it is a second later.
      iat: sessionRevocation.issuedAtFor(user._id),
      // An admin-issued temporary password must be replaced before anything else works.
      ...(user.mustChangePassword ? {mustChange: true} : {}),
      // An admin requires two-factor and it is not set up yet: only the setup calls work.
      ...(needsMfaSetup(user) ? {mfaSetup: true} : {})}, SECRET, {
      expiresIn: "15m"
    })

  const signRefreshToken = (user) =>
    jwt.sign({id:user._id}, REFRESH_SECRET, { expiresIn:"7d" })

  // The email lets the login rate limiter recognise an exempt account at the 2FA step too.
  const signPendingToken = (user) =>
    jwt.sign({id: user._id, type: "2fa_pending", email: user.email}, SECRET, { expiresIn: "5m"})

  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Finds a login by email or username. The match is not case sensitive: rows saved before the
  // application lower-cased these fields (for example "Harsh@admin.com") must still be found.
  const findLogin = async (identifier) => {
    const fields = "+password +refreshToken";
    const exact = await User.findOne({$or: [{email: identifier}, {username: identifier}]}).select(fields);
    if (exact) return exact;

    const anyCase = new RegExp(`^${escapeRegex(identifier)}$`, "i");
    return User.findOne({$or: [{email: anyCase}, {username: anyCase}]}).select(fields);
  };

  // A login that belongs to a suspended or deleted merchant cannot start or continue a session.
  const merchantBlock = async (user) => {
    if (normaliseRole(user.role) !== "merchant" || !user.merchantId) return null;
    const merchant = await Merchant.findById(user.merchantId);
    if (merchant && !["suspended", "deleted"].includes(merchant.status)) return null;
    return {
      success: false,
      code: "MERCHANT_SUSPENDED",
      message: merchant?.status === "suspended"
        ? "This merchant account is suspended. Contact support."
        : "This merchant account is closed."
    };
  };

  const DISABLED_RESPONSE = {
    success: false,
    code: "ACCOUNT_DISABLED",
    message: "This account is disabled. Contact an administrator."
  };

  const sessionUser = (user) => ({
    id: user._id, email: user.email, role: normaliseRole(user.role), username: user.username ?? null
  });

  const issueSessionTokens = async (user) => {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();
    return {accessToken, refreshToken}
  }


  exports.login = async (req, res, next) => {
    
    try{
      const { email, password } = req.body;

      // let user;

      if(!email || !password){
        return res.status(400).json({
          success: false,
          message: "Email or password required"
        })
      }

      // The "email" field also accepts a username (merchant logins created by an admin have one).
      const identifier = email.trim().toLowerCase();
      const user = await findLogin(identifier);

      if(!user){
        return res.status(401).json({
          success: false,
          message:"User not found"
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if(!isMatch){
        return res.status(401).json({
          success: false,
          message:"Invalid Credentials"
        });
      }

      // Checked after the password, so only the account's owner learns that it is disabled.
      if (user.disabled) {
        return res.status(403).json(DISABLED_RESPONSE);
      }
      const blocked = await merchantBlock(user);
      if (blocked) {
        return res.status(403).json(blocked);
      }

      if (user.twoFactor?.enabled){
        const pendingToken = signPendingToken(user);
        return res.json({
          success: true,
          twoFactorRequired: true,
          pendingToken
        })
      }
      
      const {accessToken, refreshToken} = await issueSessionTokens(user);

      // user.refreshToken = refreshToken;
      // await user.save();

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: sessionUser(user),
        mustChangePassword: Boolean(user.mustChangePassword),
        mfaSetupRequired: needsMfaSetup(user)
      });
    } catch (err){
      next(err)
    }
  };

  // POST /api/auth/change-password. Also the only call allowed while a temporary password is
  // still in place (see authMiddleware). Signs every other session out and returns fresh tokens.
  exports.changePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.id).select("+password +refreshToken");
      if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(401).json({ success: false, message: "Current password is incorrect" });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ success: false, message: "Choose a different password" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.mustChangePassword = false;

      const {accessToken, refreshToken} = await issueSessionTokens(user);
      return res.json({ success: true, accessToken, refreshToken, mfaSetupRequired: needsMfaSetup(user) });
    } catch (err) {
      next(err);
    }
  };

  exports.verifyTwoFactorLogin = async (req, res, next) => {
    try {
      const {pendingToken, token} = req.body;

      if(!pendingToken || !token){
        return res.status(400).json({
          success: false,
          message: "Pending token and authentication code is required!"
        })
      }

      let decoded;
      try{
        decoded = jwt.verify(pendingToken, SECRET);
      } catch (err){
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token - please login again!"
        })
      }
      if (decoded.type!=="2fa_pending"){
        return res.status(403).json({
          success: false,
          message: "Invalid session token"
        })
      }
      const user = await User.findById(decoded.id).select("+twoFactor.secret +refreshToken");

     
      if(!user || !user.twoFactor.enabled || !user.twoFactor?.secret){
        return res.status(400).json({
          success: false,
          message: "Two Factor authentication is not enabled for this user"
        })
      }
      const isValid = authenticator.check(token, user.twoFactor.secret);
      if(!isValid){
        return res.status(401).json({
          success: false,
          message: "Invalid authentication code!"
        })
      }
      if (user.disabled) {
        return res.status(403).json(DISABLED_RESPONSE);
      }
      const blocked = await merchantBlock(user);
      if (blocked) {
        return res.status(403).json(blocked);
      }
      const {accessToken, refreshToken} = await issueSessionTokens(user);

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: sessionUser(user),
        mustChangePassword: Boolean(user.mustChangePassword)
      })
    } catch(err){
      next(err);
    }
  }


  // REFRESH TOKEN API
  exports.refreshToken = async (req, res, next) => {
    try{
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Refresh token required"
        });
      }

      let decoded;

      try {
        decoded = jwt.verify(token, REFRESH_SECRET);
      } catch (err){
        return res.status(403).json({
          success:false,
          message: "Invalid or expired Token"
        });
      }

      const user = await User.findById(decoded.id).select("+refreshToken");

      if(!user || user.refreshToken!=token){
        return res.status(403).json({
          success: false,
          message: "Refresh Token has been revoked"
        })
      }
      if (user.disabled) {
        return res.status(403).json(DISABLED_RESPONSE);
      }
      const blocked = await merchantBlock(user);
      if (blocked) {
        return res.status(403).json(blocked);
      }

      const newAccessToken = signAccessToken(user);

      res.json({
          success: true,
          accessToken: newAccessToken
      });

    } catch (err) {
      next(err);
    }
  };

  //Logout Module
  exports.logout = async (req, res, next) => {
  try {
    const {token} = req.body;
    if(!token) {
      return res.status(400).json({
        success: false,
        message: "Refresh Token required"
      });
    }
    let decoded;
    try{
      decoded = jwt.verify(token, REFRESH_SECRET);
    } catch(err){
      return res.json({success: true})
    }

    await User.findByIdAndUpdate(decoded.id, {refreshToken: null });
    return res.json({success: true});
  } catch (err) {
    next (err);
  }
  }