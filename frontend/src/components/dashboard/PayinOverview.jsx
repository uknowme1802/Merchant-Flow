import { useEffect, useState } from "react"
import { ArrowDownToLine, Banknote, Clock, HandCoins, Hourglass, Percent, Send, Wallet, WalletCards } from "lucide-react"
import API from "../../services/api"
import { errorMessage, inputClass, rupees } from "../../utils/format"

// The nine cards, in a Pay-in section (five) and a Payout section (four), for the whole platform or one merchant. Every figure is added up on the
// server over successful orders in each merchant's current mode. Settlement and payouts are built
// later, so those cards read zero for now.

const percent = (bps) => (bps == null ? "" : `${(bps / 100).toFixed(2)}%`)

function Card({ title, value, note, icon, muted }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow ring-1 ring-gray-900/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${muted ? "text-gray-400" : ""}`}>{value}</p>
          {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          {icon}
        </div>
      </div>
    </div>
  )
}

export default function PayinOverview() {
  const [merchants, setMerchants] = useState([])
  const [mid, setMid] = useState("")
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    API.get("/payin/filter-options").then((res) => setMerchants(res.data.merchants)).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    API.get("/payin/dashboard", { params: { merchant: mid || undefined } })
      .then((res) => { if (!ignore) { setError(""); setData(res.data) } })
      .catch((e) => { if (!ignore) setError(errorMessage(e, "Could not load the pay-in cards")) })
    return () => { ignore = true }
  }, [mid])

  const c = data?.cards
  const m = data?.merchant
  const later = "Starts with settlements"
  const laterPayout = "Starts with payouts"

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="text-sm text-gray-500">Successful orders, in each merchant's current mode.</p>
        </div>
        <select aria-label="Merchant" className={`${inputClass} !w-auto min-w-56`} value={mid} onChange={(e) => setMid(e.target.value)}>
          <option value="">All merchants</option>
          {merchants.map((x) => <option key={x.mid} value={x.mid}>{x.businessName} ({x.mid})</option>)}
        </select>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-600/10">{error}</p>}

      {c && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Pay-in</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card title="Total pay-in" value={rupees(c.totalPayinPaise)} note={`${data.successCount} successful orders`} icon={<ArrowDownToLine size={20} />} />
              <Card title="Pay-in charges" value={rupees(c.payinChargesPaise)} note={m ? `Rate ${percent(m.payinBps)}` : undefined} icon={<Percent size={20} />} />
              <Card title="Unsettled balance" value={rupees(c.unsettledPaise)} note="What the merchants are owed" icon={<Hourglass size={20} />} />
              <Card title="To be settled" value={rupees(c.toBeSettledPaise)} note={later} icon={<Clock size={20} />} muted />
              <Card title="Settled balance" value={rupees(c.settledPaise)} note={later} icon={<Banknote size={20} />} muted />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Payout</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card title="Total load balance" value={rupees(c.loadBalancePaise)} note={laterPayout} icon={<WalletCards size={20} />} muted />
              <Card title="Available balance" value={rupees(c.availablePaise)} note={laterPayout} icon={<Wallet size={20} />} muted />
              <Card title="Total payout" value={rupees(c.payoutPaise)} note={laterPayout} icon={<Send size={20} />} muted />
              <Card title="Payout charges" value={rupees(c.payoutChargesPaise)} note={m ? `Rate ${percent(m.payoutBps)}` : laterPayout} icon={<HandCoins size={20} />} muted />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
