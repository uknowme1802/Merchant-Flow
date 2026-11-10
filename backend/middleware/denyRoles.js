// Blocks some account types from a route, for example denyRoles("merchant").
// Use AFTER authMiddleware. Used on the older dashboard and transaction endpoints, which return
// platform-wide data and must not be visible to merchant logins.
module.exports = (...deniedRoles) => (req, res, next) => {
    if (deniedRoles.includes(req.user?.role)) {
        return res.status(403).json({
            success: false,
            message: "This resource is not available for your account type"
        });
    }
    next();
};
