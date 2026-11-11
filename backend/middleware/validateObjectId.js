// Rejects a malformed ID in the URL with a clean 400, instead of letting MongoDB throw a
// cast error that would surface as a 500. Usage: validateObjectId("id").
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

module.exports = (paramName = "id") => (req, res, next) => {
    if (!OBJECT_ID.test(req.params[paramName] || "")) {
        return res.status(400).json({ success: false, message: `Invalid ${paramName}` });
    }
    next();
};
