const Joi = require("joi");
const WEBHOOK_EVENTS = require("../constants/webhookEvents");
const { hasAtMostTwoDecimals } = require("../utils/money");
const { BUSINESS_TYPES, ENVIRONMENTS, MERCHANT_STATUS, MERCHANT_MODES } = require("../constants/merchant");
const { IFSC_REGEX, ACCOUNT_NUMBER_REGEX, UPI_ID_REGEX, BANK_STATUS, BANK_METHODS } = require("../constants/bank");
const { STAFF_ROLES } = require("../constants/roles");
const { UTR_REGEX, MERCHANT_ORDER_ID_REGEX, MAX_ORDER_PAISE } = require("../constants/order");
const { CALLBACK_STATUS } = require("../constants/callback");

const paise = Joi.number().integer().min(0).max(100000000000);
const objectId = Joi.string().pattern(/^[a-fA-F0-9]{24}$/);

const username = Joi.string().trim().lowercase().pattern(/^[a-z0-9_]{3,30}$/)
    .messages({ "string.pattern.base": "username must be 3 to 30 characters: letters, digits and underscore" });
const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } });

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

    changePassword: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(8).max(128).required()
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

    // The Users tab. No password field: the server generates a temporary one.
    createUser: Joi.object({
        username: username.required(),
        email: email.required(),
        role: Joi.string().valid(...STAFF_ROLES).default("agent")
    }),

    updateUser: Joi.object({
        username,
        email,
        role: Joi.string().valid(...STAFF_ROLES),
        disabled: Joi.boolean().strict()
    }).min(1),

    userListQuery: Joi.object({
        search: Joi.string().trim().max(100).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10)
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
        // The owner's login name. Login accepts it in place of the email.
        username: username.required(),
        password: Joi.string().min(8).max(128).required(),
        kyc: Joi.object({
            registrationNumber: Joi.string().trim().min(3).max(64).required(),
            taxId: Joi.string().trim().max(64).allow("", null).optional(),
            address: Joi.string().trim().min(5).max(300).required()
        }).required()
    }),

    // An admin creating a merchant directly: like sign-up, but no password (a temporary one is
    // generated), plus a username and a mode.
    adminCreateMerchant: Joi.object({
        businessName: Joi.string().trim().min(2).max(120).required(),
        businessType: Joi.string().valid(...BUSINESS_TYPES).required(),
        website: Joi.string().trim().uri({ scheme: ["http", "https"] }).allow("", null).optional(),
        country: Joi.string().trim().length(2).uppercase().allow("", null).optional(),
        contactName: Joi.string().trim().min(2).max(120).required(),
        contactPhone: Joi.string().trim().pattern(/^\+?[0-9 ()-]{7,20}$/).required()
            .messages({ "string.pattern.base": "contactPhone must be 7 to 20 digits and may start with +" }),
        email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
        username: username.required(),
        mode: Joi.string().valid(...MERCHANT_MODES).required(),
        remark: Joi.string().trim().max(200).allow("").optional(),
        kyc: Joi.object({
            registrationNumber: Joi.string().trim().min(3).max(64).required(),
            taxId: Joi.string().trim().max(64).allow("", null).optional(),
            address: Joi.string().trim().min(5).max(300).required()
        }).required()
    }),

    merchantConfig: Joi.object({
        webhookAutoTrigger: Joi.boolean(),
        callbackUrl: Joi.string().trim().max(500).uri({ scheme: ["https", "http"] }).allow(null),
        payinBps: Joi.number().integer().min(0).max(10000),
        payoutBps: Joi.number().integer().min(0).max(10000),
        settlementBps: Joi.number().integer().min(0).max(10000),
        settlementDays: Joi.number().integer().min(0).max(30),
        minAmountPaise: Joi.number().integer().min(0).allow(null),
        maxAmountPaise: Joi.number().integer().min(0).allow(null),
        remark: Joi.string().trim().max(200).allow("")
    }).min(1),

    resetMerchantPassword: Joi.object({
        userId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).optional()
    }),

    switchMerchantMode: Joi.object({
        mode: Joi.string().valid(...MERCHANT_MODES).required(),
        confirmMid: Joi.string().trim().required(),
        reason: Joi.string().trim().min(3).max(500).allow("", null).optional()
    }),

    // Force Delete: the MID must be typed to confirm.
    forceDeleteMerchant: Joi.object({
        confirmMid: Joi.string().trim().required()
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

    // The Active switch on the PAYIN page.
    updateBankMapping: Joi.object({ active: Joi.boolean().strict().required() }),

    // Bulk Payin Meta Mapping: every chosen merchant gets every chosen bank.
    bulkBankMapping: Joi.object({
        merchantIds: Joi.array().items(objectId).min(1).max(50).unique().required(),
        bankIds: Joi.array().items(objectId).min(1).max(50).unique().required()
    }),

    // POST /v1/orders. Amounts are whole paise: 50000 is Rs 500.00.
    createOrder: Joi.object({
        amountPaise: Joi.number().integer().strict().min(1).max(MAX_ORDER_PAISE).required()
            .messages({ "number.base": "amountPaise must be a whole number of paise", "number.integer": "amountPaise must be a whole number of paise" }),
        merchantOrderId: Joi.string().pattern(MERCHANT_ORDER_ID_REGEX).optional()
            .messages({ "string.pattern.base": "merchantOrderId must be 1 to 64 characters: letters, digits and _ - . :" }),
        description: Joi.string().trim().max(200).allow("").default(""),
        customerName: Joi.string().trim().max(120).allow("").default("")
    }),

    // The customer's bank reference number, entered on the checkout page.
    claimPayment: Joi.object({
        utr: Joi.string().trim().pattern(UTR_REGEX).required()
            .messages({ "string.pattern.base": "The UTR is the 12-digit reference number from your payment app" })
    }),

    // The admin's bank statement entry.
    createBankCredit: Joi.object({
        bankId: objectId.required(),
        amountPaise: Joi.number().integer().strict().min(1).max(MAX_ORDER_PAISE).required(),
        utr: Joi.string().trim().pattern(UTR_REGEX).required()
            .messages({ "string.pattern.base": "utr must be the 12-digit bank reference number" }),
        receivedAt: Joi.date().max("now").optional(),
        note: Joi.string().trim().max(200).allow("").default("")
    }),

    bankCreditListQuery: Joi.object({
        bankId: objectId.optional(),
        claimed: Joi.boolean().optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    callbackListQuery: Joi.object({
        merchantId: objectId.optional(),
        mode: Joi.string().valid(...MERCHANT_MODES).optional(),
        status: Joi.string().valid(...CALLBACK_STATUS).optional(),
        orderId: Joi.string().pattern(/^ord_[a-z0-9]{16}$/).optional(),
        from: Joi.date().iso().optional(),
        to: Joi.date().iso().when("from", { is: Joi.exist(), then: Joi.date().min(Joi.ref("from")) }).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    auditQuery: Joi.object({
        merchantId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).optional(),
        action: Joi.string().trim().max(60).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(25)
    })
};
