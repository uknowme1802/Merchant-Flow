const bcrypt = require("bcryptjs");
const Merchant = require("../models/Merchant");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { generateMid } = require("../utils/identifiers");
const { MERCHANT_ACTIONS } = require("../constants/merchant");

const MAX_MID_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

// Merchant sign-up creates two records: the Merchant (status "pending") and its first login, the
// team owner. If the second step fails the first is removed, so no orphan merchant is left behind.
const signupMerchant = async ({ businessName, businessType, website, country, contactName, contactPhone, email, password, kyc }) => {
    const normalisedEmail = email.toLowerCase();

    if (await User.exists({ email: normalisedEmail })) {
        throw new ApiError(409, "Email already in use");
    }

    let merchant = null;
    for (let attempt = 0; attempt < MAX_MID_ATTEMPTS && !merchant; attempt++) {
        try {
            merchant = await Merchant.create({
                mid: generateMid(),
                businessName,
                businessType,
                website: website || null,
                country: country || null,
                contactName,
                contactEmail: normalisedEmail,
                contactPhone,
                kyc: {
                    registrationNumber: kyc.registrationNumber,
                    taxId: kyc.taxId || null,
                    address: kyc.address
                }
            });
        } catch (err) {
            // A MID collision is astronomically unlikely, but cheap to handle: try a new one.
            if (err.code !== 11000) throw err;
        }
    }
    if (!merchant) throw new ApiError(500, "Could not allocate a merchant ID, please try again");

    try {
        const user = await User.create({
            email: normalisedEmail,
            password: await bcrypt.hash(password, BCRYPT_ROUNDS),
            role: "merchant",
            merchantId: merchant._id,
            merchantRole: "owner"
        });
        return { merchant, user };
    } catch (err) {
        await Merchant.deleteOne({ _id: merchant._id });
        if (err.code === 11000) throw new ApiError(409, "Email already in use");
        throw err;
    }
};

// Applies one admin decision. The merchant must currently be in the status that action starts from.
const changeMerchantStatus = async ({ merchantId, action, adminId, reason }) => {
    const rule = Object.hasOwn(MERCHANT_ACTIONS, action) ? MERCHANT_ACTIONS[action] : null;
    if (!rule) throw new ApiError(400, "Unknown action");

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) throw new ApiError(404, "Merchant not found");

    if (merchant.status !== rule.from) {
        throw new ApiError(409, `Cannot ${action} a merchant whose status is '${merchant.status}'`);
    }

    const previousStatus = merchant.status;
    merchant.status = rule.to;
    merchant.statusReason = reason || null;
    merchant.statusChangedAt = new Date();
    merchant.statusChangedBy = adminId;

    if (action === "approve") {
        merchant.kyc.status = "approved";
        merchant.kyc.reviewNote = reason || null;
    } else if (action === "reject") {
        merchant.kyc.status = "rejected";
        merchant.kyc.reviewNote = reason || null;
    }

    await merchant.save();
    return { merchant, previousStatus };
};

const listMerchants = async ({ status, search, page = 1, limit = 20 }) => {
    const query = {};
    if (status) query.status = status;
    if (search) {
        // Escape the text so it is matched literally, never interpreted as a regular expression.
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ businessName: pattern }, { contactEmail: pattern }, { mid: pattern }];
    }

    const [data, total] = await Promise.all([
        Merchant.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        Merchant.countDocuments(query)
    ]);

    return { data, total, page, limit };
};

const getMerchant = async (merchantId) => {
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) throw new ApiError(404, "Merchant not found");
    return merchant;
};

// ---- Team management (owner only; enforced by the route) ----

const listTeam = (merchantId) =>
    User.find({ merchantId, role: "merchant" }).select("email merchantRole createdAt").sort({ createdAt: 1 });

const addTeamMember = async ({ merchantId, email, password, merchantRole }) => {
    const normalisedEmail = email.toLowerCase();
    if (await User.exists({ email: normalisedEmail })) {
        throw new ApiError(409, "Email already in use");
    }

    try {
        return await User.create({
            email: normalisedEmail,
            password: await bcrypt.hash(password, BCRYPT_ROUNDS),
            role: "merchant",
            merchantId,
            merchantRole
        });
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "Email already in use");
        throw err;
    }
};

const removeTeamMember = async ({ merchantId, userId }) => {
    const member = await User.findOne({ _id: userId, merchantId, role: "merchant" });
    if (!member) throw new ApiError(404, "Team member not found");
    if (member.merchantRole === "owner") {
        throw new ApiError(400, "The owner cannot be removed");
    }
    await User.deleteOne({ _id: member._id });
    return member;
};

// The fields of a merchant that the API returns. Controllers use this instead of sending the
// raw database document, so internal fields never leak by accident.
const toMerchantView = (merchant) => ({
    id: String(merchant._id),
    mid: merchant.mid,
    businessName: merchant.businessName,
    businessType: merchant.businessType,
    website: merchant.website,
    country: merchant.country,
    contactName: merchant.contactName,
    contactEmail: merchant.contactEmail,
    contactPhone: merchant.contactPhone,
    kyc: {
        registrationNumber: merchant.kyc?.registrationNumber,
        taxId: merchant.kyc?.taxId ?? null,
        address: merchant.kyc?.address,
        status: merchant.kyc?.status,
        reviewNote: merchant.kyc?.reviewNote ?? null
    },
    status: merchant.status,
    statusReason: merchant.statusReason ?? null,
    statusChangedAt: merchant.statusChangedAt ?? null,
    createdAt: merchant.createdAt
});

module.exports = {
    toMerchantView,
    signupMerchant,
    changeMerchantStatus,
    listMerchants,
    getMerchant,
    listTeam,
    addTeamMember,
    removeTeamMember
};
