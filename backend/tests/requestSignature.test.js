const crypto = require("crypto");
const {
    buildSigningString, sign, verify, safeEqualHex, isTimestampFresh, DEFAULT_TOLERANCE_SECONDS
} = require("../utils/requestSignature");

const SECRET = "sk_test_example_secret";
const base = {
    timestamp: "1767225600",
    method: "POST",
    path: "/v1/orders?currency=INR",
    rawBody: Buffer.from('{"amount":1000.00}')
};

describe("request signing", () => {
    test("signing string has the documented four lines", () => {
        const bodyHash = crypto.createHash("sha256").update(base.rawBody).digest("hex");
        expect(buildSigningString(base)).toBe(`1767225600\nPOST\n/v1/orders?currency=INR\n${bodyHash}`);
    });

    // A fixed vector computed independently with node:crypto, so an accidental change to the
    // algorithm (which would break every merchant's integration) fails this test.
    test("signature matches an independently computed HMAC-SHA256", () => {
        const bodyHash = crypto.createHash("sha256").update(base.rawBody).digest("hex");
        const expected = crypto.createHmac("sha256", SECRET)
            .update(`1767225600\nPOST\n/v1/orders?currency=INR\n${bodyHash}`).digest("hex");
        expect(sign(SECRET, base)).toBe(expected);
        expect(sign(SECRET, base)).toMatch(/^[0-9a-f]{64}$/);
    });

    test("a correct signature verifies", () => {
        expect(verify(SECRET, base, sign(SECRET, base))).toBe(true);
    });

    test("method is case-insensitive", () => {
        expect(sign(SECRET, { ...base, method: "post" })).toBe(sign(SECRET, base));
    });

    test.each([
        ["different secret", () => verify("another", base, sign(SECRET, base))],
        ["changed body (amount)", () => verify(SECRET, { ...base, rawBody: Buffer.from('{"amount":9999.00}') }, sign(SECRET, base))],
        ["changed path", () => verify(SECRET, { ...base, path: "/v1/refunds" }, sign(SECRET, base))],
        ["changed query string", () => verify(SECRET, { ...base, path: "/v1/orders?currency=USD" }, sign(SECRET, base))],
        ["changed method", () => verify(SECRET, { ...base, method: "GET" }, sign(SECRET, base))],
        ["changed timestamp", () => verify(SECRET, { ...base, timestamp: "1767225601" }, sign(SECRET, base))],
        ["empty signature", () => verify(SECRET, base, "")],
        ["wrong-length signature", () => verify(SECRET, base, "abcd")]
    ])("rejects: %s", (_label, run) => {
        expect(run()).toBe(false);
    });

    test("a missing body signs the same as an empty body", () => {
        const get = { timestamp: "1767225600", method: "GET", path: "/v1/whoami" };
        expect(sign(SECRET, get)).toBe(sign(SECRET, { ...get, rawBody: Buffer.alloc(0) }));
    });

    test("safeEqualHex handles different lengths without throwing", () => {
        expect(safeEqualHex("abc", "abcd")).toBe(false);
        expect(safeEqualHex("abcd", "abcd")).toBe(true);
    });
});

describe("timestamp window", () => {
    const now = 1767225600 * 1000;

    test("accepts the current time and small clock skew", () => {
        expect(isTimestampFresh("1767225600", now)).toBe(true);
        expect(isTimestampFresh(String(1767225600 - 120), now)).toBe(true);
        expect(isTimestampFresh(String(1767225600 + 120), now)).toBe(true);
    });

    test("rejects old and far-future timestamps", () => {
        expect(isTimestampFresh(String(1767225600 - DEFAULT_TOLERANCE_SECONDS - 1), now)).toBe(false);
        expect(isTimestampFresh(String(1767225600 + DEFAULT_TOLERANCE_SECONDS + 1), now)).toBe(false);
    });

    test.each(["", "abc", "17672256.5", "-1767225600", "1767225600000000", undefined])(
        "rejects a malformed timestamp: %s", (value) => {
            expect(isTimestampFresh(value, now)).toBe(false);
        }
    );
});
