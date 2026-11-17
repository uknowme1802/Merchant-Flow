const bcrypt = require("bcryptjs");
const Merchant = require("../models/Merchant");
const User = require("../models/User");
const MerchantCredential = require("../models/MerchantCredential");
const MerchantBankMapping = require("../models/MerchantBankMapping");
const ApiError = require("../utils/ApiError");
const { generateMid, generateTempPassword } = require("../utils/identifiers");
const credentialService = require("./credentialService");
const sessionRevocation = require("../utils/sessionRevocation");
const userService = require("./userService");
const { assertPublicUrl } = require("../utils/ssrf");
const callbackService = require("./callbackService");
const { MERCHANT_ACTIONS, MODE_ENVIRONMENT, DEFAULT_MERCHANT_CONFIG } = require("../constants/merchant");

const MAX_MID_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

// Merchant sign-up creates two records: the Merchant (status "pending") and its first login, the
// team owner. If the second step fails the first is removed, so no orphan merchant is left behind.
//
// An admin can also create a merchant directly (createMerchantByAdmin below). That path passes
// `admin`, which starts the merchant already approved, and `username`, `mode` and
// `mustChangePassword` for the new login.
const signupMerchant = async ({ businessName, businessType, website, country, contactName, contactPhone, email, password, kyc, username, mode, remark, mustChangePassword, admin }) => {
    const normalisedEmail = email.toLowerCase();
    const normalisedUsername = username ? username.toLowerCase() : undefined;

    if (await User.exists({ email: normalisedEmail })) {
        throw new ApiError(409, "Email already in use");
    }
    if (normalisedUsername && await User.exists({ username: normalisedUsername })) {
        throw new ApiError(409, "Username already in use");
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
                    address: kyc.address,
                    ...(admin ? { status: "approved", reviewNote: "Created by an administrator" } : {})
                },
                ...(mode ? { mode } : {}),
                ...(remark ? { remark } : {}),
                ...(admin ? { status: "active", statusChangedAt: new Date(), statusChangedBy: admin } : {})
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
            ...(normalisedUsername ? { username: normalisedUsername } : {}),
            ...(mustChangePassword ? { mustChangePassword: true } : {}),
            role: "merchant",
            merchantId: merchant._id,
            merchantRole: "owner"
        });
        return { merchant, user };
    } catch (err) {
        await Merchant.deleteOne({ _id: merchant._id });
        if (err.code === 11000) {
            const clash = normalisedUsername && await User.exists({ username: normalisedUsername });
            throw new ApiError(409, clash ? "Username already in use" : "Email already in use");
        }
        throw err;
    }
};

// Signs every login of a merchant out at once: no refresh, and their access tokens stop now.
// Logging in again is refused separately while the merchant is suspended or deleted.
const signOutTeam = async (merchantId) => {
    const members = await User.find({ merchantId, role: "merchant" });
    for (const member of members) {
        member.refreshToken = null;
        await member.save();
        sessionRevocation.revoke(member._id);
    }
    return members.length;
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
    if (action === "suspend") await signOutTeam(merchant._id);
    return { merchant, previousStatus };
};

const listMerchants = async ({ status, search, page = 1, limit = 20 }) => {
    // Deleted merchants are hidden unless the list is filtered to them.
    const query = { status: status || { $ne: "deleted" } };
    if (search) {
        // Escape the text so it is matched literally, never interpreted as a regular expression.
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ businessName: pattern }, { contactEmail: pattern }, { mid: pattern }, { remark: pattern }];

        // The username lives on the owner's login, so find those logins first.
        const byUsername = await User.find({ role: "merchant", merchantRole: "owner", username: pattern });
        if (byUsername.length) query.$or.push({ _id: { $in: byUsername.map((u) => u.merchantId) } });
    }

    const [data, total] = await Promise.all([
        Merchant.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        Merchant.countDocuments(query)
    ]);

    // One query for all the owners on this page (username and two-factor state for the list).
    const owners = data.length
        ? await User.find({ merchantRole: "owner", merchantId: { $in: data.map((m) => m._id) } })
        : [];
    const ownerByMerchant = new Map(owners.map((o) => [String(o.merchantId), o]));
    data.forEach((m) => { m.owner = ownerByMerchant.get(String(m._id)) || null; });

    return { data, total, page, limit };
};

const getMerchant = async (merchantId) => {
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) throw new ApiError(404, "Merchant not found");
    return merchant;
};

// Like getMerchant, plus the owner login, so the view includes the username and two-factor state.
const getMerchantWithOwner = async (merchantId) => {
    const merchant = await getMerchant(merchantId);
    merchant.owner = await User.findOne({ merchantId: merchant._id, role: "merchant", merchantRole: "owner" }) || null;
    return merchant;
};

