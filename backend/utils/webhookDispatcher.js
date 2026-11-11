const crypto = require("crypto");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const { webhookDeliveries } = require("./metrics");
const { assertPublicUrl } = require("./ssrf");
const logger = require("./logger");

const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000;

// Total attempts (first send + retries). Delay after attempt N is BACKOFF_MINUTES[N-1].
const MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS) || 5;
const BACKOFF_MINUTES = [1, 5, 30, 120];
const WORKER_INTERVAL_MS = Number(process.env.WEBHOOK_RETRY_INTERVAL_MS) || 30000;
const LEASE_MS = 5 * 60 * 1000; // a claimed retry is invisible to other workers for this long

const signPayload = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("hex");

// Date of the next retry after `attempts` sends, or null once attempts are exhausted.
const nextRetryDate = (attempts) => {
    if (attempts >= MAX_ATTEMPTS) return null;
    const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
    return new Date(Date.now() + minutes * 60 * 1000);
};

// One HTTP POST to the receiver. Never throws.
const sendRequest = async (webhook, event, payload) => {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = signPayload(webhook.secret, body);

    let statusCode = null;
    let success = false;
    let error = null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        await assertPublicUrl(webhook.url);

        const res = await fetch(webhook.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Event": event
            },
            body,
            // Never follow redirects: a public URL could redirect to an internal address
            redirect: "manual",
            signal: controller.signal
        });

        statusCode = res.status;
        success = res.ok;
        if (!success) {
            error = `Reciever responded with ${res.status}`;
        }
    } catch (err) {
        success = false;
        error = err.name === "AbortError" ? "Request timed out" : err.message;
    } finally {
        clearTimeout(timeout);
    }

    return { statusCode, success, error };
};

const deliverToWebhook = async (webhook, event, payload) => {
    const { statusCode, success, error } = await sendRequest(webhook, event, payload);

    webhookDeliveries.inc({ event, outcome: success ? "success" : "failure" });

    try {
        await WebhookDelivery.create({
            webhookId: webhook._id,
            event,
            transactionId: payload?.transactionId ?? null,
            payload,
            statusCode,
            success,
            error,
            attempts: 1,
            nextRetryAt: success ? null : nextRetryDate(1)
        });
    } catch (logErr) {
        logger.warn("Could not record webhook delivery", { error: logErr.message });
    }
};

// Call this from anywhere a meaningful event happens. Fires all matching,
// active webhooks concurrently and never rejects — callers can fire-and-forget.
const triggerWebhooks = async (event, payload) => {
    try {
        const webhooks = await Webhook.find({ active: true, events: event }).select("+secret");

        if (!webhooks.length) return;

        await Promise.allSettled(
            webhooks.map((webhook) => deliverToWebhook(webhook, event, payload))
        );
    } catch (err) {
        logger.warn("triggerWebhooks failed", { event, error: err.message });
    }
};

// Re-send a stored delivery and update the same log row. `resetAttempts` is used by manual
// replays so a replay gets a fresh retry cycle.
const resendDelivery = async (delivery, webhook, { resetAttempts = false } = {}) => {
    const { statusCode, success, error } = await sendRequest(webhook, delivery.event, delivery.payload);
    const attempts = resetAttempts ? 1 : (delivery.attempts || 1) + 1;

    webhookDeliveries.inc({ event: delivery.event, outcome: success ? "retry_success" : "retry_failure" });

    await WebhookDelivery.updateOne(
        { _id: delivery._id },
        { $set: { statusCode, success, error, attempts, nextRetryAt: success ? null : nextRetryDate(attempts) } }
    );

    return { success, statusCode, error, attempts };
};

// Retries every delivery whose nextRetryAt is due. Each row is claimed atomically (its
// nextRetryAt is pushed forward as a lease), so several server instances never double-send.
const processDueRetries = async (batchSize = 20) => {
    let processed = 0;

    for (let i = 0; i < batchSize; i++) {
        const delivery = await WebhookDelivery.findOneAndUpdate(
            { success: false, nextRetryAt: { $ne: null, $lte: new Date() } },
            { $set: { nextRetryAt: new Date(Date.now() + LEASE_MS) } },
            { sort: { nextRetryAt: 1 }, returnDocument: "before" }
        );
        if (!delivery) break;

        processed += 1;
        try {
            const webhook = await Webhook.findById(delivery.webhookId).select("+secret");

            if (!webhook || !webhook.active) {
                await WebhookDelivery.updateOne(
                    { _id: delivery._id },
                    { $set: { nextRetryAt: null, error: "Retries stopped: webhook deleted or disabled" } }
                );
                continue;
            }

            await resendDelivery(delivery, webhook);
        } catch (err) {
            logger.warn("Webhook retry failed", { deliveryId: String(delivery._id), error: err.message });
        }
    }

    return processed;
};

// Starts the background retry loop. Returns a function that stops it.
const startRetryWorker = () => {
    let running = false;
    const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await processDueRetries();
        } catch (err) {
            logger.warn("Webhook retry worker tick failed", { error: err.message });
        } finally {
            running = false;
        }
    }, WORKER_INTERVAL_MS);
    timer.unref?.();

    return () => clearInterval(timer);
};

// Manual replay from the admin UI. Resolves to the outcome, or throws an error with `.status`.
const replayDelivery = async (deliveryId) => {
    const delivery = await WebhookDelivery.findById(deliveryId);
    if (!delivery) {
        throw Object.assign(new Error("Delivery not found"), { status: 404 });
    }

    const webhook = await Webhook.findById(delivery.webhookId).select("+secret");
    if (!webhook) {
        throw Object.assign(new Error("The webhook for this delivery no longer exists"), { status: 409 });
    }

    return resendDelivery(delivery, webhook, { resetAttempts: true });
};

module.exports = {
    triggerWebhooks,
    signPayload,
    processDueRetries,
    startRetryWorker,
    replayDelivery,
    nextRetryDate,
    MAX_ATTEMPTS
};
