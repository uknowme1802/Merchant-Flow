const crypto = require("crypto");
const BankAccount = require("../models/BankAccount");
const MerchantBankMapping = require("../models/MerchantBankMapping");
const BankCredit = require("../models/BankCredit");
const Order = require("../models/Order");
const ApiError = require("../utils/ApiError");
const { startOfIstDay } = require("../utils/istDay");

// Picks the bank account a new order will ask the customer to pay.
//
// Candidates are the merchant's mapped banks that are active and verified and take UPI.
//   1. If one of them already holds an unclaimed credit of exactly this amount, only those banks
//      stay in the running. This is how a customer whose first order expired can pay again: the
//      money sits in a specific bank, and a claim only matches the bank that received it.
//   2. Of the remaining banks, the one with the fewest orders today (IST) wins; ties are random.
//
// Bank limits are stored but not enforced, and nothing is reserved: any number of pending orders
// may share a bank and an amount.
const selectBank = async (merchant, amountPaise) => {
    const mappings = await MerchantBankMapping.find({ merchantId: merchant._id, active: true }).select("bankId");
    const mappedIds = mappings.map((m) => m.bankId);

    const banks = mappedIds.length
        ? await BankAccount.find({ _id: { $in: mappedIds }, status: "active", verified: true, methods: "UPI" })
        : [];
    if (banks.length === 0) {
        throw new ApiError(503, "No bank account is available to take this payment right now", "NO_BANK_AVAILABLE");
    }

    let candidates = banks;
    const holding = await BankCredit.distinct("bankId", {
        bankId: { $in: banks.map((b) => b._id) },
        amountPaise,
        claimedBy: null
    });
    if (holding.length > 0) {
        const holdingIds = new Set(holding.map(String));
        candidates = banks.filter((b) => holdingIds.has(String(b._id)));
    }

    const counts = await Order.aggregate([
        { $match: { bankId: { $in: candidates.map((b) => b._id) }, createdAt: { $gte: startOfIstDay() } } },
        { $group: { _id: "$bankId", n: { $sum: 1 } } }
    ]);
    const countOf = new Map(counts.map((c) => [String(c._id), c.n]));

    const fewest = Math.min(...candidates.map((b) => countOf.get(String(b._id)) || 0));
    const leastUsed = candidates.filter((b) => (countOf.get(String(b._id)) || 0) === fewest);
    return leastUsed[crypto.randomInt(leastUsed.length)];
};

module.exports = { selectBank };
