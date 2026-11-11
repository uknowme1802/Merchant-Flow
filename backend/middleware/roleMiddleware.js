const logger = require("../utils/logger");

module.exports = (...allowedRoles) =>{
    return (req,res, next)=>{
        if(!req.user){
            return res.status(401).json({
                success: false,
                message: "Unauthorized"});
        }

        if(!allowedRoles.includes(req.user.role)){
            logger.warn("Access denied: role not allowed", {
                requestId: req.id, userId: req.user.id, role: req.user.role, allowedRoles
            });
            return res.status(403).json({
                success: false,
                message: `Access Denied. Your role '${req.user.role}' is not allowed. Only ${allowedRoles.join(", ")} can access.`
            });
        }
        next();
    }
}
