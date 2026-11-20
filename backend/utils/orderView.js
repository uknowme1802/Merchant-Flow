// How an order and its latest callback are shown on a screen. Staff see the full bank account
// number; a merchant sees only its last 4 digits.

const callbackView = (d) => d && ({
    event: d.event, status: d.status, statusCode: d.statusCode, attempts: d.attempts,
    maxAttempts: d.maxAttempts, lastAttemptAt: d.lastAttemptAt, error: d.error
});

const maskAccount = (number) => {
    const text = String(number || "");
    return text.length > 4 ? `${"*".repeat(text.length - 4)}${text.slice(-4)}` : text;
};

// { order, callback } as returned by payinService.listOrders. `forMerchant` hides what a merchant
// has no need to see: its own merchant block, the internal status reason, and the full account number.
const toRow = ({ order: o, callback }, { forMerchant = false } = {}) => {
    const row = {
        id: o._id,
        orderId: o.orderId,
        merchantOrderId: o.merchantOrderId ?? null,
        mode: o.mode,
        status: o.status,
        amountPaise: o.amountPaise,
        feePaise: o.feePaise,
        payablePaise: o.payablePaise,
        utr: o.utr,
        bank: o.bankId && o.bankId.bankId
            ? {
                bankId: o.bankId.bankId, bankName: o.bankId.bankName, holderName: o.bankId.holderName,
                accountNumber: forMerchant ? maskAccount(o.bankId.accountNumber) : o.bankId.accountNumber,
                ifsc: o.bankId.ifsc, upiId: o.bankId.upiId
            }
            : undefined,
        callback: callbackView(callback),
        paidAt: o.paidAt,
        refundedPaise: o.refundedPaise ?? 0,
        refundedAt: o.refundedAt ?? null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt
    };
    if (!forMerchant) {
        row.statusReason = o.statusReason;
        row.merchant = o.merchantId && o.merchantId.mid
            ? { id: o.merchantId._id, mid: o.merchantId.mid, businessName: o.merchantId.businessName }
            : undefined;
    }
    return row;
};

module.exports = { callbackView, toRow, maskAccount };
