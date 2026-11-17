const BankCredit = require("../models/BankCredit");
const BankAccount = require("../models/BankAccount");
const ApiError = require("../utils/ApiError");

// The admin's bank statement: money that arrived in a bank account.

const addCredit = async ({ bankId, amountPaise, utr, receivedAt, note }, adminId) => {
    const bank = await BankAccount.findById(bankId);
    if (!bank) throw new ApiError(404, "Bank account not found");

    try {
        return await BankCredit.create({
            bankId: bank._id,
            amountPaise,
            utr,
            receivedAt: receivedAt || new Date(),
            note,
            createdBy: adminId
        });
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "A credit with this UTR already exists");
        throw err;
    }
};

const listCredits = async ({ bankId, claimed, page, limit }) => {
    const filter = {};
    if (bankId) filter.bankId = bankId;
    if (claimed === true) filter.claimedBy = { $ne: null };
    if (claimed === false) filter.claimedBy = null;

    const [data, total] = await Promise.all([
        BankCredit.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit)
            .populate("bankId", "bankId bankName holderName")
            .populate("claimedBy", "orderId merchantId mode"),
        BankCredit.countDocuments(filter)
    ]);
    return { data, total, page, limit };
};

module.exports = { addCredit, listCredits };
