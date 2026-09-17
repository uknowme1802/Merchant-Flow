const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");

exports.createWebhook = async ( req, res, next ) => {
    try {
        const { utr, events, secret } = req.body;

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
                    message: `events must be a array containing only: ${Webhook.EVENTS.join("")}`
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
                secret: webbhook.secret
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

exports.toggleWebhooks = async (req, res, next) => {
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
        const webbhook = await Webhook.findByIdAndDelete(req.params.id);

        if(!webbhook){
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

exports.listdeliveries = async (req, res, next) => {

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

                        