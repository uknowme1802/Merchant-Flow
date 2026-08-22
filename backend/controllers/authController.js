require("dotenv").config();

//const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const User = require("../models/User");
const jwt = require("jsonwebtoken");


const SECRET = process.env.SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

exports.login = (req, res) => {
  const { email, password } = req.body;

  let user;

  if (email === "admin@test.com" && password === "Logincode@10") {
    user = { email, role: "admin" };
  } else if (email === "user@test.com" && password === "Logincode@10") {
    user = { email, role: "user" };
  } else {
    return res.status(401).json({
      success: false,
      message: "Invalid Credentials"
    });
  }

  //Access Token code
  const accessToken = jwt.sign(user, SECRET, {
    expiresIn: "15m"
  });

  // Refresh Token 
  const refreshToken = jwt.sign(
    { ...user, tokenId: crypto.randomUUID() },
    REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({
    success: true,
    accessToken,
    refreshToken,
    user
  });
};


// REFRESH TOKEN API
exports.refreshToken = (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Refresh token required"
    });
  }

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);

    const newAccessToken = jwt.sign(
      { email: decoded.email, role: decoded.role },
      SECRET,
      { expiresIn: "15m" }
    );

    res.json({
      success: true,
      accessToken: newAccessToken
    });

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Invalid refresh token"
    });
  }
};