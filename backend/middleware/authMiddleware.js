const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { normaliseRole } = require("../constants/roles");
const sessionRevocation = require("../utils/sessionRevocation");
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

        // Disabled users, and tokens issued before a password reset or a role change, stop
        // working at once. The client sees the same 401 as an expired token.
        if (sessionRevocation.isRejected(decoded)) {
            return res.status(401).json({
                success: false,
                message: "Session ended. Please log in again"
            });
        }

        // Tokens issued before the "user" role was renamed are read as "agent".
        decoded.role = normaliseRole(decoded.role);
        req.user = decoded;

        // A temporary password must be replaced first: only these calls work until it is.
        if (decoded.mustChange) {
            const path = req.originalUrl.split("?")[0];
            if (path !== "/api/auth/change-password" && path !== "/api/auth/logout") {
                return res.status(403).json({
                    success: false,
                    code: "PASSWORD_CHANGE_REQUIRED",
                    message: "You must change your temporary password first"
                });
            }
        }
        // An admin requires two-factor for this user and it is not set up yet: until it is, only
        // the setup calls work. After setup the client refreshes its token and this flag is gone.
        else if (decoded.mfaSetup) {
            const path = req.originalUrl.split("?")[0];
            if (!path.startsWith("/api/2fa/") && path !== "/api/auth/logout" && path !== "/api/auth/change-password") {
                return res.status(403).json({
                    success: false,
                    code: "MFA_SETUP_REQUIRED",
                    message: "You must set up two-factor authentication first"
                });
            }
        }
        next();
    } catch(err){
        logger.debug("JWT rejected", { requestId: req.id, reason: err.message })
        return res.status(401).json({
            success: false,
            message:"Invalid Token or expired"
        })
    }
};