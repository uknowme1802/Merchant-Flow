// Preconfigured in-memory models for the Phase 1 tests. A test file wires them in with:
//
//   jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
//   jest.mock("../models/User", () => require("./helpers/mockModels").User);
//   jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
//   jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);
//
// and then calls resetAll() in beforeEach. The unique rules mirror the real schema indexes.

const { createFakeModel } = require("./fakeModels");

const Merchant = createFakeModel("Merchant", {
    uniques: [(a, b) => a.mid === b.mid],
    defaults: () => ({ status: "pending", statusReason: null, statusChangedAt: null, statusChangedBy: null }),
    finalize: (doc) => { doc.kyc = { status: "submitted", reviewNote: null, ...doc.kyc }; }
});

const User = createFakeModel("User", {
    uniques: [(a, b) => a.email === b.email],
    defaults: () => ({ role: "user", merchantId: null, merchantRole: null })
});

// Same rule as the "one_active_per_env" index: one active secret per merchant and environment.
const MerchantCredential = createFakeModel("MerchantCredential", {
    uniques: [(a, b) =>
        a.status === "active" && b.status === "active" &&
        String(a.merchantId) === String(b.merchantId) && a.environment === b.environment],
    defaults: () => ({ status: "active", expiresAt: null, revokedAt: null, lastUsedAt: null })
});

const AuditLog = createFakeModel("AuditLog");

// Same rules as the real indexes: a bank id and an (account number, IFSC) pair are unique.
const BankAccount = createFakeModel("BankAccount", {
    uniques: [(a, b) => a.bankId === b.bankId || (a.accountNumber === b.accountNumber && a.ifsc === b.ifsc)],
    defaults: () => ({
        methods: ["UPI"], qrEnabled: true, level: "Level1", status: "active", verified: false,
        minPaise: null, maxPaise: null, dailyLimitPaise: null
    })
});

// One mapping per merchant and bank.
const MerchantBankMapping = createFakeModel("MerchantBankMapping", {
    uniques: [(a, b) => String(a.merchantId) === String(b.merchantId) && String(a.bankId) === String(b.bankId)],
    defaults: () => ({ active: true, minPaise: null, maxPaise: null, dailyLimitPaise: null })
});

const resetAll = () => [Merchant, User, MerchantCredential, AuditLog, BankAccount, MerchantBankMapping]
    .forEach((m) => m.__reset());

module.exports = { Merchant, User, MerchantCredential, AuditLog, BankAccount, MerchantBankMapping, resetAll };
