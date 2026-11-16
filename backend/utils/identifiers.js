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

// Public bank account id, for example "bank_k3x9f2ab".
const generateBankId = () => {
    let id = "";
    for (let i = 0; i < 8; i++) {
        id += MID_ALPHABET[crypto.randomInt(MID_ALPHABET.length)];
    }
    return `bank_${id}`;
};

// One-time temporary password for admin-created accounts and resets: 16 characters, no look-alike
// letters, always containing an upper case letter, a lower case letter and a digit.
const TEMP_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const TEMP_LOWER = "abcdefghjkmnpqrstuvwxyz";
const TEMP_DIGIT = "23456789";
const generateTempPassword = () => {
    const all = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT;
    const chars = [
        TEMP_UPPER[crypto.randomInt(TEMP_UPPER.length)],
        TEMP_LOWER[crypto.randomInt(TEMP_LOWER.length)],
        TEMP_DIGIT[crypto.randomInt(TEMP_DIGIT.length)]
    ];
    while (chars.length < 16) chars.push(all[crypto.randomInt(all.length)]);
    // Fisher-Yates shuffle so the required characters are not always first.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
};

const lastFour = (secret) => String(secret).slice(-4);

module.exports = { generateMid, generateBankId, generateTempPassword, generateSecret, lastFour, MID_ALPHABET, MID_LENGTH };
