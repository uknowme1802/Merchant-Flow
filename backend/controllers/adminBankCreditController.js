const bankCreditService = require("../services/bankCreditService");
const { recordAudit } = require("../utils/audit");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

const toCreditView = (c) => ({
    id: c._id,
    bank: c.bankId && c.bankId.bankId
        ? { id: c.bankId._id, bankId: c.bankId.bankId, bankName: c.bankId.bankName, holderName: c.bankId.holderName }
        : { id: c.bankId },
    amountPaise: c.amountPaise,
    utr: c.utr,
    receivedAt: c.receivedAt,
    note: c.note,
    claimed: !!c.claimedBy,
    claimedAt: c.claimedAt,
    claimedMode: c.claimedMode,
    claimedByOrder: c.claimedBy && c.claimedBy.orderId ? c.claimedBy.orderId : null,
    createdAt: c.createdAt
});

// POST /api/admin/bank-credits
exports.addCredit = wrap(async (req, res) => {
    const credit = await bankCreditService.addCredit(req.body, req.user.id);
    await recordAudit(req, {
        action: "bank_credit.added", targetType: "bank_credit", targetId: credit._id,
        metadata: { bankId: String(credit.bankId), amountPaise: credit.amountPaise, utr: credit.utr }
    });
    res.status(201).json({ success: true, credit: toCreditView(credit) });
});

// GET /api/admin/bank-credits
exports.listCredits = wrap(async (req, res) => {
    const { data, total, page, limit } = await bankCreditService.listCredits(req.validatedQuery);
    res.json({ success: true, total, page, limit, data: data.map(toCreditView) });
});
