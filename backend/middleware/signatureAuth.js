const Merchant = require("../models/Merchant");
const { getUsableSecrets, touchLastUsed } = require("../services/credentialService");
const { verify, isTimestampFresh } = require("../utils/requestSignature");

const MID_FORMAT = /^mid_[a-z0-9]{12}$/;

const unauthorized = (res, message = "Invalid credentials") =>
    res.status(401).json({ success: false, message });

// Authenticates a merchant's server-to-server request (see utils/requestSignature.js for the
// header and signing rules). On success it sets:
//   req.merchantApi = { merchantId, mid, environment, credentialId, merchantStatus }
//   req.merchant    = the Merchant document
//
// Unknown MID, wrong signature and revoked key all return the same 401 message, so the API
// cannot be used to discover which MIDs exist.
module.exports = async (req, res, next) => {
    try {
        const mid = req.get("X-MID");
        const timestamp = req.get("X-Timestamp");
        const signature = req.get("X-Signature");

        if (!mid || !timestamp || !signature) {
            return unauthorized(res, "Missing authentication headers: X-MID, X-Timestamp and X-Signature are required");
        }
        if (!isTimestampFresh(timestamp)) {
            return unauthorized(res, "X-Timestamp is malformed or outside the allowed time window");
        }
        if (!MID_FORMAT.test(mid)) {
            return unauthorized(res);
        }

        // path includes the query string, and rawBody is captured in app.js by express.json's `verify`.
        const parts = { timestamp, method: req.method, path: req.originalUrl, rawBody: req.rawBody };

        const secrets = await getUsableSecrets(mid);
        const match = secrets.find((entry) => verify(entry.secret, parts, signature));
        if (!match) {
            return unauthorized(res);
        }

        const merchant = await Merchant.findOne({ mid });
        if (!merchant || !["pending", "active"].includes(merchant.status)) {
            return res.status(403).json({ success: false, message: "Merchant account is not active" });
        }
        if (match.environment === "live" && merchant.status !== "active") {
            return res.status(403).json({ success: false, message: "Live mode requires an approved merchant account" });
        }

        touchLastUsed(match.credentialId, match.lastUsedAt);

        req.merchant = merchant;
        req.merchantApi = {
            merchantId: merchant._id,
            mid,
            environment: match.environment,
            credentialId: match.credentialId,
            merchantStatus: merchant.status
        };
        next();
    } catch (err) {
        next(err);
    }
};
