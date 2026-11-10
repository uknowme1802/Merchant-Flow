const colors = {
  pending: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  suspended: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-700",
  retiring: "bg-yellow-100 text-yellow-700",
  revoked: "bg-gray-200 text-gray-600",
  expired: "bg-gray-200 text-gray-600",
  sandbox: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700"
}

export default function StatusBadge({ value }) {
  return (
    <span className={`px-3 py-1 text-xs rounded-full font-medium ${colors[value] || "bg-gray-100 text-gray-600"}`}>
      {value}
    </span>
  )
}
