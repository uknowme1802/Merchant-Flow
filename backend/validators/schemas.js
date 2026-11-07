const Joi = require("joi");
const WEBHOOK_EVENTS = require("../constants/webhookEvents");
const { hasAtMostTwoDecimals } = require("../utils/money");

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

    toggleWebhook: Joi.object({ active: Joi.boolean().strict().required() })
};
