// Shared constants for orders and bank credits (Phase 2a). Money is always whole paise.

// An order only moves forward: pending -> success (a payment was claimed) or pending -> failed
// (it expired or an admin failed it). Refunds come in a later phase.
const ORDER_STATUS = ["pending", "success", "failed"];

// A pending order stops accepting a UTR after this long and becomes failed.
const ORDER_EXPIRY_MINUTES = 15;

// The customer types the bank reference number from their UPI app.
const UTR_REGEX = /^\d{12}$/;

// The order id the merchant sends to identify their own order. Printable, no spaces.
const MERCHANT_ORDER_ID_REGEX = /^[A-Za-z0-9_\-.:]{1,64}$/;

// Largest order we accept, in paise (Rs 10,00,000).
const MAX_ORDER_PAISE = 100000000;

// What a correction made by staff stores as the reason, so the merchant's callback never carries
// internal notes. The real reason goes to the audit log.
const STAFF_FAIL_REASON = "failed_by_staff";

module.exports = { STAFF_FAIL_REASON, ORDER_STATUS, ORDER_EXPIRY_MINUTES, UTR_REGEX, MERCHANT_ORDER_ID_REGEX, MAX_ORDER_PAISE };
