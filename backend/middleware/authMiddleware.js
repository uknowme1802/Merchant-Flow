const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
require('dotenv').config();
const SECRET = process.env.SECRET;

module.exports = (req,res, next) =>{
    try{
    const authHeader = req.headers.authorization;
    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({
            success:false,
            message:"Invalid or missing Authorization header"
        });
    }

    const token = authHeader.split(" ")[1];

    if(!SECRET){
        logger.error("SECRET is not configured");
        return res.status(500).json({
            success: false,
            message: "Server Configuration error"
        })
    }
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
    } catch(err){
        logger.debug("JWT rejected", { requestId: req.id, reason: err.message })
        return res.status(401).json({
            success: false,
            message:"Invalid Token or expired"
        })
    }
};