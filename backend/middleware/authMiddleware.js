const jwt = require("jsonwebtoken");
require('dotenv').config();
const SECRET = process.env.SECRET;

module.exports = (req,res, next) =>{
    const authHeader = req.headers.authorization;
    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({message:"Invalid header format"});
    }

    const token = authHeader.split(" ")[1];

    try{
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
    } catch(err){
        console.log("JWT error", err.message)
        return res.status(401).json({message:"Invalid Token"})
    }
};