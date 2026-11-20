import { useEffect, useState } from "react"
import API from "../services/api"
import { OverviewCards } from "../components/dashboard/PayinOverview"
import { errorMessage } from "../utils/format"

// The merchant's own overview: the same nine cards as the staff dashboard, for this merchant only.
// Which merchant is decided by the server from the login, not by anything sent from here.

export default function MerchantDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    API.get("/merchant/dashboard")
      .then((res) => { if (!ignore) setData(res.data) })
      .catch((e) => { if (!ignore) setError(errorMessage(e, "Could not load the overview")) })
    return () => { ignore = true }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your successful orders{data?.merchant ? ` in ${data.merchant.mode} mode` : ""}.
        </p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-600/10">{error}</p>}
      <OverviewCards data={data} />
    </div>
  )
}
