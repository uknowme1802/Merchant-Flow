  require("dotenv").config();

  //const { v4: uuidv4 } = require("uuid");
  //const crypto = require("crypto");
  const bcrypt = require("bcryptjs")
  const {authenticator} = require("otplib");
  const User = require("../models/User");
  const jwt = require("jsonwebtoken");


  const SECRET = process.env.SECRET;
  const REFRESH_SECRET = process.env.REFRESH_SECRET;

  const signAccessToken = (user) =>
    jwt.sign({id: user._id, email:user.email, role:user.role}, SECRET, {
      expiresIn: "15m"
    })

  const signRefreshToken = (user) =>
    jwt.sign({id:user._id}, REFRESH_SECRET, { expiresIn:"7d" })

  const signPendingToken = (user) =>
    jwt.sign({id: user._id, type: "2fa_pending"}, SECRET, { expiresIn: "5m"})

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

      const user = await User.findOne({email:email.toLowerCase()}).select(
        "+password +refreshToken"
      );

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

      // const accessToken = signAccessToken(user);
      // const refreshToken = signRefreshToken(user);

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
        user: {id: user._id, email:user.email, role: user.role}
      });
    } catch (err){
      next(err)
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

      console.log(`DEBUG user.twoFactor ${user?.twoFactor}`);
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
      const {accessToken, refreshToken} = await issueSessionTokens(user);

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user._id, email: user.email, role: user.role
        }
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