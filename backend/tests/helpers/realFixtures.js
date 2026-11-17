// Builders for tests that run against the real in-memory MongoDB (see realDb.js).

const Merchant = require("../../models/Merchant");
const BankAccount = require("../../models/BankAccount");
const MerchantBankMapping = require("../../models/MerchantBankMapping");
const BankCredit = require("../../models/BankCredit");
const Order = require("../../models/Order");
const { generateMid, generateBankId } = require("../../utils/identifiers");

let seq = 0;
const nextUtr = () => String(100000000000 + ++seq);

const makeMerchant = (overrides = {}) =>
    Merchant.create({
        mid: generateMid(),
        businessName: "Acme Traders",
        businessType: "company",
        contactName: "Asha Rao",
        contactEmail: "asha@acme.example",
        contactPhone: "+91 98765 43210",
        kyc: { registrationNumber: "U1", address: "12 Market Road" },
        status: "active",
        mode: "sandbox",
        ...overrides
    });

const makeBank = (overrides = {}) => {
    seq += 1;
    return BankAccount.create({
        bankId: generateBankId(),
        holderName: "Acme Traders",
        bankName: "Test Bank",
        accountNumber: String(100000000000 + seq),
        ifsc: "TEST0000001",
        upiId: `acme${seq}@testbank`,
        verified: true,
        ...overrides
    });
};

const mapBank = (merchant, bank, overrides = {}) =>
    MerchantBankMapping.create({ merchantId: merchant._id, bankId: bank._id, ...overrides });

const makeCredit = (bank, amountPaise, utr = nextUtr()) =>
    BankCredit.create({ bankId: bank._id, amountPaise, utr });

// Inserts an order directly on a chosen bank (for tests where selection is not the point).
let orderSeq = 0;
const makeOrderOn = (merchant, bank, fields = {}) =>
    Order.create({
        // Same shape as a real id: "ord_" plus 16 characters.
        orderId: `ord_test${String(++orderSeq).padStart(12, "0")}`,
        merchantId: merchant._id,
        mode: merchant.mode,
        amountPaise: 50000,
        bankId: bank._id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        ...fields
    });

// A merchant with one mapped, verified bank: the common starting point.
const setupMerchantWithBank = async (merchantOverrides = {}) => {
    const merchant = await makeMerchant(merchantOverrides);
    const bank = await makeBank();
    await mapBank(merchant, bank);
    return { merchant, bank };
};

module.exports = { nextUtr, makeMerchant, makeBank, mapBank, makeCredit, makeOrderOn, setupMerchantWithBank };
