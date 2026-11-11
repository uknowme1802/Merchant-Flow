const crypto = require("crypto");

// No 0/o/1/i/l so an ID read aloud or typed from a screenshot is hard to get wrong.
const MID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const MID_LENGTH = 12;

// Public merchant ID, for example "mid_k3x9f2ab7mqp". crypto.randomInt is unbiased,
// unlike Math.random() or a modulo over random bytes.
const generateMid = () => {
    let id = "";
    for (let i = 0; i < MID_LENGTH; i++) {
        id += MID_ALPHABET[crypto.randomInt(MID_ALPHABET.length)];
    }
    return `mid_${id}`;
};

// Secret key, for example "sk_test_<43 url-safe characters>" (256 bits of randomness).
// The prefix tells a developer (and a secret scanner) which environment a key belongs to.
const generateSecret = (environment) => {
    const prefix = environment === "live" ? "sk_live_" : "sk_test_";
    return prefix + crypto.randomBytes(32).toString("base64url");
};

const lastFour = (secret) => String(secret).slice(-4);

module.exports = { generateMid, generateSecret, lastFour, MID_ALPHABET, MID_LENGTH };
