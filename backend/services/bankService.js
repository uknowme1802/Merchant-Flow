const BankAccount = require("../models/BankAccount");
const MerchantBankMapping = require("../models/MerchantBankMapping");
const ApiError = require("../utils/ApiError");
const { generateBankId } = require("../utils/identifiers");

const MAX_ID_ATTEMPTS = 5;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toBankView = (b) => ({
    id: b._id,
    bankId: b.bankId,
    holderName: b.holderName,
    bankName: b.bankName,
    accountNumber: b.accountNumber,
    ifsc: b.ifsc,
    upiId: b.upiId,
    minPaise: b.minPaise ?? null,
    maxPaise: b.maxPaise ?? null,
    dailyLimitPaise: b.dailyLimitPaise ?? null,
    methods: b.methods,
    qrEnabled: b.qrEnabled,
    level: b.level,
    status: b.status,
    verified: b.verified,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
});

const toMappingView = (m, bank) => ({
    id: m._id,
    active: m.active,
    minPaise: m.minPaise ?? null,
    maxPaise: m.maxPaise ?? null,
    dailyLimitPaise: m.dailyLimitPaise ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    bank: bank ? toBankView(bank) : null
});

// UPI ids are case-insensitive, so they are stored lower case.
const normalise = (fields) => (fields.upiId ? { ...fields, upiId: fields.upiId.toLowerCase() } : fields);

const createBank = async (input, adminId) => {
    const fields = normalise(input);
    let bank = null;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !bank; attempt++) {
        try {
            bank = await BankAccount.create({ ...fields, bankId: generateBankId(), createdBy: adminId });
        } catch (err) {
            if (err.code !== 11000) throw err;
            // The same account and IFSC already exists: the caller's mistake, not an id clash.
            if (await BankAccount.exists({ accountNumber: fields.accountNumber, ifsc: fields.ifsc })) {
                throw new ApiError(409, "This bank account is already added");
            }
        }
    }
    if (!bank) throw new ApiError(500, "Could not allocate a bank id, please try again");
    return bank;
};

const listBanks = async ({ search, status, page, limit }) => {
    const filter = {};
    if (status) filter.status = status;
    if (search) {
        const rx = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ bankId: rx }, { holderName: rx }, { bankName: rx }, { accountNumber: rx }, { upiId: rx }];
    }
    const [data, total] = await Promise.all([
        BankAccount.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        BankAccount.countDocuments(filter)
    ]);
    return { data, total, page, limit };
};

const getBank = async (id) => {
    const bank = await BankAccount.findById(id);
    if (!bank) throw new ApiError(404, "Bank account not found");
    return bank;
};

const updateBank = async (id, fields) => {
    const bank = await getBank(id);
    const before = toBankView(bank);
    Object.assign(bank, normalise(fields));
    if (bank.minPaise != null && bank.maxPaise != null && bank.minPaise > bank.maxPaise) {
        throw new ApiError(400, "minPaise cannot be above maxPaise");
    }
    try {
        await bank.save();
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "This bank account is already added");
        throw err;
    }
    return { bank, before };
};

const verifyBank = async (id, adminId) => {
    const bank = await getBank(id);
    bank.verified = true;
    bank.verifiedBy = adminId;
    bank.verifiedAt = new Date();
    await bank.save();
    return bank;
};

// A bank that is mapped to a merchant cannot be deleted; deactivate it instead.
const deleteBank = async (id) => {
    const bank = await getBank(id);
    if (await MerchantBankMapping.exists({ bankId: bank._id })) {
        throw new ApiError(409, "This bank is mapped to a merchant. Deactivate it instead.");
    }
    await BankAccount.deleteOne({ _id: bank._id });
    return bank;
};

const listMappings = async (merchantId) => {
    const mappings = await MerchantBankMapping.find({ merchantId }).sort({ createdAt: -1 });
    const out = [];
    for (const m of mappings) out.push(toMappingView(m, await BankAccount.findById(m.bankId)));
    return out;
};

const addMapping = async ({ merchantId, bankId, minPaise, maxPaise, dailyLimitPaise, adminId }) => {
    const bank = await getBank(bankId);

    // A merchant's own limits may only be stricter than the bank's.
    if (minPaise != null && bank.minPaise != null && minPaise < bank.minPaise) {
        throw new ApiError(400, "Mapping minimum cannot be below the bank minimum");
    }
    if (maxPaise != null && bank.maxPaise != null && maxPaise > bank.maxPaise) {
        throw new ApiError(400, "Mapping maximum cannot be above the bank maximum");
    }
    if (dailyLimitPaise != null && bank.dailyLimitPaise != null && dailyLimitPaise > bank.dailyLimitPaise) {
        throw new ApiError(400, "Mapping daily limit cannot be above the bank daily limit");
    }
    if (minPaise != null && maxPaise != null && minPaise > maxPaise) {
        throw new ApiError(400, "minPaise cannot be above maxPaise");
    }

    try {
        const mapping = await MerchantBankMapping.create({
            merchantId, bankId: bank._id, minPaise: minPaise ?? null, maxPaise: maxPaise ?? null,
            dailyLimitPaise: dailyLimitPaise ?? null, createdBy: adminId
        });
        return { mapping, bank };
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "This bank is already mapped to the merchant");
        throw err;
    }
};

// Bulk Payin Meta Mapping: maps every bank to every merchant. A pair that is already mapped is
// skipped, so the call can be repeated safely. Unknown banks are refused before anything is saved.
const MAX_BULK_PAIRS = 500;

const bulkMap = async ({ merchants, bankIds, adminId }) => {
    if (merchants.length * bankIds.length > MAX_BULK_PAIRS) {
        throw new ApiError(400, `Too many mappings in one request (the limit is ${MAX_BULK_PAIRS})`);
    }

    const banks = await BankAccount.find({ _id: { $in: bankIds } });
    if (banks.length !== bankIds.length) throw new ApiError(404, "One or more bank accounts were not found");

    let created = 0;
    let skipped = 0;
    for (const merchant of merchants) {
        for (const bank of banks) {
            try {
                await MerchantBankMapping.create({ merchantId: merchant._id, bankId: bank._id, createdBy: adminId });
                created++;
            } catch (err) {
                if (err.code !== 11000) throw err;
                skipped++;
            }
        }
    }
    return { created, skipped, banks };
};

// The Active switch on the PAYIN page: an inactive mapping stays in the list but is not used.
const setMappingActive = async (merchantId, mappingId, active) => {
    const mapping = await MerchantBankMapping.findOne({ _id: mappingId, merchantId });
    if (!mapping) throw new ApiError(404, "Mapping not found");

    const before = mapping.active;
    mapping.active = active;
    await mapping.save();
    return { mapping, bank: await BankAccount.findById(mapping.bankId), before };
};

const removeMapping = async (merchantId, mappingId) => {
    const mapping = await MerchantBankMapping.findOne({ _id: mappingId, merchantId });
    if (!mapping) throw new ApiError(404, "Mapping not found");
    await MerchantBankMapping.deleteOne({ _id: mapping._id });
    return mapping;
};

module.exports = {
    toBankView, toMappingView, createBank, listBanks, getBank, updateBank, verifyBank,
    deleteBank, listMappings, addMapping, bulkMap, setMappingActive, removeMapping
};
