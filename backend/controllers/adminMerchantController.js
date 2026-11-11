const merchantService = require("../services/merchantService");
const credentialService = require("../services/credentialService");
const { recordAudit } = require("../utils/audit");

// GET /api/admin/merchants?status=pending&search=&page=1&limit=20
exports.listMerchants = async (req, res, next) => {
    try {
        const { data, total, page, limit } = await merchantService.listMerchants(req.validatedQuery);
        res.json({ success: true, total, page, limit, data: data.map(merchantService.toMerchantView) });
    } catch (err) {
        next(err);
    }
};

// GET /api/admin/merchants/:id   (profile plus credential metadata, never secrets)
exports.getMerchant = async (req, res, next) => {
    try {
        const merchant = await merchantService.getMerchant(req.params.id);
        const credentials = await credentialService.listCredentials(merchant._id);
        res.json({ success: true, merchant: merchantService.toMerchantView(merchant), credentials });
    } catch (err) {
        next(err);
    }
};

const AUDIT_NAME = {
    approve: "merchant.approved",
    reject: "merchant.rejected",
    suspend: "merchant.suspended",
    reactivate: "merchant.reactivated"
};

// Builds the handler for POST /api/admin/merchants/:id/<approve|reject|suspend|reactivate>.
const statusAction = (action) => async (req, res, next) => {
    try {
        const { merchant, previousStatus } = await merchantService.changeMerchantStatus({
            merchantId: req.params.id,
            action,
            adminId: req.user.id,
            reason: req.body.reason
        });

        await recordAudit(req, {
            action: AUDIT_NAME[action],
            merchantId: merchant._id,
            targetType: "merchant",
            targetId: merchant._id,
            metadata: { from: previousStatus, to: merchant.status, reason: req.body.reason || null }
        });

        res.json({ success: true, merchant: merchantService.toMerchantView(merchant) });
    } catch (err) {
        next(err);
    }
};

exports.approveMerchant = statusAction("approve");
exports.rejectMerchant = statusAction("reject");
exports.suspendMerchant = statusAction("suspend");
exports.reactivateMerchant = statusAction("reactivate");

// DELETE /api/admin/merchants/:id/credentials/:credentialId
// Emergency switch: revoke a merchant's key immediately (for example after a reported leak).
exports.revokeMerchantCredential = async (req, res, next) => {
    try {
        const credential = await credentialService.revokeCredential({
            merchantId: req.params.id,
            credentialId: req.params.credentialId
        });

        await recordAudit(req, {
            action: "credential.revoked_by_admin",
            merchantId: req.params.id,
            targetType: "credential",
            targetId: credential.id,
            metadata: { environment: credential.environment, keyHint: credential.keyHint }
        });

        res.json({ success: true, credential });
    } catch (err) {
        next(err);
    }
};
