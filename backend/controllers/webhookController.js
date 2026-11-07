const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");

exports.createWebhook = async ( req, res, next ) => {
    try {
        const { url, events, secret } = req.body;

        if (!url || typeof url !== "string"){
            return res.status(400).json({
                success: false,
                message: "A valid URL is required"
            });
        }

        try {
            new URL(url);
        } catch {
            return res.status(400).json({
                success: false,
                message: "URL must a valid absolute URL"
            });
        }

        let eventList = Webhook.EVENTS;
        if(events){
            if(!Array.isArray(events) || events.some((e)=> !Webhook.EVENTS.includes(e))){
                return res.status(400).json({
                    success: false,
                    message: `events must be a array containing only: ${Webhook.EVENTS.join(", ")}`
                });
            }

            eventList = events;
        }

        const webhook = await Webhook.create({
            url,
            events: eventList,
            secret: secret || Webhook.generateSecret()
        });

        res.status(201).json({
            success: true,
            data: {
                _id: webhook._id,
                url: webhook.url,
                events: webhook.events,
                active: webhook.active,
                secret: webhook.secret
            }
        })
    } catch(err){
        next(err);
    }
};

exports.listWebhooks = async (req, res, next) => {
    try {
        const webhooks = await Webhook.find().sort({createdAt: -1});
        res.json({ success: true, data: webhooks });
    } catch (err){
        next(err);
    }
};

exports.toggleWebhook = async (req, res, next) => {
    try {
        const {active} = req.body;
        if(typeof active !== "boolean"){
            return res.status(400).json({
                success: false,
                message: "active must be true or false"
            });
        }
        const webhook = await Webhook.findByIdAndUpdate(
            req.params.id,
            {active},
            { new: true }
        );

        if (!webhook){
            return res.status(404).json({
                success: false,
                message: "Webhook not found"
            })
        }

        res.json({ success: true, data: webhook})
    } catch(err){
        next (err);
    }
};

exports.deleteWebhook = async (req, res, next) => {
    try {
        const webhook = await Webhook.findByIdAndDelete(req.params.id);

        if(!webhook){
            return res.status(404).json({
                success: false,
                message: "Webhook not found"
            })
        }

        res.json({
            success: true,
            message: "Webhook deleted!"
        })
    } catch(err){
        next (err);
    }
};

exports.listDeliveries = async (req, res, next) => {

    try {
        const deliveries = await WebhookDelivery.find({webhookId: req.params.id})
                                .sort({createdAt: -1})
                                .limit(25);

        res.json({
            success: true,
            data: deliveries
        })
    } catch(err){
        next(err);
    }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/webhooks/deliveries?transactionId=TXN-...&page=1&limit=20
// Every delivery across all webhooks, newest first. transactionId is an optional
// case-insensitive "contains" search.
exports.listAllDeliveries = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

        const filter = {};
        const search = typeof req.query.transactionId === "string" ? req.query.transactionId.trim() : "";
        if(search){
            filter.transactionId = { $regex: escapeRegex(search), $options: "i" };
        }

        const [deliveries, total] = await Promise.all([
            WebhookDelivery.find(filter)
                .sort({createdAt: -1})
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("webhookId", "url")
                .lean(),
            WebhookDelivery.countDocuments(filter)
        ]);

        const data = deliveries.map(({ webhookId, ...d }) => ({
            ...d,
            webhook: webhookId ? { _id: webhookId._id, url: webhookId.url } : null
        }));

        res.json({ success: true, page, limit, total, data });
    } catch(err){
        next(err);
    }
};
