// Callbacks: the signed message we POST to a merchant's callbackUrl when an order is paid or fails.
const CALLBACK_EVENTS = ["order.success", "order.failed"];
const CALLBACK_STATUS = ["pending", "delivered", "failed", "cancelled"];

// After a failed attempt, try again after this long, until the receiver answers HTTP 200 or the
// attempts run out.
const CALLBACK_RETRY_MS = Number(process.env.CALLBACK_RETRY_MINUTES || 5) * 60 * 1000;
const CALLBACK_MAX_ATTEMPTS = Number(process.env.CALLBACK_MAX_ATTEMPTS) || 10;
const CALLBACK_TIMEOUT_MS = Number(process.env.CALLBACK_TIMEOUT_MS) || 5000;
// A claimed delivery is invisible to other workers for this long, so two servers never double-send.
const CALLBACK_LEASE_MS = 2 * 60 * 1000;

module.exports = { CALLBACK_EVENTS, CALLBACK_STATUS, CALLBACK_RETRY_MS, CALLBACK_MAX_ATTEMPTS, CALLBACK_TIMEOUT_MS, CALLBACK_LEASE_MS };
