// Shared formatting for the admin pages. Money is stored in whole paise and charges in basis
// points (250 = 2.50%); people type and read rupees and percentages.

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true
})

// Times are stored in UTC and always shown in India time.
export const formatIST = (value) => (value ? IST.format(new Date(value)) : "-")

export const rupees = (paise) =>
  paise == null
    ? "-"
    : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Form helpers. An empty box means "no limit" (null).
export const rupeesInput = (paise) => (paise == null ? "" : String(paise / 100))
export const paiseFromInput = (text) => (String(text).trim() === "" ? null : Math.round(Number(text) * 100))
export const percentInput = (bps) => String((bps ?? 0) / 100)
export const bpsFromInput = (text) => Math.round(Number(text) * 100)
export const percent = (bps) => `${((bps ?? 0) / 100).toFixed(2)}%`

// True for "", "12", "12.5", "12.50": a non-negative number with at most two decimals.
export const isMoneyText = (text) => /^\d{1,9}(\.\d{1,2})?$/.test(String(text).trim())

export const errorMessage = (error, fallback = "Request failed") => error?.response?.data?.message || fallback

// ROLE_AGENT, ROLE_ADMIN, ROLE_MERCHANT
export const roleLabel = (role) => `ROLE_${String(role || "").toUpperCase()}`

export const inputClass =
  "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-gray-400 shadow-sm transition focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:shadow-none"

// Dialog and toolbar buttons (the global button rule already adds padding and rounding).
export const buttonClass = {
  primary: "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-500 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  ghost: "text-gray-600 hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50",
  outline: "bg-white text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
  danger: "bg-red-600 text-white shadow-sm shadow-red-600/30 hover:bg-red-500 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
}

export const iconButtonClass =
  "p-2 rounded-xl text-gray-500 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:cursor-not-allowed"
