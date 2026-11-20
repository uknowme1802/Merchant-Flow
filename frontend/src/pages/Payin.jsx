import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { CircleX, Hash, IndianRupee, RefreshCw, Send, Undo2 } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Field from "../components/ui/Field"
import Modal from "../components/ui/Modal"
import Pagination from "../components/ui/Pagination"
import RowMenu from "../components/ui/RowMenu"
import StatusBadge from "../components/merchant/StatusBadge"
import { buttonClass, errorMessage, formatIST, inputClass, isMoneyText, paiseFromInput, rupees, rupeesInput } from "../utils/format"

// The Payin tab: every order with totals on top, filters, and a row menu for support actions.
// Admins and agents use it. Each action is checked again by the API, and the API refuses an action
// the order's status does not allow, so the menu only hides what cannot work.

const EMPTY_FILTERS = { search: "", status: "", mode: "", merchant: "", bank: "", from: "", to: "" }

// A day typed in a date box starts and ends in India time, like every time on these pages.
const dayStart = (day) => new Date(`${day}T00:00:00+05:30`).toISOString()
const dayEnd = (day) => new Date(`${day}T23:59:59.999+05:30`).toISOString()

const toParams = (f) => ({
  search: f.search.trim() || undefined,
  status: f.status || undefined,
  mode: f.mode || undefined,
  merchant: f.merchant.trim() || undefined,
  bank: f.bank.trim() || undefined,
  from: f.from ? dayStart(f.from) : undefined,
  to: f.to ? dayEnd(f.to) : undefined
})

const STATUS_CHIPS = [["success", "Success"], ["pending", "Pending"], ["failed", "Failed"], ["refunded", "Refunded"]]

const Stat = ({ label, value }) => (
  <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-900/5">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
  </div>
)

// The result of a resend, in words, for the toast.
const resendMessage = (cb) => {
  if (cb.status === "delivered") return { ok: true, text: `Callback delivered (HTTP ${cb.statusCode})` }
  if (cb.status === "failed") return { ok: false, text: `Callback failed${cb.statusCode ? ` (HTTP ${cb.statusCode})` : ""}: ${cb.error || "no answer"}` }
  return { ok: false, text: `Receiver did not accept it${cb.statusCode ? ` (HTTP ${cb.statusCode})` : ""}. It will retry every 5 minutes` }
}

