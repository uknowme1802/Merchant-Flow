const Order = require("../models/Order");
const Merchant = require("../models/Merchant");
const BankAccount = require("../models/BankAccount");
const CallbackDelivery = require("../models/CallbackDelivery");
const ApiError = require("../utils/ApiError");
const { computeFee } = require("../utils/fees");
const { expireIfDue } = require("./orderService");
const { enqueueOrderCallback, resendOrderCallback } = require("./callbackService");
const { STAFF_FAIL_REASON } = require("../constants/order");

// The Payin tab: every order, with totals, and the support actions on a single order. Admins and
// agents use it; merchants have their own screens. Every action is a conditional update that names
// the status (and amount or UTR) it expects to find, so two people acting at once cannot both win.

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Turns the typed filters into one Mongo filter, shared by the table and the totals.
const buildFilter = async ({ search, status, mode, merchant, bank, from, to }) => {
    const filter = {};
    if (status) filter.status = status;
    if (mode) filter.mode = mode;
    if (from || to) filter.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

    if (search) {
        // Exact ids only: these are looked up by index, not scanned.
        filter.$or = [{ orderId: search.toLowerCase() }, { merchantOrderId: search }, { utr: search }];
    }
    if (merchant) {
        const re = new RegExp(escapeRegex(merchant), "i");
        const found = await Merchant.find({ $or: [{ mid: re }, { businessName: re }] }).select("_id").limit(200);
        filter.merchantId = { $in: found.map((m) => m._id) };
    }
    if (bank) {
        const found = await BankAccount.findOne({ bankId: bank.toLowerCase() }).select("_id");
        filter.bankId = found ? found._id : null; // an unknown bank matches nothing
    }
    return filter;
};

// Counts and sums over EVERY order that matches the filters, not just the visible page. Fee and
// payable only exist on successful orders, so they are summed over those.
const computeTotals = async (filter) => {
    const rows = await Order.aggregate([
        { $match: filter },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                amountPaise: { $sum: "$amountPaise" },
                feePaise: { $sum: { $cond: [{ $eq: ["$status", "success"] }, { $ifNull: ["$feePaise", 0] }, 0] } },
                payablePaise: { $sum: { $cond: [{ $eq: ["$status", "success"] }, { $ifNull: ["$payablePaise", 0] }, 0] } }
            }
        }
    ]);

    const byStatus = {
        success: { count: 0, amountPaise: 0 },
        pending: { count: 0, amountPaise: 0 },
        failed: { count: 0, amountPaise: 0 }
    };
    const totals = { count: 0, amountPaise: 0, feePaise: 0, payablePaise: 0, byStatus };
    for (const r of rows) {
        totals.count += r.count;
        totals.amountPaise += r.amountPaise;
        totals.feePaise += r.feePaise;
        totals.payablePaise += r.payablePaise;
        if (byStatus[r._id]) byStatus[r._id] = { count: r.count, amountPaise: r.amountPaise };
    }
    return totals;
};

// `scope` ({ merchantId, mode }) is for a merchant's own view: it replaces the merchant, bank and mode
// filters, which a merchant cannot choose.
const listOrders = async (query, scope = null) => {
    const { page = 1, limit = 20 } = query;
    const filter = await buildFilter(scope ? { ...query, merchant: undefined, bank: undefined, mode: undefined } : query);
    if (scope) Object.assign(filter, { merchantId: scope.merchantId, mode: scope.mode });

    const [orders, total, totals] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
            .populate("merchantId", "mid businessName")
            .populate("bankId", "bankId bankName holderName accountNumber ifsc upiId"),
        Order.countDocuments(filter),
        computeTotals(filter)
    ]);

    // The latest callback for each order on this page, in one query.
    const deliveries = await CallbackDelivery.find({ orderId: { $in: orders.map((o) => o._id) } })
        .select("orderId event status statusCode attempts maxAttempts lastAttemptAt error").sort({ createdAt: -1 });
    const latest = new Map();
    for (const d of deliveries) if (!latest.has(String(d.orderId))) latest.set(String(d.orderId), d);

    return { data: orders.map((o) => ({ order: o, callback: latest.get(String(o._id)) || null })), total, totals, page, limit };
};

// The nine dashboard cards, over successful orders in each merchant's CURRENT mode (sandbox rows stop
// counting once a merchant goes to production). Settlement and payouts do not exist yet, so until
// they do every successful order is "unsettled" and the payout cards are zero. An order from before
// rates were stored has no fee, so it counts as fee 0 and payable = amount. That keeps the check
// total pay-in = charges + unsettled + to be settled + settled payable true on any data.
const dashboardCards = async ({ merchant: mid } = {}) => {
    const match = { status: "success" };
    let merchant = null;
    if (mid) {
        merchant = await Merchant.findOne({ mid }).select("mid businessName mode config");
        if (!merchant) throw new ApiError(404, "Merchant not found");
        match.merchantId = merchant._id;
    }

    const [row] = await Order.aggregate([
        { $match: match },
        { $lookup: { from: Merchant.collection.name, localField: "merchantId", foreignField: "_id", as: "m" } },
        { $unwind: "$m" },
        { $match: { $expr: { $eq: ["$mode", "$m.mode"] } } },
        {
            $group: {
                _id: null,
                count: { $sum: 1 },
                amountPaise: { $sum: "$amountPaise" },
                feePaise: { $sum: { $ifNull: ["$feePaise", 0] } },
                payablePaise: { $sum: { $ifNull: ["$payablePaise", "$amountPaise"] } }
            }
        }
    ]);
    const t = row || { count: 0, amountPaise: 0, feePaise: 0, payablePaise: 0 };

    return {
        merchant: merchant && {
            mid: merchant.mid, businessName: merchant.businessName, mode: merchant.mode,
            payinBps: merchant.config?.payinBps ?? null, payoutBps: merchant.config?.payoutBps ?? null
        },
        successCount: t.count,
        cards: {
            totalPayinPaise: t.amountPaise,
            payinChargesPaise: t.feePaise,
            unsettledPaise: t.payablePaise,
            toBeSettledPaise: 0,
            settledPaise: 0,
            loadBalancePaise: 0,
            availablePaise: 0,
            payoutPaise: 0,
            payoutChargesPaise: 0
        }
    };
};

