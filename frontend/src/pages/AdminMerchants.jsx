import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import API from "../services/api"
import Card from "../components/ui/Card"
import Button from "../components/ui/Button"
import StatusBadge from "../components/merchant/StatusBadge"

const STATUSES = ["", "pending", "active", "suspended", "rejected"]
const NEEDS_REASON = ["reject", "suspend"]

// Which decisions make sense for each status (the server enforces the same rules).
const ACTIONS = {
  pending: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["reactivate"],
  rejected: []
}

export default function AdminMerchants() {
  const [status, setStatus] = useState("pending")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null) // { merchant, credentials }
  const [reason, setReason] = useState("")
  const [tab, setTab] = useState("merchants")
  const [logs, setLogs] = useState([])

  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey((n) => n + 1)

  useEffect(() => {
    API.get("/admin/merchants", { params: { status: status || undefined, search: search || undefined } })
      .then((res) => setRows(res.data.data))
      .catch(() => {})
  }, [status, search, reloadKey])

  useEffect(() => {
    if (tab !== "audit") return
    API.get("/admin/audit-logs?limit=50").then((res) => setLogs(res.data.data)).catch(() => {})
  }, [tab])

  const view = async (id) => {
    const res = await API.get(`/admin/merchants/${id}`)
    setOpen(res.data)
    setReason("")
  }

  const decide = async (action) => {
    if (NEEDS_REASON.includes(action) && !reason.trim()) return toast.error("A reason is required")
    try {
      await API.post(`/admin/merchants/${open.merchant.id}/${action}`, { reason: reason || undefined })
      toast.success(`Merchant ${action}d`)
      setOpen(null)
      load()
    } catch (e) { toast.error(e.response?.data?.message || "Action failed") }
  }

  const revokeKey = async (credentialId) => {
    if (!window.confirm("Emergency-revoke this key?")) return
    try {
      await API.delete(`/admin/merchants/${open.merchant.id}/credentials/${credentialId}`)
      view(open.merchant.id)
    } catch (e) { toast.error(e.response?.data?.message || "Could not revoke") }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold">Merchants</h2>
        {["merchants", "audit"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded ${tab === t ? "bg-indigo-100 text-indigo-600" : "text-gray-600"}`}>
            {t === "merchants" ? "Review queue" : "Audit log"}
          </button>
        ))}
      </div>

      {tab === "audit" && (
        <Card>
          <ul className="text-sm space-y-1">
            {logs.map((l) => (
              <li key={l._id || l.id} className="flex justify-between gap-4">
                <span>{l.action} <span className="text-gray-500">({l.actorType}{l.actorEmail ? `: ${l.actorEmail}` : ""})</span></span>
                <span className="text-gray-500">{new Date(l.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "merchants" && (
        <>
          <div className="flex gap-3">
            <select className="p-2 border rounded" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
            </select>
            <input className="p-2 border rounded flex-1" placeholder="Search name, email or MID"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Card>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Business</th><th>MID</th><th>Email</th><th>Status</th><th>Applied</th><th></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-gray-500">No merchants found.</td></tr>}
                {rows.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2">{m.businessName}</td>
                    <td><code>{m.mid}</code></td>
                    <td>{m.contactEmail}</td>
                    <td><StatusBadge value={m.status} /></td>
                    <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="text-right"><button className="text-indigo-600 hover:underline" onClick={() => view(m.id)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-xl font-bold">{open.merchant.businessName}</h3>
                <code className="text-sm">{open.merchant.mid}</code>
              </div>
              <StatusBadge value={open.merchant.status} />
            </div>

            <dl className="text-sm grid grid-cols-3 gap-y-1 mb-4">
              <dt className="text-gray-500">Type</dt><dd className="col-span-2">{open.merchant.businessType}</dd>
              <dt className="text-gray-500">Website</dt><dd className="col-span-2">{open.merchant.website || "-"}</dd>
              <dt className="text-gray-500">Country</dt><dd className="col-span-2">{open.merchant.country}</dd>
              <dt className="text-gray-500">Contact</dt><dd className="col-span-2">{open.merchant.contactName}, {open.merchant.contactPhone}, {open.merchant.contactEmail}</dd>
              <dt className="text-gray-500">Registration no.</dt><dd className="col-span-2">{open.merchant.kyc.registrationNumber}</dd>
              <dt className="text-gray-500">Tax ID</dt><dd className="col-span-2">{open.merchant.kyc.taxId || "-"}</dd>
              <dt className="text-gray-500">Address</dt><dd className="col-span-2">{open.merchant.kyc.address}</dd>
              {open.merchant.statusReason && (<><dt className="text-gray-500">Last reason</dt><dd className="col-span-2">{open.merchant.statusReason}</dd></>)}
            </dl>

            <h4 className="font-semibold mb-1">Keys</h4>
            <ul className="text-sm mb-4">
              {open.credentials.length === 0 && <li className="text-gray-500">None issued.</li>}
              {open.credentials.map((c) => (
                <li key={c.id} className="flex justify-between items-center py-1">
                  <span>{c.environment} <code>{c.keyHint}</code> <StatusBadge value={c.status} /></span>
                  {["active", "retiring"].includes(c.status) && (
                    <button className="text-red-600 hover:underline" onClick={() => revokeKey(c.id)}>Revoke</button>
                  )}
                </li>
              ))}
            </ul>

            {ACTIONS[open.merchant.status].length > 0 && (
              <>
                <textarea className="w-full p-2 border rounded mb-3" rows={2}
                  placeholder="Reason (required to reject or suspend)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  {ACTIONS[open.merchant.status].map((a) => (
                    <Button key={a} onClick={() => decide(a)}
                      className={`${a === "approve" || a === "reactivate" ? "bg-green-600" : "bg-red-600"} text-white px-4 py-2 rounded-lg capitalize`}>
                      {a}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <button className="mt-4 text-sm text-gray-500 hover:underline" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
