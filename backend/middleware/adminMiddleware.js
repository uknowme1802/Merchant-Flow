module.exports = (req, res, next) => {
    if(!req.user){
        return res.status(401).json({
            success: false,
            message: "unauthorized"
        })
    }

    if(req.user.role!=="admin"){
        return res.status(403).json({
            status: false,
            message:"Admin denied (Admin only)"
        });
    }
    next();
}