// The choices for the Merchant and Bank drop-downs. Agents cannot open the admin lists, so the tab
// gets its own small read-only list (public fields only).
const filterOptions = async () => {
    const [merchants, banks] = await Promise.all([
        Merchant.find({}).select("mid businessName").sort({ businessName: 1 }).limit(500).lean(),
        BankAccount.find({}).select("bankId bankName holderName").sort({ bankName: 1 }).limit(500).lean()
    ]);
    return {
        merchants: merchants.map((m) => ({ mid: m.mid, businessName: m.businessName })),
        banks: banks.map((b) => ({ bankId: b.bankId, bankName: b.bankName, holderName: b.holderName }))
    };
};

// Loads one order by its public id. A pending order past its time fails first, so an action never
// works on an order that is really over.
const loadOrder = async (orderId, scope = null) => {
    const order = await Order.findOne({ orderId, ...(scope && { merchantId: scope.merchantId, mode: scope.mode }) });
    if (!order) throw new ApiError(404, "Order not found");
    return expireIfDue(order);
};

const assertEditable = (order, statuses, what) => {
    if (!statuses.includes(order.status)) {
        throw new ApiError(409, `${what} is not possible for an order that is ${order.status}`, "ORDER_STATE_CONFLICT");
    }
};

const changedMeanwhile = () =>
    new ApiError(409, "The order changed while you were editing it. Refresh and try again", "ORDER_STATE_CONFLICT");

// Correct the amount of a pending or successful order (the customer paid a different amount, or it
// was typed wrongly). Stays inside the merchant's own minimum and maximum. A successful order also
// gets its fee and payable recomputed from the rate stored on it.
const updateAmount = async (orderId, amountPaise) => {
    const order = await loadOrder(orderId);
    assertEditable(order, ["pending", "success"], "Changing the amount");
    if (amountPaise === order.amountPaise) throw new ApiError(400, "The amount is already that value");

    const merchant = await Merchant.findById(order.merchantId).select("config");
    const { minAmountPaise, maxAmountPaise } = merchant?.config || {};
    if ((minAmountPaise != null && amountPaise < minAmountPaise) || (maxAmountPaise != null && amountPaise > maxAmountPaise)) {
        throw new ApiError(422, "The amount is outside this merchant's minimum and maximum", "AMOUNT_OUT_OF_RANGE");
    }

    const set = { amountPaise };
    if (order.status === "success") Object.assign(set, computeFee(amountPaise, order.payinBps));
    const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: order.status, amountPaise: order.amountPaise }, { $set: set }, { returnDocument: "after" }
    );
    if (!updated) throw changedMeanwhile();
    return { before: order, after: updated };
};

// Correct the UTR of a successful order. A UTR pays one order only.
const updateUtr = async (orderId, utr) => {
    const order = await loadOrder(orderId);
    assertEditable(order, ["success"], "Changing the UTR");
    if (utr === order.utr) throw new ApiError(400, "The UTR is already that value");
    if (await Order.exists({ utr, _id: { $ne: order._id } })) {
        throw new ApiError(409, "This UTR is already used by another order", "UTR_IN_USE");
    }

    try {
        const updated = await Order.findOneAndUpdate(
            { _id: order._id, status: "success", utr: order.utr }, { $set: { utr } }, { returnDocument: "after" }
        );
        if (!updated) throw changedMeanwhile();
        return { before: order, after: updated };
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "This UTR is already used by another order", "UTR_IN_USE");
        throw err;
    }
};

// Fail a pending or successful order for good. The merchant is told with a failed callback (when
// auto-trigger is on). Money that arrived is not touched: that is a refund, a later step.
const failOrder = async (orderId) => {
    const order = await loadOrder(orderId);
    assertEditable(order, ["pending", "success"], "Failing the order");

    const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: order.status },
        { $set: { status: "failed", statusReason: STAFF_FAIL_REASON } },
        { returnDocument: "after" }
    );
    if (!updated) throw changedMeanwhile();
    await enqueueOrderCallback(updated);
    return { before: order, after: updated };
};

// Send the order's current result to the merchant now. Returns the order and the delivery.
const resendCallbackForOrder = async (orderId, scope = null) => {
    const order = await loadOrder(orderId, scope);
    const delivery = await resendOrderCallback(order);
    return { order, delivery };
};

module.exports = { listOrders, dashboardCards, filterOptions, updateAmount, updateUtr, failOrder, resendCallbackForOrder };
