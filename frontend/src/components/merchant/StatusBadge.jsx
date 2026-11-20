// A small pill with a coloured dot: merchant, key, bank and mode states.
const colors = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  retiring: "bg-amber-50 text-amber-700 ring-amber-600/20",
  revoked: "bg-gray-100 text-gray-600 ring-gray-500/20",
  expired: "bg-gray-100 text-gray-600 ring-gray-500/20",
  sandbox: "bg-sky-50 text-sky-700 ring-sky-600/20",
  live: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  production: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  inactive: "bg-gray-100 text-gray-600 ring-gray-500/20",
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  claimed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  delivered:"bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
  deleted:"bg-red-50 text-red-700 ring-red-600/20"
}

export default function StatusBadge({ value }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full font-medium capitalize ring-1 ring-inset ${colors[value] || "bg-gray-100 text-gray-600 ring-gray-500/20"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  )
}
