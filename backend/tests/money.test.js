const { toMinor, fromMinor, roundMoney, hasAtMostTwoDecimals } = require("../utils/money");

describe("money helpers", () => {
    test("converts to integer minor units without float drift", () => {
        expect(toMinor(0.1 + 0.2)).toBe(30);
        expect(toMinor(19.99)).toBe(1999);
    });

    test("summing in minor units is exact", () => {
        const amounts = [0.1, 0.2, 0.3];
        const naive = amounts.reduce((a, b) => a + b, 0);
        const exact = fromMinor(amounts.reduce((a, b) => a + toMinor(b), 0));
        expect(naive).not.toBe(0.6);
        expect(exact).toBe(0.6);
    });

    test("roundMoney trims to 2 decimals", () => {
        expect(roundMoney(10.126)).toBe(10.13);
        expect(roundMoney(500)).toBe(500);
    });

    test("hasAtMostTwoDecimals", () => {
        expect(hasAtMostTwoDecimals(12.34)).toBe(true);
        expect(hasAtMostTwoDecimals(12)).toBe(true);
        expect(hasAtMostTwoDecimals(12.345)).toBe(false);
    });
});
