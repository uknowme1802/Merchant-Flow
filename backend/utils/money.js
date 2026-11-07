// Money helpers. Amounts are rounded to 2 decimals on write and summed in integer
// minor units (paise/cents) so totals never pick up floating-point drift.
const toMinor = (amount) => Math.round(Number(amount) * 100);
const fromMinor = (minor) => minor / 100;
const roundMoney = (amount) => fromMinor(toMinor(amount));
const hasAtMostTwoDecimals = (amount) => Math.abs(Number(amount) * 100 - toMinor(amount)) < 1e-6;

module.exports = { toMinor, fromMinor, roundMoney, hasAtMostTwoDecimals };
