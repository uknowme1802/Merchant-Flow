const Order = require("../models/Order");
const ApiError = require("../utils/ApiError");
const { generateOrderId } = require("../utils/identifiers");
const { selectBank } = require("./bankSelectionService");
const { enqueueOrderCallback } = require("./callbackService");
const { ORDER_EXPIRY_MINUTES } = require("../constants/order");
const { MODE_ENVIRONMENT } = require("../constants/merchant");

const MAX_ID_ATTEMPTS = 5;

// Creates an order for a merchant and picks the bank the customer must pay.
//
// Rules:
//  - the key used must belong to the merchant's current mode (a sandbox key cannot create
//    production orders and the other way round);
//  - the amount must be inside the merchant's own min and max from Edit Config;
//  - sending the same merchantOrderId again returns the order that already exists (same amount)
//    instead of creating a second one, so a retried request is safe.
// Returns { order, created }.
const createOrder = async (merchant, environment, input) => {
    if (MODE_ENVIRONMENT[merchant.mode] !== environment) {
        throw new ApiError(403, `This key is for ${environment}, but the merchant is in ${merchant.mode} mode`, "WRONG_ENVIRONMENT");
    }
    if (merchant.status !== "active") {
        throw new ApiError(403, "Orders can only be created once the merchant account is approved", "MERCHANT_NOT_ACTIVE");
    }

    const { amountPaise, merchantOrderId, description, customerName } = input;
    const { minAmountPaise, maxAmountPaise } = merchant.config || {};
    if (minAmountPaise != null && amountPaise < minAmountPaise) {
        throw new ApiError(422, `Amount is below this merchant's minimum of ${minAmountPaise} paise`, "AMOUNT_OUT_OF_RANGE");
    }
    if (maxAmountPaise != null && amountPaise > maxAmountPaise) {
        throw new ApiError(422, `Amount is above this merchant's maximum of ${maxAmountPaise} paise`, "AMOUNT_OUT_OF_RANGE");
    }

    if (merchantOrderId) {
        const existing = await Order.findOne({ merchantId: merchant._id, mode: merchant.mode, merchantOrderId });
        if (existing) return reuse(existing, amountPaise);
    }

    const bank = await selectBank(merchant, amountPaise);
    const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);

    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
        try {
            const order = await Order.create({
                orderId: generateOrderId(),
                merchantId: merchant._id,
                mode: merchant.mode,
                merchantOrderId: merchantOrderId || undefined,
                amountPaise,
                description,
                customerName,
                bankId: bank._id,
                expiresAt
            });
            return { order, created: true };
        } catch (err) {
            if (err.code !== 11000) throw err;
            // Two requests with the same merchantOrderId raced: the other one won, return its order.
            if (merchantOrderId) {
                const winner = await Order.findOne({ merchantId: merchant._id, mode: merchant.mode, merchantOrderId });
                if (winner) return reuse(winner, amountPaise);
            }
            // Otherwise it was an orderId clash (astronomically rare); try a new id.
        }
    }
    throw new ApiError(500, "Could not allocate an order id, please try again");
};

const reuse = (existing, amountPaise) => {
    if (existing.amountPaise !== amountPaise) {
        throw new ApiError(409, "merchantOrderId was already used for an order with a different amount", "MERCHANT_ORDER_ID_REUSED");
    }
    return { order: existing, created: false };
};

// Marks one order failed if its time ran out, and returns the fresh order. The update only
// matches a pending order past its expiry, so it is safe to call on every read.
const expireIfDue = async (order) => {
    if (order.status !== "pending" || order.expiresAt > new Date()) return order;
    const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: "pending", expiresAt: { $lte: new Date() } },
        { $set: { status: "failed", statusReason: "expired" } },
        { returnDocument: "after" }
    );
    // If it lost a race to a successful claim, read the real state.
    if (!updated) return Order.findById(order._id);
    await enqueueOrderCallback(updated);
    return updated;
};

// Fails every pending order whose time ran out. The background worker calls this; reading an
// order also expires it, so nothing waits on the job.
const expireDueOrders = async (batchSize = 200) => {
    // One at a time, so each order that really expired gets its own callback and an order that was
    // paid at the last second is left alone.
    const due = await Order.find({ status: "pending", expiresAt: { $lte: new Date() } }).limit(batchSize);
    let expired = 0;
    for (const order of due) {
        const updated = await Order.findOneAndUpdate(
            { _id: order._id, status: "pending", expiresAt: { $lte: new Date() } },
            { $set: { status: "failed", statusReason: "expired" } },
            { returnDocument: "after" }
        );
        if (!updated) continue;
        expired += 1;
        await enqueueOrderCallback(updated);
    }
    return expired;
};

const getOrderByPublicId = async (orderId) => {
    const order = await Order.findOne({ orderId });
    return order ? expireIfDue(order) : null;
};

const getMerchantOrder = async (merchant, orderId) => {
    const order = await Order.findOne({ orderId, merchantId: merchant._id, mode: merchant.mode });
    return order ? expireIfDue(order) : null;
};

module.exports = { createOrder, expireIfDue, expireDueOrders, getOrderByPublicId, getMerchantOrder };
