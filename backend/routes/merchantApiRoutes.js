const express = require("express");
const router = express.Router();

const signatureAuth = require("../middleware/signatureAuth");
const merchantApiRateLimiter = require("../middleware/merchantApiRateLimiter");
const { whoami } = require("../controllers/merchantApiController");

// The signed merchant API (server to server). Every route is authenticated by MID + signature,
// then rate limited per MID. Phase 2 adds /v1/orders here.
router.use(signatureAuth, merchantApiRateLimiter);

router.get("/whoami", whoami);

module.exports = router;
