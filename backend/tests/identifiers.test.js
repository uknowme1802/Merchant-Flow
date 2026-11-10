const { generateMid, generateSecret, lastFour, MID_ALPHABET } = require("../utils/identifiers");

describe("identifiers", () => {
    test("MID has the documented format and only unambiguous characters", () => {
        const mid = generateMid();
        expect(mid).toMatch(/^mid_[a-z0-9]{12}$/);
        for (const ch of mid.slice(4)) expect(MID_ALPHABET).toContain(ch);
        expect(mid.slice(4)).not.toMatch(/[01ilo]/);
    });

    test("a thousand MIDs are all different", () => {
        const set = new Set(Array.from({ length: 1000 }, generateMid));
        expect(set.size).toBe(1000);
    });

    test("secrets carry an environment prefix and 256 bits of randomness", () => {
        const test = generateSecret("sandbox");
        const live = generateSecret("live");
        expect(test).toMatch(/^sk_test_[A-Za-z0-9_-]{43}$/);
        expect(live).toMatch(/^sk_live_[A-Za-z0-9_-]{43}$/);
        expect(generateSecret("live")).not.toBe(live);
    });

    test("lastFour returns the final four characters", () => {
        expect(lastFour("sk_test_abcdefgh")).toBe("efgh");
    });
});
