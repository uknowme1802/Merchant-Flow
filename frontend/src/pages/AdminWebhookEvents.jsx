import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import Papa from "papaparse"
import { Download, RefreshCw, Search } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Modal from "../components/ui/Modal"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/merchant/StatusBadge"
import { buttonClass, errorMessage, formatIST, inputClass } from "../utils/format"

// The log of callbacks sent to merchants (admins and agents only). One row per order and event.
// "Data Sent" shows the exact message that went to the merchant's callback URL.

const ORDER_ID = /^ord_[a-z0-9]{16}$/
const REPORT_PAGE = 100 // the API's page maximum
const REPORT_MAX_ROWS = 5000

// A day typed in a date box starts and ends in India time, like every time on these pages.
const dayStart = (day) => new Date(`${day}T00:00:00+05:30`).toISOString()
const dayEnd = (day) => new Date(`${day}T23:59:59.999+05:30`).toISOString()

const statusText = (d) => {
  if (d.status === "delivered") return `Delivered: ${d.statusCode}`
  if (d.status === "pending") return `Pending (${d.attempts}/${d.maxAttempts})${d.statusCode ? `: ${d.statusCode}` : ""}`
  if (d.status === "failed") return `Failed${d.statusCode ? `: ${d.statusCode}` : ""}`
  return "Cancelled"
}

function DataSentModal({ delivery, onClose }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let ignore = false
    API.get(`/webhook-events/${delivery.id}/body`)
      .then((res) => { if (!ignore) setData(res.data) })
      .catch(() => { if (!ignore) setFailed(true) })
    return () => { ignore = true }
  }, [delivery.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.body, null, 2))
      toast.success("Copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  return (
    <Modal title="Data sent" size="lg" onClose={onClose}
      footer={
        <>
          {data && <button type="button" onClick={copy} className={buttonClass.outline}>Copy</button>}
          <button type="button" onClick={onClose} className={buttonClass.ghost}>Close</button>
        </>
      }>
      <dl className="grid grid-cols-3 gap-y-1 text-sm mb-4">
        <dt className="text-gray-500">TXN ID</dt><dd className="col-span-2"><code>{delivery.orderId}</code></dd>
        <dt className="text-gray-500">Event</dt><dd className="col-span-2"><code>{delivery.event}</code></dd>
        <dt className="text-gray-500">Sent to</dt><dd className="col-span-2 break-all">{delivery.url}</dd>
        <dt className="text-gray-500">Status</dt><dd className="col-span-2">{statusText(delivery)}</dd>
        {delivery.error && (<><dt className="text-gray-500">Error</dt><dd className="col-span-2 text-red-600">{delivery.error}</dd></>)}
      </dl>

      {failed && <p className="text-sm text-red-600">Could not load the message.</p>}
      {!failed && !data && <p className="text-sm text-gray-500">Loading…</p>}
      {data && (
        <>
          <pre className="max-h-80 overflow-auto rounded-xl bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
            {JSON.stringify(data.body, null, 2)}
          </pre>
          <p className="mt-3 text-xs text-gray-500">
            The signature is made when the message is sent, from the merchant's secret key, so it is not shown here.
          </p>
        </>
      )}
    </Modal>
  )
}

