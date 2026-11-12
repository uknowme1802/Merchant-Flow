const Joi = require("joi");
const WEBHOOK_EVENTS = require("../constants/webhookEvents");
const { hasAtMostTwoDecimals } = require("../utils/money");
const { BUSINESS_TYPES, ENVIRONMENTS, MERCHANT_STATUS } = require("../constants/merchant");
const { IFSC_REGEX, ACCOUNT_NUMBER_REGEX, UPI_ID_REGEX, BANK_STATUS, BANK_METHODS } = require("../constants/bank");

const paise = Joi.number().integer().min(0).max(100000000000);
const objectId = Joi.string().pattern(/^[a-fA-F0-9]{24}$/);

const bankFields = {
    holderName: Joi.string().trim().min(2).max(120),
    bankName: Joi.string().trim().min(2).max(120),
    accountNumber: Joi.string().trim().pattern(ACCOUNT_NUMBER_REGEX)
        .messages({ "string.pattern.base": "accountNumber must be 9 to 18 digits" }),
    ifsc: Joi.string().trim().uppercase().pattern(IFSC_REGEX)
        .messages({ "string.pattern.base": "ifsc must look like YESB0000001" }),
    upiId: Joi.string().trim().pattern(UPI_ID_REGEX)
        .messages({ "string.pattern.base": "upiId must look like name@bank" }),
    minPaise: paise.allow(null),
    maxPaise: paise.allow(null),
    dailyLimitPaise: paise.allow(null),
    methods: Joi.array().items(Joi.string().valid(...BANK_METHODS)).min(1).unique(),
    qrEnabled: Joi.boolean(),
    level: Joi.string().trim().max(30),
    status: Joi.string().valid(...BANK_STATUS)
};

const bankBody = (required) => Joi.object(Object.fromEntries(
    Object.entries(bankFields).map(([k, v]) => [k, required.includes(k) ? v.required() : v.optional()])
)).custom((v, helpers) => (v.minPaise != null && v.maxPaise != null && v.minPaise > v.maxPaise
    ? helpers.message("minPaise cannot be above maxPaise") : v));

const AMOUNT_MESSAGE = "A valid amount greater than 0 with at most 2 decimal places is required!";
const UTR_MESSAGE = "UTR must be exactly 12 digits!";

const amount = Joi.number()
    .positive()
    .max(10000000)
    .custom((value, helpers) => (hasAtMostTwoDecimals(value) ? value : helpers.error("any.invalid")))
    .required()
    .error(() => new Error(AMOUNT_MESSAGE));

const utr = Joi.string().trim().pattern(/^\d{12}$/).required().error(() => new Error(UTR_MESSAGE));

const twoFactorCode = Joi.string().trim().pattern(/^\d{6}$/).required()
    .error(() => new Error("A 6-digit authentication code is required!"));

const requiredString = (message) => Joi.string().trim().required().error(() => new Error(message));

module.exports = {
    login: Joi.object({
        email: Joi.string().trim().required(),
        password: Joi.string().required()
    }).error(() => new Error("Email or password required")),

    verifyTwoFactorLogin: Joi.object({
        pendingToken: requiredString("Pending token and authentication code is required!"),
        token: twoFactorCode
    }),

    refreshToken: Joi.object({ token: requiredString("Refresh token required") }),
    logout: Joi.object({ token: requiredString("Refresh Token required") }),
    twoFactorToken: Joi.object({ token: twoFactorCode }),

    createCheckout: Joi.object({ amount }),
    verifyPayment: Joi.object({ utr }),

    addTransaction: Joi.object({
        id: Joi.string().trim().max(64).required(),
        amount,
        status: Joi.string().valid("Success", "Pending", "Failed").required(),
        date: Joi.string().isoDate().required(),
        utr: Joi.string().trim().pattern(/^\d{12}$/).allow(null, "").optional()
            .error(() => new Error(UTR_MESSAGE))
    }),

    createUser: Joi.object({
        email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
        password: Joi.string().min(8).max(128).required(),
        role: Joi.string().valid("admin", "user").optional()
    }),

    createValidPayment: Joi.object({ amount, utr }),

    createWebhook: Joi.object({
        url: Joi.string().trim().uri({ scheme: ["http", "https"] }).required(),
        events: Joi.array().items(Joi.string().valid(...WEBHOOK_EVENTS)).min(1).unique().optional(),
        secret: Joi.string().min(16).max(256).optional()
    }),

    toggleWebhook: Joi.object({ active: Joi.boolean().strict().required() }),

    // ---- Phase 1: merchants ----

    merchantSignup: Joi.object({
        businessName: Joi.string().trim().min(2).max(120).required(),
        businessType: Joi.string().valid(...BUSINESS_TYPES).required(),
        website: Joi.string().trim().uri({ scheme: ["http", "https"] }).allow("", null).optional(),
        country: Joi.string().trim().length(2).uppercase().allow("", null).optional(),
        contactName: Joi.string().trim().min(2).max(120).required(),
        contactPhone: Joi.string().trim().pattern(/^\+?[0-9 ()-]{7,20}$/).required()
            .messages({ "string.pattern.base": "contactPhone must be 7 to 20 digits and may start with +" }),
        email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
        password: Joi.string().min(8).max(128).required(),
        kyc: Joi.object({
            registrationNumber: Joi.string().trim().min(3).max(64).required(),
            taxId: Joi.string().trim().max(64).allow("", null).optional(),
            address: Joi.string().trim().min(5).max(300).required()
        }).required()
    }),

    credentialEnvironment: Joi.object({
        environment: Joi.string().valid(...ENVIRONMENTS).required()
    }),

    merchantNote: Joi.object({
        reason: Joi.string().trim().max(500).allow("", null).optional()
    }),

    merchantReason: Joi.object({
        reason: Joi.string().trim().min(3).max(500).required()
    }),

    addTeamMember: Joi.object({
        email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
        password: Joi.string().min(8).max(128).required(),
        // The owner is created at sign-up and cannot be added here.
        merchantRole: Joi.string().valid("developer", "finance").required()
    }),

    merchantListQuery: Joi.object({
        status: Joi.string().valid(...MERCHANT_STATUS).optional(),
        search: Joi.string().trim().max(100).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    createBank: bankBody(["holderName", "bankName", "accountNumber", "ifsc", "upiId"]),
    updateBank: bankBody([]).min(1),

    bankListQuery: Joi.object({
        search: Joi.string().trim().max(100).optional(),
        status: Joi.string().valid(...BANK_STATUS).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    addBankMapping: Joi.object({
        bankId: objectId.required(),
        minPaise: paise.allow(null).optional(),
        maxPaise: paise.allow(null).optional(),
        dailyLimitPaise: paise.allow(null).optional()
    }),

    auditQuery: Joi.object({
        merchantId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).optional(),
        action: Joi.string().trim().max(60).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(25)
    })
};
