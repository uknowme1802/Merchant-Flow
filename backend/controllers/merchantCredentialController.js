const credentialService = require("../services/credentialService");
const ApiError = require("../utils/ApiError");
const { recordAudit } = require("../utils/audit");
const { ENVIRONMENTS } = require("../constants/merchant");

const SECRET_NOTICE = "Copy this secret key now. It is shown only once and cannot be retrieved later; if you lose it, rotate the key.";

// Responses that contain a secret must never be stored by a browser or proxy cache.
const noStore = (res) => res.set("Cache-Control", "no-store");

// GET /api/merchant/credentials
exports.listCredentials = async (req, res, next) => {
    try {
        const data = await credentialService.listCredentials(req.merchant._id);
        res.json({ success: true, mid: req.merchant.mid, data });
    } catch (err) {
        next(err);
    }
};

// POST /api/merchant/credentials   body: { environment }
exports.issueCredential = async (req, res, next) => {
    try {
        const { environment } = req.body;
        const { credential, secret } = await credentialService.issueCredential({
            merchant: req.merchant,
            environment,
            createdBy: req.merchantUserId
        });

        await recordAudit(req, {
            action: "credential.issued",
            merchantId: req.merchant._id,
            targetType: "credential",
            targetId: credential.id,
            metadata: { environment, keyHint: credential.keyHint }
        });

        noStore(res);
        res.status(201).json({ success: true, mid: req.merchant.mid, credential, secret, message: SECRET_NOTICE });
    } catch (err) {
        next(err);
    }
};

// POST /api/merchant/credentials/:environment/rotate
exports.rotateCredential = async (req, res, next) => {
    try {
        const { environment } = req.params;
        if (!ENVIRONMENTS.includes(environment)) {
            throw new ApiError(400, `environment must be one of: ${ENVIRONMENTS.join(", ")}`);
        }

        const { credential, secret, previousKeyExpiresAt } = await credentialService.rotateCredential({
            merchant: req.merchant,
            environment,
            createdBy: req.merchantUserId
        });

        await recordAudit(req, {
            action: "credential.rotated",
            merchantId: req.merchant._id,
            targetType: "credential",
            targetId: credential.id,
            metadata: { environment, keyHint: credential.keyHint, previousKeyExpiresAt }
        });

        noStore(res);
        res.status(201).json({
            success: true,
            mid: req.merchant.mid,
            credential,
            secret,
            previousKeyExpiresAt,
            message: `${SECRET_NOTICE} The previous key keeps working until ${previousKeyExpiresAt.toISOString()}.`
        });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/merchant/credentials/:id   (revokes immediately; use this if a key leaked)
exports.revokeCredential = async (req, res, next) => {
    try {
        const credential = await credentialService.revokeCredential({
            merchantId: req.merchant._id,
            credentialId: req.params.id
        });

        await recordAudit(req, {
            action: "credential.revoked",
            merchantId: req.merchant._id,
            targetType: "credential",
            targetId: credential.id,
            metadata: { environment: credential.environment, keyHint: credential.keyHint }
        });

        res.json({ success: true, credential });
    } catch (err) {
        next(err);
    }
};
