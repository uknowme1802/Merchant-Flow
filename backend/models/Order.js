const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../constants/order");
const { MERCHANT_MODES } = require("../constants/merchant");

// A payment request created by a merchant through POST /v1/orders. The customer pays the bank
// account shown on the checkout page, then enters the UTR to claim the payment.
// Amounts are integer paise. Unlike the old Transaction, an order always belongs to a merchant.
const orderSchema = new mongoose.Schema({
    // Public id, for example "ord_k3x9f2ab7mqp3x9f". It is also the checkout page address, so it
    // is long and random; it is not a secret but it is not guessable either.
    orderId: { type: String, required: true, unique: true, immutable: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true },
    // The merchant's mode when the order was created. Screens only show the current mode.
    mode: { type: String, enum: MERCHANT_MODES, required: true, immutable: true },

    // The merchant's own reference. Optional; when sent it also makes the create call idempotent.
    merchantOrderId: { type: String, default: undefined },

    amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, default: "INR", immutable: true },
    description: { type: String, trim: true, maxlength: 200, default: "" },
    customerName: { type: String, trim: true, maxlength: 120, default: "" },

    status: { type: String, enum: ORDER_STATUS, default: "pending" },
    statusReason: { type: String, default: null },

    // The bank account this order asks the customer to pay.
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", required: true },

    expiresAt: { type: Date, required: true },

    // Set when a payment is claimed.
    utr: { type: String, default: null },
    claimedCreditId: { type: mongoose.Schema.Types.ObjectId, ref: "BankCredit", default: null },
    paidAt: { type: Date, default: null }
}, { timestamps: true });

orderSchema.index({ merchantId: 1, mode: 1, createdAt: -1 });
orderSchema.index({ bankId: 1, createdAt: -1 });
// The expiry sweep looks for pending orders that are past their time.
orderSchema.index({ status: 1, expiresAt: 1 });
// One merchant order id per merchant and mode; partial so orders without one are not affected.
orderSchema.index(
    { merchantId: 1, mode: 1, merchantOrderId: 1 },
    { unique: true, partialFilterExpression: { merchantOrderId: { $type: "string" } } }
);

module.exports = mongoose.model("Order", orderSchema);
