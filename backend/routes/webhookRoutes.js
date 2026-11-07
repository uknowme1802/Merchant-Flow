const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

const {
    createWebhook,
    listWebhooks,
    toggleWebhook,
    deleteWebhook,
    listDeliveries,
    listAllDeliveries,
    replayDeliveryHandler
} = require("../controllers/webhookController");

router.post("/",authMiddleware, adminMiddleware, validate(schemas.createWebhook), createWebhook);
router.get("/", authMiddleware, adminMiddleware, listWebhooks);
router.get("/deliveries", authMiddleware, adminMiddleware, listAllDeliveries);
router.post("/deliveries/:id/replay", authMiddleware, adminMiddleware, replayDeliveryHandler);
router.patch("/:id", authMiddleware, adminMiddleware, validate(schemas.toggleWebhook), toggleWebhook);
router.delete("/:id", authMiddleware, adminMiddleware, deleteWebhook);
router.get("/:id/deliveries", authMiddleware, adminMiddleware, listDeliveries);

module.exports = router;