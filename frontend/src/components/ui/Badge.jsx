export default function Badge({ status }) {

  const colors = {
    Success: "bg-green-100 text-green-700",
    Pending: "bg-yellow-100 text-yellow-700",
    Failed: "bg-red-100 text-red-700"
  }

  return (
    <span className={`px-3 py-1 text-xs rounded-full font-medium ${colors[status]}`}>
      {status}
    </span>
  )

}