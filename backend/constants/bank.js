// Shared constants for bank accounts (Phase 1.1). Money is always whole paise.

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
const UPI_ID_REGEX = /^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,32}$/;

const BANK_STATUS = ["active", "inactive"];
const BANK_METHODS = ["UPI", "IMPS"];

module.exports = { IFSC_REGEX, ACCOUNT_NUMBER_REGEX, UPI_ID_REGEX, BANK_STATUS, BANK_METHODS };