const getMerchantsByIds = async (merchantIds) => {
    const merchants = await Merchant.find({ _id: { $in: merchantIds } });
    if (merchants.length !== merchantIds.length) throw new ApiError(404, "One or more merchants were not found");
    return merchants;
};

// ---- Team management (owner only; enforced by the route) ----

const listTeam = (merchantId) =>
    User.find({ merchantId, role: "merchant" }).select("email merchantRole createdAt").sort({ createdAt: 1 });

// The admin's view of a merchant's logins (the "Team and reset password" action).
const listTeamForAdmin = async (merchantId) => {
    const merchant = await getMerchant(merchantId);
    const members = await User.find({ merchantId: merchant._id, role: "merchant" }).sort({ createdAt: 1 });
    return members.map((m) => ({
        id: String(m._id),
        email: m.email,
        username: m.username ?? null,
        merchantRole: m.merchantRole,
        mfaEnabled: Boolean(m.twoFactor?.enabled),
        mustChangePassword: Boolean(m.mustChangePassword),
        createdAt: m.createdAt
    }));
};

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

const toConfigView = (config = {}) => ({
    webhookAutoTrigger: config.webhookAutoTrigger ?? DEFAULT_MERCHANT_CONFIG.webhookAutoTrigger,
    callbackUrl: config.callbackUrl ?? null,
    payinBps: config.payinBps ?? DEFAULT_MERCHANT_CONFIG.payinBps,
    payoutBps: config.payoutBps ?? DEFAULT_MERCHANT_CONFIG.payoutBps,
    settlementBps: config.settlementBps ?? DEFAULT_MERCHANT_CONFIG.settlementBps,
    settlementDays: config.settlementDays ?? DEFAULT_MERCHANT_CONFIG.settlementDays,
    minAmountPaise: config.minAmountPaise ?? null,
    maxAmountPaise: config.maxAmountPaise ?? null
});

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
    mode: merchant.mode || "sandbox",
    remark: merchant.remark || "",
    config: toConfigView(merchant.config),
    ...(merchant.owner !== undefined ? {
        username: merchant.owner?.username ?? null,
        mfaEnabled: Boolean(merchant.owner?.twoFactor?.enabled),
        mfaRequired: Boolean(merchant.owner?.mfaRequired)
    } : {}),
    status: merchant.status,
    statusReason: merchant.statusReason ?? null,
    statusChangedAt: merchant.statusChangedAt ?? null,
    createdAt: merchant.createdAt
});

// ---- Admin management (Phase 1.1) ----

// Creates an approved merchant and its owner login with a random temporary password. The password
// is returned once, to be shown in a pop-up; the owner must change it at first login.
const createMerchantByAdmin = async ({ adminId, ...fields }) => {
    const temporaryPassword = generateTempPassword();
    const { merchant, user } = await signupMerchant({
        ...fields,
        password: temporaryPassword,
        mustChangePassword: true,
        admin: adminId
    });
    return { merchant, user, temporaryPassword };
};

// Edit Config. Returns the merchant plus the old and new values for the audit entry.
const updateConfig = async (merchantId, patch) => {
    const merchant = await getMerchant(merchantId);
    const before = { ...toConfigView(merchant.config), remark: merchant.remark || "" };

    const { remark, ...configPatch } = patch;
    const next = { ...toConfigView(merchant.config), ...configPatch };
    if (next.minAmountPaise != null && next.maxAmountPaise != null && next.minAmountPaise > next.maxAmountPaise) {
        throw new ApiError(400, "minAmountPaise cannot be above maxAmountPaise");
    }
    if (next.callbackUrl) {
        if (process.env.NODE_ENV === "production" && !next.callbackUrl.startsWith("https://")) {
            throw new ApiError(400, "callbackUrl must start with https://");
        }
        // The same guard the sender uses: no localhost, private networks or cloud metadata.
        await assertPublicUrl(next.callbackUrl).catch((err) => { throw new ApiError(400, err.message.replace("Webhook URL", "callbackUrl")); });
    }

    merchant.config = next;
    if (remark !== undefined) merchant.remark = remark;
    await merchant.save();

    return { merchant, before, after: { ...next, remark: merchant.remark || "" } };
};

// Sets a new random temporary password for a login of this merchant (the owner unless a userId is
// given), forces a change at next login and signs that login out everywhere.
const resetMerchantPassword = async ({ merchantId, userId }) => {
    const merchant = await getMerchant(merchantId);
    const user = userId
        ? await User.findOne({ _id: userId, merchantId: merchant._id, role: "merchant" })
        : await User.findOne({ merchantId: merchant._id, role: "merchant", merchantRole: "owner" });
    if (!user) throw new ApiError(404, "User not found for this merchant");

    const temporaryPassword = generateTempPassword();
    user.password = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = true;
    user.refreshToken = null;
    await user.save();
    sessionRevocation.revoke(user._id);

    return { merchant, user, temporaryPassword };
};

