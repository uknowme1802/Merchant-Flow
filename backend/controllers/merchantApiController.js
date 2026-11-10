// GET /v1/whoami  (signed request)
//
// The smallest possible authenticated endpoint. A merchant calls it to check that their MID,
// secret and signing code work, and which environment the key belongs to. Phase 2 adds
// /v1/orders beside it, using the same signature middleware.
exports.whoami = (req, res) => {
    res.json({
        success: true,
        mid: req.merchantApi.mid,
        environment: req.merchantApi.environment,
        merchant: {
            businessName: req.merchant.businessName,
            status: req.merchant.status
        }
    });
};
