const { encrypt, decrypt } = require("../utils/credentialCrypto");

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("credentialCrypto (AES-256-GCM)", () => {
    const originalKey = process.env.CREDENTIAL_ENC_KEY;
    beforeEach(() => { process.env.CREDENTIAL_ENC_KEY = KEY_A; });
    afterAll(() => { process.env.CREDENTIAL_ENC_KEY = originalKey; });

    test("round-trips a secret", () => {
        const payload = encrypt("sk_test_abc123", "mid_x:sandbox");
        expect(decrypt(payload, "mid_x:sandbox")).toBe("sk_test_abc123");
    });

    test("the stored form does not contain the plain secret", () => {
        const payload = encrypt("sk_test_abc123", "mid_x:sandbox");
        expect(JSON.stringify(payload)).not.toContain("sk_test_abc123");
        expect(payload).toEqual({ v: 1, iv: expect.any(String), tag: expect.any(String), data: expect.any(String) });
    });

    test("encrypting the same secret twice gives different ciphertext (random IV)", () => {
        const a = encrypt("same", "aad");
        const b = encrypt("same", "aad");
        expect(a.iv).not.toBe(b.iv);
        expect(a.data).not.toBe(b.data);
    });

    test("fails if the ciphertext is moved to another owner (wrong aad)", () => {
        const payload = encrypt("secret", "mid_alice:live");
        expect(() => decrypt(payload, "mid_bob:live")).toThrow();
    });

    test("fails if the data was tampered with", () => {
        const payload = encrypt("secret", "aad");
        const flipped = Buffer.from(payload.data, "base64");
        flipped[0] ^= 1;
        expect(() => decrypt({ ...payload, data: flipped.toString("base64") }, "aad")).toThrow();
    });

    test("fails with a different server key", () => {
        const payload = encrypt("secret", "aad");
        process.env.CREDENTIAL_ENC_KEY = KEY_B;
        expect(() => decrypt(payload, "aad")).toThrow();
    });

    test("refuses an unknown key version", () => {
        const payload = encrypt("secret", "aad");
        expect(() => decrypt({ ...payload, v: 99 }, "aad")).toThrow("Unsupported");
    });

    test.each([
        ["missing", undefined],
        ["too short", "abc"],
        ["not hex", "z".repeat(64)]
    ])("refuses to run when CREDENTIAL_ENC_KEY is %s", (_label, value) => {
        if (value === undefined) delete process.env.CREDENTIAL_ENC_KEY;
        else process.env.CREDENTIAL_ENC_KEY = value;
        expect(() => encrypt("secret", "aad")).toThrow("CREDENTIAL_ENC_KEY");
    });
});