// Moves a merchant between sandbox and production. Old-mode data is not deleted: every screen
// and balance only reads the current mode. The old key is revoked and a key for the new mode is
// issued and returned once.
const switchMode = async ({ merchantId, mode, confirmMid, reason, adminId }) => {
    const merchant = await getMerchant(merchantId);
    const from = merchant.mode || "sandbox";

    if (confirmMid !== merchant.mid) throw new ApiError(400, "confirmMid does not match this merchant");
    if (from === mode) throw new ApiError(409, `Merchant is already in ${mode} mode`);
    if (merchant.status !== "active") throw new ApiError(409, "Only an approved (active) merchant can change mode");
    if (mode === "sandbox" && !reason) throw new ApiError(400, "A reason is required to move back to sandbox");

    // Revoke whatever is still usable in the mode being left.
    const oldEnvironment = MODE_ENVIRONMENT[from];
    const old = await credentialService.listRawCredentials(merchant._id);
    for (const cred of old.filter((c) => c.environment === oldEnvironment && c.status !== "revoked")) {
        await credentialService.revokeCredential({ merchantId: merchant._id, credentialId: cred._id });
    }

    merchant.mode = mode;
    await merchant.save();

    // A test order must never call the production URL, so what is still waiting is stopped.
    await callbackService.cancelPendingCallbacks(merchant._id, from);

    const key = await credentialService.generateKey({ merchant, createdBy: adminId });
    return { merchant, from, key };
};

// Delete (soft): the merchant disappears from the list, its logins are signed out and refused,
// and its keys are revoked. Nothing is erased; Force Delete does that.
const deleteMerchant = async ({ merchantId, adminId, reason }) => {
    const merchant = await getMerchant(merchantId);
    if (merchant.status === "deleted") throw new ApiError(409, "This merchant is already deleted");

    const previousStatus = merchant.status;
    merchant.status = "deleted";
    merchant.statusReason = reason || null;
    merchant.statusChangedAt = new Date();
    merchant.statusChangedBy = adminId;
    await merchant.save();

    const credentials = await credentialService.listRawCredentials(merchant._id);
    for (const cred of credentials.filter((c) => c.status !== "revoked")) {
        await credentialService.revokeCredential({ merchantId: merchant._id, credentialId: cred._id });
    }
    await signOutTeam(merchant._id);

    return { merchant, previousStatus };
};

// Force Delete: permanently removes the merchant with its logins, keys and bank mappings. The
// typed MID must match. Audit entries are kept. This cannot be undone.
const forceDeleteMerchant = async ({ merchantId, confirmMid }) => {
    const merchant = await getMerchant(merchantId);
    if (confirmMid !== merchant.mid) throw new ApiError(400, "confirmMid does not match this merchant");

    const members = await User.find({ merchantId: merchant._id, role: "merchant" });
    members.forEach((member) => sessionRevocation.revoke(member._id));

    // Dependants first, the merchant last: if this stops half-way it can simply be run again.
    const mappings = await MerchantBankMapping.deleteMany({ merchantId: merchant._id });
    const credentials = await MerchantCredential.deleteMany({ merchantId: merchant._id });
    const logins = await User.deleteMany({ merchantId: merchant._id, role: "merchant" });
    await Merchant.deleteOne({ _id: merchant._id });

    return {
        merchant,
        removed: { logins: logins.deletedCount, credentials: credentials.deletedCount, mappings: mappings.deletedCount }
    };
};

// Turns two-factor off for the merchant's owner login (the 2FA switch in the Merchant List).
const disableOwnerMfa = async (merchantId) => {
    const merchant = await getMerchantWithOwner(merchantId);
    if (!merchant.owner) throw new ApiError(404, "This merchant has no owner login");
    const user = await userService.clearTwoFactor(merchant.owner);
    return { merchant, user };
};

// The 2FA switch, on: the merchant's owner must set up two-factor at their next login.
const requireOwnerMfa = async (merchantId) => {
    const merchant = await getMerchantWithOwner(merchantId);
    if (!merchant.owner) throw new ApiError(404, "This merchant has no owner login");
    const user = await userService.requireTwoFactor(merchant.owner);
    return { merchant, user };
};

module.exports = {
    requireOwnerMfa,
    deleteMerchant,
    forceDeleteMerchant,
    disableOwnerMfa,
    createMerchantByAdmin,
    updateConfig,
    resetMerchantPassword,
    switchMode,
    toMerchantView,
    signupMerchant,
    changeMerchantStatus,
    listMerchants,
    getMerchant,
    getMerchantWithOwner,
    getMerchantsByIds,
    listTeam,
    listTeamForAdmin,
    addTeamMember,
    removeTeamMember
};
