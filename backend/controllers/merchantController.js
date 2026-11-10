const merchantService = require("../services/merchantService");
const { recordAudit } = require("../utils/audit");

// POST /api/merchant/signup  (public)
exports.signup = async (req, res, next) => {
    try {
        const { merchant, user } = await merchantService.signupMerchant(req.body);

        await recordAudit(req, {
            actor: { actorType: "anonymous", actorId: String(user._id), actorEmail: user.email },
            action: "merchant.signup",
            merchantId: merchant._id,
            targetType: "merchant",
            targetId: merchant._id,
            metadata: { mid: merchant.mid, businessName: merchant.businessName }
        });

        res.status(201).json({
            success: true,
            message: "Application received. You can log in now; live access starts after an admin approves your account.",
            merchant: { mid: merchant.mid, businessName: merchant.businessName, status: merchant.status }
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/merchant/me
exports.me = (req, res) => {
    res.json({
        success: true,
        merchant: merchantService.toMerchantView(req.merchant),
        teamRole: req.merchantRole,
        // What the dashboard may offer today.
        capabilities: {
            sandbox: ["pending", "active"].includes(req.merchant.status),
            live: req.merchant.status === "active"
        }
    });
};

// GET /api/merchant/team
exports.listTeam = async (req, res, next) => {
    try {
        const members = await merchantService.listTeam(req.merchant._id);
        res.json({
            success: true,
            data: members.map((m) => ({
                id: String(m._id),
                email: m.email,
                merchantRole: m.merchantRole,
                createdAt: m.createdAt
            }))
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/merchant/team  (owner only)
exports.addTeamMember = async (req, res, next) => {
    try {
        const member = await merchantService.addTeamMember({
            merchantId: req.merchant._id,
            email: req.body.email,
            password: req.body.password,
            merchantRole: req.body.merchantRole
        });

        await recordAudit(req, {
            action: "team.member_added",
            merchantId: req.merchant._id,
            targetType: "user",
            targetId: member._id,
            metadata: { email: member.email, merchantRole: member.merchantRole }
        });

        res.status(201).json({
            success: true,
            data: { id: String(member._id), email: member.email, merchantRole: member.merchantRole }
        });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/merchant/team/:id  (owner only)
exports.removeTeamMember = async (req, res, next) => {
    try {
        const removed = await merchantService.removeTeamMember({
            merchantId: req.merchant._id,
            userId: req.params.id
        });

        await recordAudit(req, {
            action: "team.member_removed",
            merchantId: req.merchant._id,
            targetType: "user",
            targetId: removed._id,
            metadata: { email: removed.email, merchantRole: removed.merchantRole }
        });

        res.json({ success: true, message: "Team member removed" });
    } catch (err) {
        next(err);
    }
};
