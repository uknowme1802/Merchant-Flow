const crypto = require("crypto");
const Merchant = require("../models/Merchant");
const MerchantCredential = require("../models/MerchantCredential");
const CallbackDelivery = require("../models/CallbackDelivery");
const { decrypt } = require("../utils/credentialCrypto");
const { assertPublicUrl } = require("../utils/ssrf");
const { MODE_ENVIRONMENT } = require("../constants/merchant");
const {
    CALLBACK_RETRY_MS, CALLBACK_MAX_ATTEMPTS, CALLBACK_TIMEOUT_MS, CALLBACK_LEASE_MS
} = require("../constants/callback");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

const sign = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("hex");

// The key that signs callbacks: the merchant's active key for the order's mode. Retiring keys are
// not used for new signatures.
const signingSecret = async (mid, mode) => {
    const cred = await MerchantCredential.findOne({
        mid, environment: MODE_ENVIRONMENT[mode], status: "active"
    }).select("+secretEnc");
    if (!cred) return null;
    return decrypt(cred.secretEnc, `${cred.mid}:${cred.environment}`);
};

const buildBody = (event, order) => JSON.stringify({
    event,
    data: {
        orderId: order.orderId,
        merchantOrderId: order.merchantOrderId ?? null,
        status: order.status,
        statusReason: order.statusReason,
        amountPaise: order.amountPaise,
        currency: order.currency,
        utr: order.utr,
        paidAt: order.paidAt,
        mode: order.mode
    },
    timestamp: new Date().toISOString()
});

// One HTTP POST. Delivered means exactly HTTP 200. Never throws.
const post = async (delivery, secret) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
    try {
        await assertPublicUrl(delivery.url);
        const res = await fetch(delivery.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Callback-Signature": sign(secret, delivery.body),
                "X-Callback-Event": delivery.event
            },
            body: delivery.body,
            redirect: "manual", // a public URL must not bounce us to an internal address
            signal: controller.signal
        });
        return res.status === 200
            ? { ok: true, statusCode: 200, error: null }
            : { ok: false, statusCode: res.status, error: `Receiver responded with ${res.status}, expected 200` };
    } catch (err) {
        return { ok: false, statusCode: null, error: err.name === "AbortError" ? "Request timed out" : err.message };
    } finally {
        clearTimeout(timer);
    }
};

// Sends one delivery that the caller already claimed, and records the outcome.
const attempt = async (delivery) => {
    const merchant = await Merchant.findById(delivery.merchantId).select("mid");
    const secret = merchant ? await signingSecret(merchant.mid, delivery.mode) : null;
    const result = secret
        ? await post(delivery, secret)
        : { ok: false, statusCode: null, error: "No active API key to sign the callback" };

    const attempts = delivery.attempts + 1;
    const now = new Date();
    const set = { attempts, statusCode: result.statusCode, error: result.error, lastAttemptAt: now };
    if (result.ok) {
        Object.assign(set, { status: "delivered", deliveredAt: now, nextRetryAt: null });
    } else if (attempts >= delivery.maxAttempts) {
        Object.assign(set, { status: "failed", nextRetryAt: null });
    } else {
        Object.assign(set, { status: "pending", nextRetryAt: new Date(now.getTime() + CALLBACK_RETRY_MS) });
    }
    // Only write if the row is still waiting (a cancel at a mode switch wins over a late result).
    return CallbackDelivery.findOneAndUpdate(
        { _id: delivery._id, status: "pending" }, { $set: set }, { returnDocument: "after" }
    );
};

// Called when an order reaches success or failed. Creates the delivery and starts the first
// attempt in the background. Never throws: a callback problem must not break a payment.
const enqueueOrderCallback = async (order) => {
    try {
        const merchant = await Merchant.findById(order.merchantId);
        if (!merchant || !merchant.config?.callbackUrl || merchant.config.webhookAutoTrigger === false) return null;
        // An order from the other mode must never call the current mode's URL.
        if (merchant.mode !== order.mode) return null;

        const event = order.status === "success" ? "order.success" : "order.failed";
        const delivery = await CallbackDelivery.findOneAndUpdate(
            { orderId: order._id, event },
            {
                $setOnInsert: {
                    merchantId: merchant._id, orderPublicId: order.orderId, mode: order.mode, event,
                    url: merchant.config.callbackUrl, body: buildBody(event, order),
                    maxAttempts: CALLBACK_MAX_ATTEMPTS, nextRetryAt: new Date()
                }
            },
            { upsert: true, returnDocument: "after" }
        );
        kick();
        return delivery;
    } catch (err) {
        logger.warn("Could not queue a callback", { orderId: order.orderId, error: err.message });
        return null;
    }
};

// Claims the next due delivery (its retry time is pushed forward as a lease) and sends it.
const processDueCallbacks = async (batchSize = 20) => {
    let processed = 0;
    for (let i = 0; i < batchSize; i++) {
        const delivery = await CallbackDelivery.findOneAndUpdate(
            { status: "pending", nextRetryAt: { $ne: null, $lte: new Date() } },
            { $set: { nextRetryAt: new Date(Date.now() + CALLBACK_LEASE_MS) } },
            { sort: { nextRetryAt: 1 }, returnDocument: "before" }
        );
        if (!delivery) break;
        processed += 1;
        try {
            await attempt(delivery);
        } catch (err) {
            logger.warn("Callback attempt failed", { deliveryId: String(delivery._id), error: err.message });
        }
    }
    return processed;
};

