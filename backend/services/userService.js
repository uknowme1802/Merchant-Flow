const bcrypt = require("bcryptjs");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { generateTempPassword } = require("../utils/identifiers");
const { normaliseRole } = require("../constants/roles");
const sessionRevocation = require("../utils/sessionRevocation");

const BCRYPT_ROUNDS = 10;
const MERCHANT_LOGIN_MESSAGE = "Merchant logins are managed from the Merchant List";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The fields of a user that the API returns. Never the password, tokens or two-factor secrets.
const toUserView = (user) => ({
    id: String(user._id),
    username: user.username ?? null,
    email: user.email,
    role: normaliseRole(user.role),
    disabled: Boolean(user.disabled),
    mfaEnabled: Boolean(user.twoFactor?.enabled),
    mfaRequired: Boolean(user.mfaRequired),
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt
});

const listUsers = async ({ search, page = 1, limit = 10 }) => {
    const filter = {};
    if (search) {
        // Matched literally, never as a regular expression.
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ username: pattern }, { email: pattern }];
    }

    const [data, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        User.countDocuments(filter)
    ]);
    return { data, total, page, limit };
};

const duplicateMessage = async ({ username, email }, excludeId) => {
    const other = excludeId ? { _id: { $ne: excludeId } } : {};
    if (username && await User.exists({ username, ...other })) return "Username already in use";
    if (email && await User.exists({ email, ...other })) return "Email already in use";
    return null;
};

// Creates an admin or agent login with a random temporary password. The password is returned
// once, to be shown in a pop-up; the user must change it at first login.
const createUser = async ({ username, email, role = "agent" }) => {
    const clash = await duplicateMessage({ username, email });
    if (clash) throw new ApiError(409, clash);

    const temporaryPassword = generateTempPassword();
    try {
        const user = await User.create({
            username,
            email,
            role,
            password: await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS),
            mustChangePassword: true
        });
        return { user, temporaryPassword };
    } catch (err) {
        // Two simultaneous requests: the unique indexes let only one win.
        if (err.code === 11000) {
            throw new ApiError(409, await duplicateMessage({ username, email }) || "Email already in use");
        }
        throw err;
    }
};

const getStaffUser = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    if (user.role === "merchant") throw new ApiError(409, MERCHANT_LOGIN_MESSAGE);
    return user;
};

const isActiveAdmin = (user) => normaliseRole(user.role) === "admin" && !user.disabled;

// Edit a user: username, email, role and the Disabled switch. Returns the old and new values of
// the fields that changed, for the audit entry.
const updateUser = async ({ userId, actorId, patch }) => {
    const user = await getStaffUser(userId);
    const isSelf = String(user._id) === String(actorId);

    const next = {
        username: patch.username ?? user.username,
        email: patch.email ?? user.email,
        role: patch.role ?? normaliseRole(user.role),
        disabled: patch.disabled ?? Boolean(user.disabled)
    };
    const current = {
        username: user.username ?? null,
        email: user.email,
        role: normaliseRole(user.role),
        disabled: Boolean(user.disabled)
    };
    const changed = Object.keys(next).filter((key) => (next[key] ?? null) !== current[key]);
    if (!changed.length) return { user, before: {}, after: {} };

    if (isSelf && next.disabled) throw new ApiError(400, "You cannot disable your own account");
    if (isSelf && next.role !== current.role) throw new ApiError(400, "You cannot change your own role");

    // The console must always keep one admin who can log in.
    const stopsBeingActiveAdmin = isActiveAdmin(user) && (next.role !== "admin" || next.disabled);
    if (stopsBeingActiveAdmin) {
        const others = await User.countDocuments({ role: "admin", disabled: { $ne: true }, _id: { $ne: user._id } });
        if (others === 0) throw new ApiError(409, "The last active admin cannot be disabled or demoted");
    }

    const clash = await duplicateMessage({
        username: changed.includes("username") ? next.username : null,
        email: changed.includes("email") ? next.email : null
    }, user._id);
    if (clash) throw new ApiError(409, clash);

    changed.forEach((key) => { user[key] = next[key]; });
    // A disabled user, or one whose role changed, is signed out everywhere: no refresh, and
    // (below) their access token stops now. They log in again and get the new role.
    if ((changed.includes("disabled") && next.disabled) || changed.includes("role")) user.refreshToken = null;

    try {
        await user.save();
    } catch (err) {
        if (err.code === 11000) throw new ApiError(409, "Username or email already in use");
        throw err;
    }

    if (changed.includes("disabled")) {
        if (next.disabled) sessionRevocation.block(user._id);
        else sessionRevocation.unblock(user._id);
    }
    if (changed.includes("role") || changed.includes("disabled")) sessionRevocation.revoke(user._id);

    const pick = (source) => Object.fromEntries(changed.map((key) => [key, source[key]]));
    return { user, before: pick(current), after: pick(next) };
};

// Sets a new random temporary password, forces a change at next login and signs the user out
// everywhere.
const resetPassword = async ({ userId, actorId }) => {
    const user = await getStaffUser(userId);
    if (String(user._id) === String(actorId)) {
        throw new ApiError(400, "Use Change password for your own account");
    }

    const temporaryPassword = generateTempPassword();
    user.password = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = true;
    user.refreshToken = null;
    await user.save();
    sessionRevocation.revoke(user._id);

    return { user, temporaryPassword };
};

// The MFA switch, off: removes two-factor from a login and the requirement to have it. Turning
// the switch off and on again is how an admin resets a user's authenticator code.
const clearTwoFactor = async (user) => {
    if (!user.twoFactor?.enabled && !user.mfaRequired) {
        throw new ApiError(409, "Two-factor authentication is not enabled or required for this user");
    }
    user.twoFactor = { enabled: false, secret: null, tempSecret: null };
    user.markModified?.("twoFactor");
    user.mfaRequired = false;
    await user.save();
    return user;
};

// The MFA switch, on: the user must have two-factor. An admin cannot set it up for them (it needs
// their own authenticator app), so a user without it is signed out and has to set it up right
// after their next login.
const requireTwoFactor = async (user) => {
    if (user.mfaRequired) throw new ApiError(409, "Two-factor authentication is already required for this user");
    user.mfaRequired = true;
    if (!user.twoFactor?.enabled) {
        user.refreshToken = null;
        await user.save();
        sessionRevocation.revoke(user._id);
    } else {
        await user.save();
    }
    return user;
};

const requireMfa = async ({ userId, actorId }) => {
    const user = await getStaffUser(userId);
    if (String(user._id) === String(actorId)) {
        throw new ApiError(400, "Use the Security page to set up your own two-factor authentication");
    }
    return requireTwoFactor(user);
};

const disableMfa = async ({ userId, actorId }) => {
    const user = await getStaffUser(userId);
    if (String(user._id) === String(actorId)) {
        throw new ApiError(400, "Use the Security page to turn off your own two-factor authentication");
    }
    return clearTwoFactor(user);
};

module.exports = {
    toUserView, listUsers, createUser, updateUser, resetPassword,
    disableMfa, requireMfa, clearTwoFactor, requireTwoFactor
};
