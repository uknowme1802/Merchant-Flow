const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const {
    createWebhook,
    listWebhook,
    toggleWebhook,
    deleteWebhook,
    listDeliveries
} = require("../controllers/webhookController");

router.post("/",authMiddleware, adminMiddleware, createWebhook);
router.get("/", authMiddleware, adminMiddleware, listWebhook);
router.patch("/:id", authMiddleware, adminMiddleware, toggleWebhook);
router.delete("/:id", authMiddleware, adminMiddleware, deleteWebhook);
router.get("/:id/deliveries", authMiddleware, adminMiddleware, listDeliveries);

router.exports = router;