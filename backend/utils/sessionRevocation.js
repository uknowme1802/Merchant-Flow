// Makes "disable this user", "reset this password" and "change this role" take effect at once,
// instead of when the 15-minute access token expires. authMiddleware asks isRejected() on every
// request, and it is a memory lookup, not a database call.
//
// Two rules:
//   blocked       : the user is disabled. Every access token is refused until they are enabled.
//   revokedBefore : access tokens issued before this moment are refused (reset password, role
//                   change). A token issued afterwards, by a new login or a refresh, works.
//
// The state lives in this process, like the rate limiter, so it is per server instance: correct
// for the single instance this runs on. With several instances, move it to Redis. Nothing is lost
// on a restart that matters: disabled users are loaded again by hydrate(), and login and refresh
// check the database, so the only gap is a token revoked less than 15 minutes before a restart.

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const blocked = new Set();
const revokedBefore = new Map(); // user id -> unix seconds

const nowSeconds = () => Math.floor(Date.now() / 1000);

// A cutoff older than the token lifetime can no longer match a live token.
const prune = () => {
    const oldest = nowSeconds() - ACCESS_TOKEN_TTL_SECONDS;
    for (const [id, cutoff] of revokedBefore) {
        if (cutoff < oldest) revokedBefore.delete(id);
    }
};

const block = (userId) => { blocked.add(String(userId)); };
const unblock = (userId) => { blocked.delete(String(userId)); };

// Token times are whole seconds, so the cutoff is the next second: everything issued up to now is
// refused. issuedAtFor() below keeps a token signed right after this from landing before the cutoff.
const revoke = (userId) => {
    prune();
    revokedBefore.set(String(userId), nowSeconds() + 1);
};

// The "iat" to sign a new access token with: now, or the cutoff if this user's sessions were
// revoked within the last second.
const issuedAtFor = (userId) => Math.max(nowSeconds(), revokedBefore.get(String(userId)) || 0);

// `token` is the decoded access token ({ id, iat }).
const isRejected = (token) => {
    const id = String(token?.id);
    if (blocked.has(id)) return true;
    const cutoff = revokedBefore.get(id);
    return cutoff !== undefined && (token.iat || 0) < cutoff;
};

// Called once at startup: disabled users stay blocked across a restart.
const hydrate = async (User) => {
    const users = await User.find({ disabled: true }).select("_id");
    users.forEach((u) => block(u._id));
    return users.length;
};

const reset = () => { blocked.clear(); revokedBefore.clear(); };

module.exports = { block, unblock, revoke, issuedAtFor, isRejected, hydrate, reset };
