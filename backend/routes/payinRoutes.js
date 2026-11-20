const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const denyRoles = require("../middleware/denyRoles");
const validate = require("../middleware/validate");
const validateQuery = require("../middleware/validateQuery");
const schemas = require("../validators/schemas");
const payin = require("../controllers/payinController");

// The Payin tab: every order, with totals and support actions. Dashboard staff (admins and agents)
// can use all of it; merchants cannot. Every action is audited with the old and new values.
router.use(authMiddleware, denyRoles("merchant"));

router.param("orderId", (req, res, next, value) => {
    if (!/^ord_[a-z0-9]{16}$/.test(value)) {
        return res.status(400).json({ success: false, message: "Invalid order id" });
    }
    next();
});

router.get("/dashboard", validateQuery(schemas.payinDashboardQuery), payin.dashboard);
router.get("/filter-options", payin.filterOptions);
router.get("/orders", validateQuery(schemas.payinOrderListQuery), payin.list);
router.post("/orders/:orderId/resend-callback", payin.resendCallback);
router.patch("/orders/:orderId/amount", validate(schemas.payinUpdateAmount), payin.updateAmount);
router.patch("/orders/:orderId/utr", validate(schemas.payinUpdateUtr), payin.updateUtr);
router.post("/orders/:orderId/fail", validate(schemas.payinFailOrder), payin.fail);
router.post("/orders/:orderId/refund", validate(schemas.payinRefundOrder), payin.refund);

module.exports = router;