// Starts the first attempt without making the caller wait. Tests call processDueCallbacks directly.
let kicking = false;
const kick = () => {
    if (kicking || process.env.NODE_ENV === "test") return;
    kicking = true;
    setImmediate(() => processDueCallbacks().catch(() => {}).finally(() => { kicking = false; }));
};

// Resend by hand: starts a fresh retry cycle and sends right away. `scope` limits which rows the
// caller may touch (a merchant passes its own id and current mode; an admin passes {}).
const resendCallback = async (deliveryId, scope = {}) => {
    const claimed = await CallbackDelivery.findOneAndUpdate(
        { _id: deliveryId, ...scope, status: { $in: ["pending", "delivered", "failed"] } },
        { $set: { status: "pending", attempts: 0, nextRetryAt: new Date(Date.now() + CALLBACK_LEASE_MS) } },
        { returnDocument: "after" }
    );
    if (!claimed) {
        const exists = await CallbackDelivery.exists({ _id: deliveryId, ...scope });
        if (!exists) throw new ApiError(404, "Callback not found");
        throw new ApiError(409, "This callback was cancelled and cannot be resent");
    }
    return (await attempt(claimed)) || CallbackDelivery.findById(claimed._id);
};

// Resend from the Payin tab: sends the order's CURRENT state now, even when auto-trigger is off. The
// callback for the order's present result (success or failed) is created if it does not exist yet,
// its body is rebuilt from the order as it is now (an amount or UTR may have been corrected), and
// it goes to the merchant's current callback URL. Starts a fresh retry cycle like any manual resend.
const resendOrderCallback = async (order) => {
    if (order.status === "pending") {
        throw new ApiError(409, "This order is still pending, so there is nothing to send yet", "ORDER_PENDING");
    }
    const merchant = await Merchant.findById(order.merchantId);
    if (!merchant || !merchant.config?.callbackUrl) {
        throw new ApiError(422, "This merchant has no callback URL", "NO_CALLBACK_URL");
    }
    if (merchant.mode !== order.mode) {
        throw new ApiError(409, "This order belongs to the merchant's other mode, so it cannot be sent", "ORDER_WRONG_MODE");
    }

    const event = order.status === "success" ? "order.success" : "order.failed";
    let delivery = await CallbackDelivery.findOne({ orderId: order._id, event });
    if (!delivery) {
        try {
            // No retry time, so the background worker leaves it alone until the claim below.
            delivery = await CallbackDelivery.create({
                merchantId: merchant._id, orderId: order._id, orderPublicId: order.orderId, mode: order.mode, event,
                url: merchant.config.callbackUrl, body: buildBody(event, order),
                maxAttempts: CALLBACK_MAX_ATTEMPTS, nextRetryAt: null
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
            delivery = await CallbackDelivery.findOne({ orderId: order._id, event });
        }
    }

    const claimed = await CallbackDelivery.findOneAndUpdate(
        { _id: delivery._id, status: { $in: ["pending", "delivered", "failed"] } },
        {
            $set: {
                body: buildBody(event, order), url: merchant.config.callbackUrl,
                status: "pending", attempts: 0, nextRetryAt: new Date(Date.now() + CALLBACK_LEASE_MS)
            }
        },
        { returnDocument: "after" }
    );
    if (!claimed) throw new ApiError(409, "This callback was cancelled and cannot be resent");
    return (await attempt(claimed)) || CallbackDelivery.findById(claimed._id);
};

// At the switch between sandbox and production: stop what is still waiting in the mode being left.
const cancelPendingCallbacks = async (merchantId, mode) => {
    const res = await CallbackDelivery.updateMany(
        { merchantId, mode, status: "pending" },
        { $set: { status: "cancelled", nextRetryAt: null, error: "Cancelled: the merchant changed mode" } }
    );
    return res.modifiedCount;
};

const listCallbacks = async ({ page = 1, limit = 20, merchantId, mode, status, orderId, from, to }) => {
    const filter = {};
    if (merchantId) filter.merchantId = merchantId;
    if (mode) filter.mode = mode;
    if (status) filter.status = status;
    if (orderId) filter.orderPublicId = orderId;
    if (from || to) filter.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

    const [data, total] = await Promise.all([
        CallbackDelivery.find(filter).select("-body").sort({ createdAt: -1 })
            .skip((page - 1) * limit).limit(limit).populate("merchantId", "mid businessName"),
        CallbackDelivery.countDocuments(filter)
    ]);
    return { data, total, page, limit };
};

// One delivery with its sent body, for the Data Sent view.
const getCallback = async (id) => {
    const delivery = await CallbackDelivery.findById(id);
    if (!delivery) throw new ApiError(404, "Callback not found");
    return delivery;
};

// Background loop: sends due callbacks, after running `beforeTick` (the order expiry sweep).
const startCallbackWorker = (beforeTick) => {
    const interval = Number(process.env.CALLBACK_WORKER_INTERVAL_MS) || 15000;
    let running = false;
    const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
            if (beforeTick) await beforeTick();
            await processDueCallbacks();
        } catch (err) {
            logger.warn("Callback worker tick failed", { error: err.message });
        } finally {
            running = false;
        }
    }, interval);
    timer.unref?.();
    return () => clearInterval(timer);
};

module.exports = {
    enqueueOrderCallback, processDueCallbacks, resendCallback, resendOrderCallback, cancelPendingCallbacks,
    listCallbacks, getCallback, startCallbackWorker, sign
};
