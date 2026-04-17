module.exports = (...allowedRoles) =>{
    return (req,res, next)=>{
        console.log("Role Check - User:", req.user, "Allowed Roles:", allowedRoles);
                
        if(!req.user){
            return res.status(401).json({
                success: false,
                message: "Unauthorized"});
        }

        if(!allowedRoles.includes(req.user.role)){
            console.log(`Access Denied: User role '${req.user.role}' not in allowed roles [${allowedRoles}]`);
            return res.status(403).json({
                success: false,
                message: `Access Denied. Your role '${req.user.role}' is not allowed. Only ${allowedRoles.join(", ")} can access.`
            });
        }
        next();
    }
}