import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { RefreshCw, Send } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Field from "../components/ui/Field"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/merchant/StatusBadge"
import { buttonClass, errorMessage, formatIST, inputClass, rupees } from "../utils/format"

// The merchant's own orders, with totals on top. The server limits everything to the logged-in
// merchant and its current mode. Owners and developers can resend a callback; finance only reads.

const EMPTY_FILTERS = { search: "", status: "", from: "", to: "" }

// A day typed in a date box starts and ends in India time, like every time on these pages.
const dayStart = (day) => new Date(`${day}T00:00:00+05:30`).toISOString()
const dayEnd = (day) => new Date(`${day}T23:59:59.999+05:30`).toISOString()

const toParams = (f) => ({
  search: f.search.trim() || undefined,
  status: f.status || undefined,
  from: f.from ? dayStart(f.from) : undefined,
  to: f.to ? dayEnd(f.to) : undefined
})

const Stat = ({ label, value }) => (
  <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-900/5">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
  </div>
)

const resendMessage = (cb) => {
  if (cb.status === "delivered") return { ok: true, text: `Callback delivered (HTTP ${cb.statusCode})` }
  if (cb.status === "failed") return { ok: false, text: `Callback failed${cb.statusCode ? ` (HTTP ${cb.statusCode})` : ""}: ${cb.error || "no answer"}` }
  return { ok: false, text: `Your server did not accept it${cb.statusCode ? ` (HTTP ${cb.statusCode})` : ""}. It will retry every 5 minutes` }
}

export default function MerchantTransactions() {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0, totals: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [resending, setResending] = useState(null)
  const [teamRole, setTeamRole] = useState(null)
  const [loadError, setLoadError] = useState("")

  const reload = () => setReloadKey((n) => n + 1)
  const rangeInvalid = Boolean(draft.from && draft.to && draft.from > draft.to)
  const canResend = teamRole === "owner" || teamRole === "developer"

  useEffect(() => {
    API.get("/merchant/me").then((res) => setTeamRole(res.data.teamRole)).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    API.get("/merchant/orders", { params: { ...toParams(filters), page, limit } })
      .then((res) => { if (!ignore) { setLoadError(""); setResult({ data: res.data.data, total: res.data.total, totals: res.data.totals }) } })
      .catch((e) => { if (!ignore) setLoadError(errorMessage(e, "Could not load your orders")) })
    return () => { ignore = true }
  }, [filters, page, limit, reloadKey])

  const apply = (e) => {
    e.preventDefault()
    if (rangeInvalid) return
    setFilters(draft)
    setPage(1)
  }
  const clear = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1) }
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value })

  const resend = async (order) => {
    setResending(order.orderId)
    try {
      const res = await API.post(`/merchant/orders/${order.orderId}/resend-callback`)
      const { ok, text } = resendMessage(res.data.callback)
      if (ok) toast.success(text); else toast.error(text)
      reload()
    } catch (e) {
      if (e.response?.status !== 403) toast.error(errorMessage(e, "Could not resend the callback"))
    } finally {
      setResending(null)
    }
  }

  const totals = result.totals

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
          <p className="mt-1 text-sm text-gray-500">Your orders, with the totals for what the filters match.</p>
        </div>
        <button type="button" aria-label="Refresh" title="Refresh" onClick={reload} className={`${buttonClass.outline} py-2.5`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-600/10">{loadError}</p>
      )}

      {totals && (
        <Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total transactions" value={totals.count} />
            <Stat label="Total payment amount" value={rupees(totals.amountPaise)} />
            <Stat label="Total refunded" value={rupees(totals.refundedPaise)} />
            <Stat label="Total payable amount" value={rupees(totals.payablePaise)} />
            <Stat label="Total PG fees" value={rupees(totals.feePaise)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {["success", "pending", "failed", "refunded"].map((key) => (
              <span key={key} className="inline-flex items-center gap-2">
                <StatusBadge value={key} />
                <span className="text-gray-700">{totals.byStatus[key].count} · {rupees(totals.byStatus[key].amountPaise)}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={apply} className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" hint="Transaction ID, your order ID or UTR"><input className={inputClass} value={draft.search} onChange={set("search")} autoComplete="off" /></Field>
          <Field label="Status">
            <select className={inputClass} value={draft.status} onChange={set("status")}>
              <option value="">All</option><option value="success">Success</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option>
            </select>
          </Field>
          <Field label="From" error={rangeInvalid ? "The start date is after the end date" : undefined}>
            <input type="date" className={inputClass} value={draft.from} max={draft.to || undefined} onChange={set("from")} />
          </Field>
          <Field label="To"><input type="date" className={inputClass} value={draft.to} min={draft.from || undefined} onChange={set("to")} /></Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" disabled={rangeInvalid} className={buttonClass.primary}>Apply</button>
            <button type="button" onClick={clear} className={buttonClass.ghost}>Clear</button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pr-4">TXN ID</th>
                <th className="pr-4">Created</th>
                <th className="pr-4">Updated</th>
                <th className="pr-4 text-right">Amount</th>
                <th className="pr-4 text-right">PG Fee</th>
                <th className="pr-4 text-right">Payable</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">UTR</th>
                <th className="pr-4">Bank</th>
                <th className="pr-4">Callback</th>
                {canResend && <th><span className="sr-only">Resend</span></th>}
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={canResend ? 11 : 10} className="py-6 text-center text-gray-500">No orders found.</td></tr>
              )}
              {result.data.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-4">
                    <code>{o.orderId}</code>
                    {o.merchantOrderId && <span className="block text-xs text-gray-500">{o.merchantOrderId}</span>}
                  </td>
                  <td className="pr-4 whitespace-nowrap">{formatIST(o.createdAt)}</td>
                  <td className="pr-4 whitespace-nowrap">{formatIST(o.updatedAt)}</td>
                  <td className="pr-4 text-right whitespace-nowrap font-medium">
                    {rupees(o.amountPaise)}
                    {o.refundedPaise > 0 && <span className="block text-xs font-normal text-violet-700">Refunded {rupees(o.refundedPaise)}</span>}
                  </td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(o.feePaise)}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(o.payablePaise)}</td>
                  <td className="pr-4 whitespace-nowrap"><StatusBadge value={o.status} /></td>
                  <td className="pr-4">{o.utr ? <code>{o.utr}</code> : "-"}</td>
                  <td className="pr-4 text-xs">
                    {o.bank ? (
                      <>
                        <span className="block text-sm">{o.bank.holderName}</span>
                        <span className="block text-gray-500">{o.bank.accountNumber} · {o.bank.ifsc}</span>
                        <span className="block text-gray-500">{o.bank.upiId}</span>
                      </>
                    ) : "-"}
                  </td>
                  <td className="pr-4 whitespace-nowrap">
                    {o.callback ? (
                      <>
                        <StatusBadge value={o.callback.status} />
                        {o.callback.statusCode && <span className="ml-2 text-sm text-gray-700">{o.callback.statusCode}</span>}
                      </>
                    ) : "-"}
                  </td>
                  {canResend && (
                    <td className="whitespace-nowrap">
                      <button type="button" className={buttonClass.outline} disabled={o.status === "pending" || resending === o.orderId}
                        title={o.status === "pending" ? "Nothing to send while the order is pending" : "Send the result to your callback URL now"}
                        onClick={() => resend(o)}>
                        <Send size={14} /> Resend
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page} setPage={setPage} totalPages={Math.ceil(result.total / limit)}
          pageSize={limit} setPageSize={(n) => { setLimit(n); setPage(1) }} total={result.total}
        />
      </Card>
    </div>
  )
}
