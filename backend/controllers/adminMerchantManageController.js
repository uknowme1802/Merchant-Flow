const merchantService = require("../services/merchantService");
const credentialService = require("../services/credentialService");
const { recordAudit } = require("../utils/audit");

const SECRET_NOTICE = "Copy this secret key now. It is shown only once and cannot be retrieved later.";
const PASSWORD_NOTICE = "Copy this temporary password now. It is shown only once; the user must change it at next login.";

// Responses that contain a secret or a password must never be cached.
const noStore = (res) => res.set("Cache-Control", "no-store");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// POST /api/admin/merchants   (an admin creates an approved merchant and its owner login)
exports.createMerchant = wrap(async (req, res) => {
    const { merchant, user, temporaryPassword } = await merchantService.createMerchantByAdmin({
        ...req.body,
        adminId: req.user.id
    });

    await recordAudit(req, {
        action: "merchant.created_by_admin",
        merchantId: merchant._id,
        targetType: "merchant",
        targetId: merchant._id,
        metadata: { mid: merchant.mid, username: user.username, mode: merchant.mode }
    });

    noStore(res);
    res.status(201).json({
        success: true,
        merchant: merchantService.toMerchantView(merchant),
        username: user.username,
        temporaryPassword,
        message: PASSWORD_NOTICE
    });
});

// PATCH /api/admin/merchants/:id/config
exports.updateConfig = wrap(async (req, res) => {
    const { merchant, before, after } = await merchantService.updateConfig(req.params.id, req.body);

    await recordAudit(req, {
        action: "merchant.config_updated",
        merchantId: merchant._id,
        targetType: "merchant",
        targetId: merchant._id,
        metadata: { before, after }
    });

    res.json({ success: true, merchant: merchantService.toMerchantView(merchant) });
});

// POST /api/admin/merchants/:id/reset-password
exports.resetPassword = wrap(async (req, res) => {
    const { merchant, user, temporaryPassword } = await merchantService.resetMerchantPassword({
        merchantId: req.params.id,
        userId: req.body.userId
    });

    // The password itself is never audited, only who it was reset for.
    await recordAudit(req, {
        action: "merchant.password_reset",
        merchantId: merchant._id,
        targetType: "user",
        targetId: user._id,
        metadata: { mid: merchant.mid, email: user.email }
    });

    noStore(res);
    res.json({ success: true, email: user.email, username: user.username ?? null, temporaryPassword, message: PASSWORD_NOTICE });
});

// POST /api/admin/merchants/:id/credentials   (the "Keys" action: generate or regenerate once)
exports.generateKey = wrap(async (req, res) => {
    const merchant = await merchantService.getMerchant(req.params.id);
    const { credential, secret, environment, regenerated, previousKeyExpiresAt } =
        await credentialService.generateKey({ merchant, createdBy: req.user.id });

    await recordAudit(req, {
        action: regenerated ? "credential.regenerated_by_admin" : "credential.issued_by_admin",
        merchantId: merchant._id,
        targetType: "credential",
        targetId: credential.id,
        metadata: { environment, mode: merchant.mode || "sandbox", keyHint: credential.keyHint }
    });

    noStore(res);
    res.status(201).json({
        success: true,
        mid: merchant.mid,
        credential,
        secret,
        regenerated,
        previousKeyExpiresAt: previousKeyExpiresAt || null,
        message: SECRET_NOTICE
    });
});

// POST /api/admin/merchants/:id/switch-mode
exports.switchMode = wrap(async (req, res) => {
    const { merchant, from, key } = await merchantService.switchMode({
        merchantId: req.params.id,
        mode: req.body.mode,
        confirmMid: req.body.confirmMid,
        reason: req.body.reason,
        adminId: req.user.id
    });

    await recordAudit(req, {
        action: "merchant.mode_changed",
        merchantId: merchant._id,
        targetType: "merchant",
        targetId: merchant._id,
        metadata: { mid: merchant.mid, from, to: merchant.mode, reason: req.body.reason || null, keyHint: key.credential.keyHint }
    });

    noStore(res);
    res.json({
        success: true,
        merchant: merchantService.toMerchantView(merchant),
        credential: key.credential,
        secret: key.secret,
        message: SECRET_NOTICE
    });
});
