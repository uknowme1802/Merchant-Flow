const crypto = require("crypto");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");

const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000;

const signPayload = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("hex");

const deliverToWebhook = async( Webhook,event,payload) => {
    const body = JSON.stringify({ event, data: payload, timestamp:new Date().toISOString()});

    const signature = signPayload(Webhook, secret, body);

    let statusCode = null;
    let success = false;
    let error = null;

    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(Webhook.url, {
            method: "POST",
            headers: {
                "Content-Type":"application/json",
                "X-Webhook-Signature":"signature",
                "X-Webhook-Event":event
            },
            body,
            signal: controller.signal
        });

        statusCode= res.status;
        success: res.ok;
        if(!success) {
            error = `Reciever responded with ${res.status}`;
        }
    } catch(err){
        success= false;
        error= err.name === "AbortError"? "Request time out" : err.message;
    } finally {
        clearTimeout(timeout);
    }

    try {
        await WebhookDelivery.create({
            webhookId: webhook._id,
            event,
            payload,
            statusCode,
            success,
            error
        });
    } catch(logErr) {
        console.warn("⚠️ Warning: Could not record webhook delivery:", logErr.message);
    }
};

// Call this from anywhere a meaningful event happens. Fires all matching,
// active webhooks concurrently and never rejects — callers can fire-and-forget.

const triggerWebhooks = async (event, payload) => {
    try {
        const webhooks = await Webhook.find({active: true, events: event}).select("+secret");

        if(!webhook.length) return;

        await Promise.allSettled(
            webhook.map((webhook) => deliverToWebhook(webhook, event, payload))
        )
    } catch(err){
        console.warn("⚠️ Warning! triggerWebhook failed:", err.message);
    }
};

module.exports = {triggerWebhooks, signPayload};