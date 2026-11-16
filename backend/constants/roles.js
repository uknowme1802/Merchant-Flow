// Login roles.
//   admin    : everything, including the admin console
//   agent    : own transactions and dashboard, and the old checkout (this role was called "user")
//   merchant : a member of one merchant's team; managed from the Merchant List
const ROLES = ["admin", "agent", "merchant"];

// Roles an admin can give from the Users tab. Merchant logins are created with their merchant.
const STAFF_ROLES = ["admin", "agent"];

// "user" was renamed to "agent". Access tokens issued before the rename still say "user" for up to
// 15 minutes, and a database that has not run scripts/migrateUserRoleToAgent.js still stores it,
// so both are read as "agent" and the User schema still accepts the stored value. Remove this
// alias once the migration has run everywhere.
const LEGACY_ROLE_ALIASES = { user: "agent" };

const normaliseRole = (role) => (Object.hasOwn(LEGACY_ROLE_ALIASES, role) ? LEGACY_ROLE_ALIASES[role] : role);

module.exports = { ROLES, STAFF_ROLES, LEGACY_ROLE_ALIASES, normaliseRole };
