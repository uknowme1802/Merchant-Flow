// Adds one bank account, and optionally maps it to a merchant. Safe to run twice: an existing
// account is reused and an existing mapping is left alone.
//
//   MONGO_URI=... node scripts/seedBank.js                     add the bank only
//   MONGO_URI=... MERCHANT_MID=mid_xxxx node scripts/seedBank.js   add and map it
//   add BANK_VERIFIED=true to mark the account verified
//
// The details below are test data. Override any of them with BANK_HOLDER, BANK_NAME,
// BANK_ACCOUNT, BANK_IFSC and BANK_UPI.
require("dotenv").config();

const mongoose = require("mongoose");
const BankAccount = require("../models/BankAccount");
const Merchant = require("../models/Merchant");
const MerchantBankMapping = require("../models/MerchantBankMapping");
const { generateBankId } = require("../utils/identifiers");

const details = {
    holderName: process.env.BANK_HOLDER || "Harshdeep",
    bankName: process.env.BANK_NAME || "YES BANK",
    accountNumber: process.env.BANK_ACCOUNT || "742586481045",
    ifsc: (process.env.BANK_IFSC || "YESB0000001").toUpperCase(),
    upiId: (process.env.BANK_UPI || "Harshdeep@ysbank").toLowerCase()
};

async function seed() {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not set. Aborting!");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    try {
        let merchant = null;
        if (process.env.MERCHANT_MID) {
            merchant = await Merchant.findOne({ mid: process.env.MERCHANT_MID });
            if (!merchant) {
                console.error(`No merchant with MID ${process.env.MERCHANT_MID}. Nothing was changed.`);
                process.exitCode = 1;
                return;
            }
        }

        let bank = await BankAccount.findOne({ accountNumber: details.accountNumber, ifsc: details.ifsc });
        if (bank) {
            console.log(`Bank account already exists: ${bank.bankId}`);
        } else {
            bank = await BankAccount.create({ ...details, bankId: generateBankId() });
            console.log(`Bank account created: ${bank.bankId} (${bank.bankName}, ${bank.holderName})`);
        }

        if (process.env.BANK_VERIFIED === "true" && !bank.verified) {
            bank.verified = true;
            bank.verifiedAt = new Date();
            await bank.save();
            console.log("Marked as verified.");
        }

        if (merchant) {
            const existing = await MerchantBankMapping.findOne({ merchantId: merchant._id, bankId: bank._id });
            if (existing) {
                console.log(`Already mapped to ${merchant.mid}.`);
            } else {
                await MerchantBankMapping.create({ merchantId: merchant._id, bankId: bank._id });
                console.log(`Mapped ${bank.bankId} to ${merchant.mid}.`);
            }
        }
    } finally {
        await mongoose.disconnect();
    }
}

seed().catch((err) => {
    console.error("Seed failed:", err.message);
    process.exit(1);
});