export default function AdminWebhookEvents() {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [orderId, setOrderId] = useState("") // the applied search
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [reloadKey, setReloadKey] = useState(0)
  const [viewing, setViewing] = useState(null)
  const [reporting, setReporting] = useState(false)

  const filters = () => ({
    orderId: orderId || undefined,
    from: from ? dayStart(from) : undefined,
    to: to ? dayEnd(to) : undefined
  })
  const rangeInvalid = Boolean(from && to && from > to)

  useEffect(() => {
    if (rangeInvalid) return
    let ignore = false
    API.get("/webhook-events", {
      params: {
        orderId: orderId || undefined,
        from: from ? dayStart(from) : undefined,
        to: to ? dayEnd(to) : undefined,
        page, limit
      }
    })
      .then((res) => { if (!ignore) setResult({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [orderId, from, to, rangeInvalid, page, limit, reloadKey])

  const applySearch = (e) => {
    e.preventDefault()
    const value = search.trim().toLowerCase()
    if (value && !ORDER_ID.test(value)) return toast.error("Enter the full transaction ID, like ord_ followed by 16 characters")
    setOrderId(value)
    setPage(1)
  }

  const clearSearch = () => { setSearch(""); setOrderId(""); setPage(1) }

  // Walks every page of the current filter and saves the rows as a CSV file.
  const generateReport = async () => {
    setReporting(true)
    try {
      const rows = []
      for (let p = 1; rows.length < REPORT_MAX_ROWS; p++) {
        const res = await API.get("/webhook-events", { params: { ...filters(), page: p, limit: REPORT_PAGE } })
        rows.push(...res.data.data)
        if (rows.length >= res.data.total || res.data.data.length === 0) break
      }
      if (!rows.length) return toast("Nothing to report for this filter")

      const csv = Papa.unparse(rows.slice(0, REPORT_MAX_ROWS).map((d) => ({
        Date: formatIST(d.createdAt),
        "TXN ID": d.orderId,
        Merchant: d.merchant?.mid || "",
        Mode: d.mode,
        Event: d.event,
        Status: statusText(d),
        Attempts: d.attempts,
        "Last attempt": formatIST(d.lastAttemptAt),
        URL: d.url,
        Error: d.error || ""
      })))
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "webhook-events.csv"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      if (rows.length >= REPORT_MAX_ROWS) toast(`The report holds the newest ${REPORT_MAX_ROWS} rows; narrow the dates for the rest`)
    } catch (e) {
      toast.error(errorMessage(e, "Could not generate the report"))
    } finally {
      setReporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Webhook Events</h2>
        <p className="mt-1 text-sm text-gray-500">The callbacks sent to merchants when an order is paid or fails.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <label className="text-sm text-gray-600">
            <span className="block mb-1">From</span>
            <input type="date" className={inputClass} value={from} max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
          </label>
          <label className="text-sm text-gray-600">
            <span className="block mb-1">To</span>
            <input type="date" className={inputClass} value={to} min={from || undefined}
              onChange={(e) => { setTo(e.target.value); setPage(1) }} />
          </label>

          <form onSubmit={applySearch} className="flex items-end gap-2 grow sm:grow-0">
            <label className="text-sm text-gray-600 grow">
              <span className="block mb-1">Transaction ID</span>
              <input className={`${inputClass} font-mono sm:w-64`} placeholder="ord_…" autoComplete="off"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <button type="submit" aria-label="Search" title="Search" className={`${buttonClass.outline} py-2.5`}><Search size={16} /></button>
            {orderId && <button type="button" onClick={clearSearch} className={buttonClass.ghost}>Clear</button>}
          </form>

          <div className="flex items-center gap-2 sm:ml-auto">
            <button type="button" aria-label="Refresh" title="Refresh" onClick={() => setReloadKey((n) => n + 1)}
              className={`${buttonClass.outline} py-2.5`}><RefreshCw size={16} /></button>
            <button type="button" onClick={generateReport} disabled={reporting || rangeInvalid}
              className={`${buttonClass.primary} inline-flex items-center gap-2`}>
              <Download size={16} /> {reporting ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </div>
        {rangeInvalid && <p className="mb-4 text-sm text-red-600">The start date is after the end date.</p>}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pr-4">Date</th>
                <th className="pr-4">TXN ID</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4">Status Code</th>
                <th>Data Sent</th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-500">No webhook events found.</td></tr>
              )}
              {result.data.map((d) => (
                <tr key={d.id}>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatIST(d.createdAt)}</td>
                  <td className="pr-4">
                    <code>{d.orderId}</code>
                    <span className="block text-xs text-gray-500">{d.event}</span>
                  </td>
                  <td className="pr-4">
                    <span className="block">{d.merchant?.businessName || "-"}</span>
                    <span className="block text-xs text-gray-500">{d.merchant?.mid}</span>
                  </td>
                  <td className="pr-4 whitespace-nowrap">
                    <StatusBadge value={d.status} />
                    {d.statusCode && <span className="ml-2 text-sm text-gray-700">{d.statusCode}</span>}
                    {d.status === "pending" && <span className="ml-2 text-xs text-gray-500">try {d.attempts}/{d.maxAttempts}</span>}
                  </td>
                  <td>
                    <button type="button" onClick={() => setViewing(d)} className={`${buttonClass.outline} px-3 py-1 text-xs`}>View</button>
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

      {viewing && <DataSentModal delivery={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
