// Shared constants for the merchant platform (Phase 1).

const MERCHANT_STATUS = ["pending", "active", "suspended", "rejected"];

// The only status changes an admin can make, each with the one status it may start from.
// Anything else is refused, so a rejected merchant can never be "approved" by a stray
// request, and "approve" cannot be used to un-suspend (that is "reactivate").
const MERCHANT_ACTIONS = {
    approve:    { from: "pending",   to: "active" },
    reject:     { from: "pending",   to: "rejected" },
    suspend:    { from: "active",    to: "suspended" },
    reactivate: { from: "suspended", to: "active" }
};

// Roles inside one merchant's team.
//   owner     : everything, including managing the team
//   developer : API credentials
//   finance   : read-only access to the account (more in later phases: statements, refunds)
const MERCHANT_ROLES = ["owner", "developer", "finance"];

// Credentials are issued per environment. Sandbox is for testing and moves no money;
// live is only available once the merchant is approved.
const ENVIRONMENTS = ["sandbox", "live"];

const CREDENTIAL_STATUS = ["active", "retiring", "revoked"];

const BUSINESS_TYPES = ["sole_proprietor", "company", "non_profit", "other"];

const KYC_STATUS = ["submitted", "approved", "rejected"];

module.exports = {
    MERCHANT_STATUS,
    MERCHANT_ACTIONS,
    MERCHANT_ROLES,
    ENVIRONMENTS,
    CREDENTIAL_STATUS,
    BUSINESS_TYPES,
    KYC_STATUS
};
