const User = require("../models/User");
const Merchant = require("../models/Merchant");

// For the merchant dashboard (logged-in team members, JWT). Use AFTER authMiddleware.
//
// It re-reads the user and merchant from the database on every request instead of trusting the
// token, so removing a team member or suspending a merchant takes effect immediately, not when
// the 15-minute access token expires.
//
// Sets: req.merchant (Merchant document), req.merchantRole ("owner" | "developer" | "finance"),
//       req.merchantUserId
const requireMerchantUser = async (req, res, next) => {
    try {
        if (req.user?.role !== "merchant") {
            return res.status(403).json({ success: false, message: "A merchant account is required" });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.role !== "merchant" || !user.merchantId) {
            return res.status(403).json({ success: false, message: "A merchant account is required" });
        }

        const merchant = await Merchant.findById(user.merchantId);
        if (!merchant) {
            return res.status(403).json({ success: false, message: "A merchant account is required" });
        }

        req.merchant = merchant;
        req.merchantRole = user.merchantRole;
        req.merchantUserId = user._id;
        next();
    } catch (err) {
        next(err);
    }
};

// Restricts a route to some team roles, for example requireMerchantRole("owner", "developer").
const requireMerchantRole = (...allowedRoles) => (req, res, next) => {
    if (!allowedRoles.includes(req.merchantRole)) {
        return res.status(403).json({
            success: false,
            message: `Your team role '${req.merchantRole}' cannot do this. Allowed: ${allowedRoles.join(", ")}`
        });
    }
    next();
};

module.exports = { requireMerchantUser, requireMerchantRole };
