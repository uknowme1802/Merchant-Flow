// Validates req.query against a Joi schema, like middleware/validate.js does for the body.
// Express 5 makes req.query read-only, so the cleaned values are placed on req.validatedQuery.
module.exports = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.query ?? {}, {
        abortEarly: true,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        const message = error.details?.[0]?.message ?? error.message;
        return res.status(400).json({ success: false, message: message.replace(/"/g, "'") });
    }

    req.validatedQuery = value;
    next();
};
