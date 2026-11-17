const BankCredit = require("../models/BankCredit");
const Order = require("../models/Order");

// Outcomes of a claim. The checkout page shows the same "payment not found" message for
// NOT_FOUND, so it never reveals whether a UTR exists but belongs to someone else.
const CLAIM = {
    SUCCESS: "success",
    NOT_FOUND: "not_found",        // no unclaimed credit with this UTR, bank and amount
    NOT_PENDING: "not_pending"     // the order expired, failed or was already paid
};

// A customer says "I paid, this is my UTR". Two atomic updates make that safe under any number of
// simultaneous requests:
//
//   1. Claim the credit: the update only matches a credit that is still unclaimed, on the order's
//      own bank, for the order's own amount. Two customers entering the same UTR cannot both win.
//   2. Move the order pending -> success: the update only matches a pending order that has not
//      expired. If it loses (expired, failed or paid in the meantime) the credit claim is undone.
//
// If the server dies between the two steps the credit stays claimed by an order that is not
// successful. That is visible (claimedBy points at a non-success order) and an admin can free it.
const claimPayment = async (order, utr) => {
    const now = new Date();

    const credit = await BankCredit.findOneAndUpdate(
        { utr, bankId: order.bankId, amountPaise: order.amountPaise, claimedBy: null },
        { $set: { claimedBy: order._id, claimedAt: now, claimedMode: order.mode } },
        { returnDocument: "after" }
    );
    if (!credit) return { result: CLAIM.NOT_FOUND };

    const paid = await Order.findOneAndUpdate(
        { _id: order._id, status: "pending", expiresAt: { $gt: now } },
        { $set: { status: "success", utr, claimedCreditId: credit._id, paidAt: now } },
        { returnDocument: "after" }
    );
    if (!paid) {
        await BankCredit.updateOne(
            { _id: credit._id, claimedBy: order._id },
            { $set: { claimedBy: null, claimedAt: null, claimedMode: null } }
        );
        return { result: CLAIM.NOT_PENDING };
    }

    return { result: CLAIM.SUCCESS, order: paid, credit };
};

module.exports = { claimPayment, CLAIM };
