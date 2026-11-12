const bankService = require("../services/bankService");
const merchantService = require("../services/merchantService");
const { recordAudit } = require("../utils/audit");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

exports.listBanks = wrap(async (req, res) => {
    const { data, total, page, limit } = await bankService.listBanks(req.validatedQuery);
    res.json({ success: true, total, page, limit, data: data.map(bankService.toBankView) });
});

exports.createBank = wrap(async (req, res) => {
    const bank = await bankService.createBank(req.body, req.user.id);
    await recordAudit(req, {
        action: "bank.created", targetType: "bank", targetId: bank._id,
        metadata: { bankId: bank.bankId, bankName: bank.bankName }
    });
    res.status(201).json({ success: true, bank: bankService.toBankView(bank) });
});

exports.updateBank = wrap(async (req, res) => {
    const { bank, before } = await bankService.updateBank(req.params.id, req.body);
    await recordAudit(req, {
        action: "bank.updated", targetType: "bank", targetId: bank._id,
        metadata: { bankId: bank.bankId, changed: Object.keys(req.body), before }
    });
    res.json({ success: true, bank: bankService.toBankView(bank) });
});

exports.verifyBank = wrap(async (req, res) => {
    const bank = await bankService.verifyBank(req.params.id, req.user.id);
    await recordAudit(req, { action: "bank.verified", targetType: "bank", targetId: bank._id, metadata: { bankId: bank.bankId } });
    res.json({ success: true, bank: bankService.toBankView(bank) });
});

exports.deleteBank = wrap(async (req, res) => {
    const bank = await bankService.deleteBank(req.params.id);
    await recordAudit(req, { action: "bank.deleted", targetType: "bank", targetId: bank._id, metadata: { bankId: bank.bankId } });
    res.json({ success: true });
});

exports.listMappings = wrap(async (req, res) => {
    const merchant = await merchantService.getMerchant(req.params.id);
    res.json({ success: true, data: await bankService.listMappings(merchant._id) });
});

exports.addMapping = wrap(async (req, res) => {
    const merchant = await merchantService.getMerchant(req.params.id);
    const { mapping, bank } = await bankService.addMapping({ merchantId: merchant._id, adminId: req.user.id, ...req.body });
    await recordAudit(req, {
        action: "bank.mapped", merchantId: merchant._id, targetType: "bank", targetId: bank._id,
        metadata: { mid: merchant.mid, bankId: bank.bankId }
    });
    res.status(201).json({ success: true, mapping: bankService.toMappingView(mapping, bank) });
});

exports.removeMapping = wrap(async (req, res) => {
    const merchant = await merchantService.getMerchant(req.params.id);
    const mapping = await bankService.removeMapping(merchant._id, req.params.mappingId);
    await recordAudit(req, {
        action: "bank.unmapped", merchantId: merchant._id, targetType: "bank", targetId: mapping.bankId,
        metadata: { mid: merchant.mid }
    });
    res.json({ success: true });
});