// One dialog for the three actions that need a typed value and a reason.
function ActionModal({ order, action, onClose, onDone }) {
  const left = order.amountPaise - (order.refundedPaise || 0) // what a refund can still take
  const [value, setValue] = useState(action === "amount" ? rupeesInput(order.amountPaise) : action === "refund" ? rupeesInput(left) : action === "utr" ? order.utr || "" : "")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const TITLES = { amount: "Update amount", utr: "Update UTR", fail: "Fail order", refund: "Refund order" }

  const submit = async () => {
    const found = {}
    if (action === "amount" && (!isMoneyText(value) || Number(value) <= 0)) found.value = "An amount in rupees above zero, with at most 2 decimals"
    if (action === "amount" && !found.value && paiseFromInput(value) === order.amountPaise) found.value = "That is already the amount"
    if (action === "refund" && (!isMoneyText(value) || Number(value) <= 0)) found.value = "An amount in rupees above zero, with at most 2 decimals"
    if (action === "refund" && !found.value && paiseFromInput(value) > left) found.value = `At most ${rupees(left)} is left to refund`
    if (action === "utr" && !/^\d{12}$/.test(value)) found.value = "The 12-digit bank reference number"
    if (action === "utr" && value === order.utr) found.value = "That is already the UTR"
    if (reason.trim().length < 3) found.reason = "Give a reason (at least 3 characters)"
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const base = `/payin/orders/${order.orderId}`
      if (action === "amount") await API.patch(`${base}/amount`, { amountPaise: paiseFromInput(value), reason: reason.trim() })
      if (action === "utr") await API.patch(`${base}/utr`, { utr: value, reason: reason.trim() })
      if (action === "fail") await API.post(`${base}/fail`, { reason: reason.trim() })
      if (action === "refund") await API.post(`${base}/refund`, { amountPaise: paiseFromInput(value), reason: reason.trim() })
      toast.success(action === "fail" ? "Order failed" : action === "refund" ? (paiseFromInput(value) === left ? "Order refunded in full" : "Part refunded") : action === "amount" ? "Amount updated" : "UTR updated")
      onDone()
    } catch (e) {
      if (e.response?.status === 403) return // the shared handler already told the user
      toast.error(errorMessage(e, "Could not save the change"))
      // The order may have changed under us: show the fresh state behind the dialog.
      if (e.response?.status === 409) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={TITLES[action]} onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass.ghost}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={buttonClass[action === "fail" || action === "refund" ? "danger" : "primary"]}>
            {action === "fail" ? "Fail order" : action === "refund" ? "Refund" : "Save"}
          </button>
        </>
      }>
      <dl className="grid grid-cols-3 gap-y-1 text-sm mb-4">
        <dt className="text-gray-500">TXN ID</dt><dd className="col-span-2"><code>{order.orderId}</code></dd>
        <dt className="text-gray-500">Merchant</dt><dd className="col-span-2">{order.merchant?.businessName} <span className="text-gray-500">({order.merchant?.mid})</span></dd>
        <dt className="text-gray-500">Amount</dt><dd className="col-span-2">{rupees(order.amountPaise)}</dd>
        {order.refundedPaise > 0 && (
          <><dt className="text-gray-500">Refunded</dt><dd className="col-span-2">{rupees(order.refundedPaise)} <span className="text-gray-500">({rupees(left)} left)</span></dd></>
        )}
        <dt className="text-gray-500">Status</dt><dd className="col-span-2"><StatusBadge value={order.status} /></dd>
      </dl>

      <div className="space-y-4">
        {action === "amount" && (
          <Field label="New amount (₹)" error={errors.value}
            hint={order.status === "success" ? "The PG fee and payable amount are worked out again from the rate stored on the order." : "Must stay inside the merchant's minimum and maximum."}>
            <input className={inputClass} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}
        {action === "utr" && (
          <Field label="New UTR" error={errors.value} hint="12 digits. A UTR can pay only one order.">
            <input className={`${inputClass} font-mono`} inputMode="numeric" autoComplete="off" value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 12))} />
          </Field>
        )}
        {action === "refund" && (
          <Field label="Amount to refund (₹)" error={errors.value} hint={`Up to ${rupees(left)}. The fee and payable are worked out again on what is left.`}>
            <input className={inputClass} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}
        {action === "fail" && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-600/10">
            This cannot be undone. The merchant is sent a failed callback.{order.status === "success" && ` The whole amount is refunded too${order.refundedPaise > 0 ? ` (${rupees(left)} not yet refunded)` : ""}. This is a simulation: no money moves.`}
          </p>
        )}
        {action === "refund" && (
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700 ring-1 ring-violet-600/10">
            This is a simulation: no money moves. A refund cannot be undone, and the merchant is sent a refunded callback each time. Once all of the order is refunded it is final.
          </p>
        )}
        <Field label="Reason" error={errors.reason} hint="Kept in the audit log with who made the change. The merchant does not see it.">
          <input className={inputClass} maxLength={500} autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export default function Payin() {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS) // what the table is showing
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0, totals: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [action, setAction] = useState(null) // { order, kind }
  const [resending, setResending] = useState(null)
  const [options, setOptions] = useState({ merchants: [], banks: [] })
  const [loadError, setLoadError] = useState("")

  const reload = () => setReloadKey((n) => n + 1)
  const rangeInvalid = Boolean(draft.from && draft.to && draft.from > draft.to)

  useEffect(() => {
    API.get("/payin/filter-options").then((res) => setOptions(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    API.get("/payin/orders", { params: { ...toParams(filters), page, limit } })
      .then((res) => { if (!ignore) { setLoadError(""); setResult({ data: res.data.data, total: res.data.total, totals: res.data.totals }) } })
      .catch((e) => { if (!ignore) setLoadError(errorMessage(e, "Could not load the orders")) })
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
      const res = await API.post(`/payin/orders/${order.orderId}/resend-callback`)
      const { ok, text } = resendMessage(res.data.callback)
      if (ok) toast.success(text); else toast.error(text)
      reload()
    } catch (e) {
      if (e.response?.status !== 403) toast.error(errorMessage(e, "Could not resend the callback"))
    } finally {
      setResending(null)
    }
  }

  const menuFor = (o) => [
    { label: "Resend Callback", icon: Send, onClick: () => resend(o), disabled: o.status === "pending" || resending === o.orderId, hint: "Nothing to send while the order is pending" },
    { label: "Update UTR", icon: Hash, onClick: () => setAction({ order: o, kind: "utr" }), disabled: o.status !== "success", hint: "Only for a successful order" },
    { label: "Update Amount", icon: IndianRupee, onClick: () => setAction({ order: o, kind: "amount" }), disabled: o.status === "failed" || o.status === "refunded" || o.refundedPaise > 0, hint: "Not possible for a failed, refunded or partly refunded order" },
    { label: "Refund", icon: Undo2, onClick: () => setAction({ order: o, kind: "refund" }), disabled: o.status !== "success", hint: "Only a successful order with something left can be refunded" },
    { label: "Fail Order", icon: CircleX, tone: "danger", onClick: () => setAction({ order: o, kind: "fail" }), disabled: o.status === "failed" || o.status === "refunded", hint: "The order is already final" }
  ]

  const totals = result.totals

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payin</h2>
          <p className="mt-1 text-sm text-gray-500">Every order, with the totals for what the filters match.</p>
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
            {STATUS_CHIPS.map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-2">
                <StatusBadge value={key} />
                <span className="text-gray-700">{totals.byStatus[key].count} · {rupees(totals.byStatus[key].amountPaise)}</span>
                <span className="sr-only">{label}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={apply} className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" hint="Transaction ID, merchant order ID or UTR"><input className={inputClass} value={draft.search} onChange={set("search")} autoComplete="off" /></Field>
          <Field label="Merchant">
            <select className={inputClass} value={draft.merchant} onChange={set("merchant")}>
              <option value="">All merchants</option>
              {options.merchants.map((m) => <option key={m.mid} value={m.mid}>{m.businessName} ({m.mid})</option>)}
            </select>
          </Field>
          <Field label="Bank">
            <select className={inputClass} value={draft.bank} onChange={set("bank")}>
              <option value="">All banks</option>
              {options.banks.map((b) => <option key={b.bankId} value={b.bankId}>{b.bankName} - {b.holderName}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className={inputClass} value={draft.status} onChange={set("status")}>
                <option value="">All</option><option value="success">Success</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option>
              </select>
            </Field>
            <Field label="Mode">
              <select className={inputClass} value={draft.mode} onChange={set("mode")}>
                <option value="">All</option><option value="sandbox">Sandbox</option><option value="production">Production</option>
              </select>
            </Field>
          </div>
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
                <th className="pr-2"><span className="sr-only">Actions</span></th>
                <th className="pr-4">TXN ID</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4">Created</th>
                <th className="pr-4">Updated</th>
                <th className="pr-4 text-right">Amount</th>
                <th className="pr-4 text-right">PG Fee</th>
                <th className="pr-4 text-right">Payable</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">UTR</th>
                <th className="pr-4">Bank</th>
                <th>Callback</th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={12} className="py-6 text-center text-gray-500">No orders found.</td></tr>
              )}
              {result.data.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-2"><RowMenu label={`Actions for ${o.orderId}`} items={menuFor(o)} /></td>
                  <td className="pr-4">
                    <code>{o.orderId}</code>
                    {o.merchantOrderId && <span className="block text-xs text-gray-500">{o.merchantOrderId}</span>}
                  </td>
                  <td className="pr-4">
                    <span className="block">{o.merchant?.businessName || "-"}</span>
                    <span className="block text-xs text-gray-500">{o.merchant?.mid} · {o.mode}</span>
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
                  <td className="whitespace-nowrap">
                    {o.callback ? (
                      <>
                        <StatusBadge value={o.callback.status} />
                        {o.callback.statusCode && <span className="ml-2 text-sm text-gray-700">{o.callback.statusCode}</span>}
                      </>
                    ) : "-"}
                  </td>
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

      {action && (
        <ActionModal order={action.order} action={action.kind} onClose={() => setAction(null)}
          onDone={() => { setAction(null); reload() }} />
      )}
    </div>
  )
}
