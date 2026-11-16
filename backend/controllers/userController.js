const userService = require("../services/userService");
const { recordAudit } = require("../utils/audit");

const PASSWORD_NOTICE = "Copy this temporary password now. It is shown only once; the user must change it at next login.";

// Responses that contain a password must never be cached.
const noStore = (res) => res.set("Cache-Control", "no-store");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

// GET /api/users?search=&page=1&limit=10
exports.getUsers = wrap(async (req, res) => {
    const { data, total, page, limit } = await userService.listUsers(req.validatedQuery);
    res.json({ success: true, total, page, limit, data: data.map(userService.toUserView) });
});

// POST /api/users   (an admin creates an admin or agent login)
exports.createUser = wrap(async (req, res) => {
    const { user, temporaryPassword } = await userService.createUser(req.body);

    // The password itself is never audited.
    await recordAudit(req, {
        action: "user.created",
        targetType: "user",
        targetId: user._id,
        metadata: { username: user.username, email: user.email, role: user.role }
    });

    noStore(res);
    res.status(201).json({
        success: true,
        user: userService.toUserView(user),
        temporaryPassword,
        message: PASSWORD_NOTICE
    });
});

// PATCH /api/users/:id
exports.updateUser = wrap(async (req, res) => {
    const { user, before, after } = await userService.updateUser({
        userId: req.params.id,
        actorId: req.user.id,
        patch: req.body
    });

    if (Object.keys(after).length) {
        await recordAudit(req, {
            action: "user.updated",
            targetType: "user",
            targetId: user._id,
            metadata: { email: user.email, before, after }
        });
    }

    res.json({ success: true, user: userService.toUserView(user) });
});

// POST /api/users/:id/disable-mfa
exports.disableMfa = wrap(async (req, res) => {
    const user = await userService.disableMfa({ userId: req.params.id, actorId: req.user.id });

    await recordAudit(req, {
        action: "user.mfa_disabled",
        targetType: "user",
        targetId: user._id,
        metadata: { email: user.email, username: user.username ?? null }
    });

    res.json({ success: true, user: userService.toUserView(user) });
});

// POST /api/users/:id/require-mfa   (the MFA switch, on)
exports.requireMfa = wrap(async (req, res) => {
    const user = await userService.requireMfa({ userId: req.params.id, actorId: req.user.id });

    await recordAudit(req, {
        action: "user.mfa_required",
        targetType: "user",
        targetId: user._id,
        metadata: { email: user.email, username: user.username ?? null }
    });

    res.json({ success: true, user: userService.toUserView(user) });
});

// POST /api/users/:id/reset-password
exports.resetPassword = wrap(async (req, res) => {
    const { user, temporaryPassword } = await userService.resetPassword({
        userId: req.params.id,
        actorId: req.user.id
    });

    await recordAudit(req, {
        action: "user.password_reset",
        targetType: "user",
        targetId: user._id,
        metadata: { email: user.email, username: user.username ?? null }
    });

    noStore(res);
    res.json({
        success: true,
        email: user.email,
        username: user.username ?? null,
        temporaryPassword,
        message: PASSWORD_NOTICE
    });
});
