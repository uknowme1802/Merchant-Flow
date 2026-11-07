// Validates req.body against a Joi schema. Unknown fields are stripped (blocks mass assignment)
// and the cleaned value replaces req.body so controllers only ever see whitelisted fields.
module.exports = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body ?? {}, {
        abortEarly: true,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        const message = error.details?.[0]?.message ?? error.message;
        return res.status(400).json({ success: false, message: message.replace(/"/g, "'") });
    }

    req.body = value;
    next();
};
