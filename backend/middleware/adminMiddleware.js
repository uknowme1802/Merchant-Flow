module.exports = (req, res, role) => {
    if(req.user.role!=="admin"){
        return res.status(401).json({
            message:"Admin denied (Admin only)"
        });
    }
    next();
}