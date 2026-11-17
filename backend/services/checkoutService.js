const QRCode = require("qrcode");
const BankAccount = require("../models/BankAccount");
const Merchant = require("../models/Merchant");
const ApiError = require("../utils/ApiError");
const { getOrderByPublicId } = require("./orderService");
const { claimPayment, CLAIM } = require("./claimService");
const { enqueueOrderCallback } = require("./callbackService");
const { allowedOrigins } = require("../config/origins");

// Where the customer pays. CHECKOUT_BASE_URL is the public address of the web app (the page is
// /pay/<orderId>); without it the first allowed origin is used.
const checkoutUrl = (orderId) => {
    const base = (process.env.CHECKOUT_BASE_URL || allowedOrigins()[0] || "").replace(/\/+$/, "");
    return `${base}/pay/${orderId}`;
};

// What the merchant sees about an order (API responses). No bank details: those are for the customer.
const toMerchantOrderView = (order) => ({
    orderId: order.orderId,
    merchantOrderId: order.merchantOrderId ?? null,
    mode: order.mode,
    amountPaise: order.amountPaise,
    currency: order.currency,
    description: order.description,
    customerName: order.customerName,
    status: order.status,
    statusReason: order.statusReason,
    utr: order.status === "success" ? order.utr : null,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    checkoutUrl: checkoutUrl(order.orderId)
});

// A standard UPI payment link: opening it in a UPI app pre-fills who to pay and how much.
const upiUri = (bank, order) =>
    "upi://pay?" + new URLSearchParams({
        pa: bank.upiId,
        pn: bank.holderName,
        am: (order.amountPaise / 100).toFixed(2),
        cu: "INR",
        tn: order.orderId
    }).toString();

// What the customer's checkout page shows. Anyone with the order id can read it, so the bank
// details are only included while the order can still be paid, and the account number and IFSC
// are never included (UPI needs only the UPI id).
const getCheckoutView = async (orderId) => {
    const order = await getOrderByPublicId(orderId);
    if (!order) return null;

    const merchant = await Merchant.findById(order.merchantId).select("businessName");
    const view = {
        orderId: order.orderId,
        status: order.status,
        statusReason: order.statusReason,
        mode: order.mode,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: order.description,
        merchantName: merchant?.businessName ?? "",
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
        payment: null
    };

    if (order.status === "pending") {
        const bank = await BankAccount.findById(order.bankId);
        if (bank) {
            const uri = upiUri(bank, order);
            view.payment = {
                holderName: bank.holderName,
                bankName: bank.bankName,
                upiId: bank.upiId,
                upiUri: uri,
                qrDataUrl: bank.qrEnabled ? await QRCode.toDataURL(uri, { margin: 1, width: 240 }) : null
            };
        }
    }
    return view;
};

// The customer enters their UTR. Every failure uses the same wording for "not found" so the page
// never reveals whether some other UTR exists.
const submitClaim = async (orderId, utr) => {
    const order = await getOrderByPublicId(orderId);
    if (!order) throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    if (order.status !== "pending") throw notPending(order.status);

    const { result, order: paid } = await claimPayment(order, utr);
    if (result === CLAIM.NOT_FOUND) {
        throw new ApiError(
            404,
            "We could not find this payment yet. Check the UTR and the amount, or try again in a few minutes.",
            "PAYMENT_NOT_FOUND"
        );
    }
    if (result === CLAIM.NOT_PENDING) {
        // The order ran out of time or was closed while the claim was in progress.
        const fresh = await getOrderByPublicId(orderId);
        throw notPending(fresh?.status ?? "failed");
    }
    // Tell the merchant. A failure here is logged and never turns a paid order into an error.
    await enqueueOrderCallback(paid);
    return getCheckoutView(orderId);
};

const notPending = (status) =>
    new ApiError(
        409,
        status === "success" ? "This order is already paid" : "This order has expired. Please go back and start a new payment.",
        "ORDER_NOT_PENDING"
    );

module.exports = { checkoutUrl, toMerchantOrderView, getCheckoutView, submitClaim };
