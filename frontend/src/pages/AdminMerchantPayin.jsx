import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import toast from "react-hot-toast"
import { ArrowLeft, BadgeCheck, Plus, Search, Trash2 } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Modal from "../components/ui/Modal"
import StatusBadge from "../components/merchant/StatusBadge"
import Switch from "../components/ui/Switch"
import { buttonClass, errorMessage, formatIST, iconButtonClass, inputClass, rupees } from "../utils/format"

const ENVIRONMENT = { sandbox: "sandbox", production: "live" }

// A mapping's own limit when it has one, otherwise the bank's.
const limit = (mapping, key) => mapping[key] ?? mapping.bank?.[key] ?? null

const BankCell = ({ bank }) => (
  <>
    <span className="inline-flex items-center gap-1 font-medium">
      {bank.holderName}
      {bank.verified && <BadgeCheck size={15} className="text-green-600" aria-label="Verified" />}
    </span>
    <span className="block text-xs text-gray-500">{bank.bankName} · {bank.accountNumber} · {bank.ifsc}</span>
    <span className="block text-xs text-gray-500">{bank.upiId}</span>
  </>
)

// The PAYIN page of one merchant: the bank accounts mapped to it, and below (PAYIN META) the
// banks that are not mapped yet, each with an Add Meta button.
export default function AdminMerchantPayin() {
  const { id } = useParams()

  const [detail, setDetail] = useState(null)
  const [mappings, setMappings] = useState([])
  const [banks, setBanks] = useState({ data: [], total: 0 })
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = () => setReloadKey((n) => n + 1)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 350)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let ignore = false
    Promise.all([API.get(`/admin/merchants/${id}`), API.get(`/admin/merchants/${id}/banks`)])
      .then(([m, mapped]) => { if (!ignore) { setDetail(m.data); setMappings(mapped.data.data) } })
      .catch((e) => { toast.error(errorMessage(e, "Could not load the merchant")) })
    return () => { ignore = true }
  }, [id, reloadKey])

  useEffect(() => {
    let ignore = false
    API.get("/admin/banks", { params: { status: "active", search: search || undefined, limit: 100 } })
      .then((res) => { if (!ignore) setBanks({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [search, reloadKey])

  const addMeta = async (bank) => {
    setBusy(true)
    try {
      await API.post(`/admin/merchants/${id}/banks`, { bankId: bank.id })
      toast.success(`${bank.bankId} mapped`)
      reload()
    } catch (e) {
      toast.error(errorMessage(e, "Could not map the bank"))
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (mapping, active) => {
    setBusy(true)
    try {
      await API.patch(`/admin/merchants/${id}/banks/${mapping.id}`, { active })
      toast.success(active ? "Mapping turned on" : "Mapping turned off")
      reload()
    } catch (e) {
      toast.error(errorMessage(e, "Could not change the mapping"))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await API.delete(`/admin/merchants/${id}/banks/${removing.id}`)
      toast.success("Mapping removed")
      setRemoving(null)
      reload()
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove the mapping"))
    } finally {
      setBusy(false)
    }
  }

  const merchant = detail?.merchant
  const key = merchant && detail.credentials.find((c) => c.environment === ENVIRONMENT[merchant.mode] && c.status === "active")
  const mappedIds = new Set(mappings.map((m) => m.bank?.id))
  const unmapped = banks.data.filter((b) => !mappedIds.has(b.id))

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/merchants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600">
          <ArrowLeft size={15} /> Merchant List
        </Link>
        <h2 className="text-2xl font-bold tracking-tight mt-1">PAYIN</h2>
      </div>

      <Card>
        {!merchant ? <p className="text-sm text-gray-500">Loading…</p> : (
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div><dt className="text-gray-500">Username</dt><dd className="font-medium">{merchant.username || "-"}</dd></div>
            <div><dt className="text-gray-500">MID</dt><dd><code>{merchant.mid}</code></dd></div>
            <div><dt className="text-gray-500">Secret</dt><dd>{key ? <code>{key.keyHint}</code> : "no key yet"}</dd></div>
            <div><dt className="text-gray-500">Status</dt><dd><StatusBadge value={merchant.status} /></dd></div>
            <div><dt className="text-gray-500">Mode</dt><dd><StatusBadge value={merchant.mode} /></dd></div>
          </dl>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Mapped accounts</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pr-4">Bank</th>
                <th className="pr-4">Active</th>
                <th className="pr-4 text-right">Min / Max</th>
                <th className="pr-4 text-right">Daily limit</th>
                <th className="pr-4">Method</th>
                <th className="pr-4">Level</th>
                <th className="pr-4">Created</th>
                <th className="pr-4">Updated</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-500">No bank is mapped to this merchant yet.</td></tr>
              )}
              {mappings.map((m) => m.bank && (
                <tr key={m.id}>
                  <td className="py-3 pr-4"><BankCell bank={m.bank} /></td>
                  <td className="pr-4">
                    <span className="inline-flex items-center gap-2">
                      <Switch checked={m.active && m.bank.status === "active"} label={`Active: ${m.bank.bankId}`}
                        disabled={busy || m.bank.status !== "active"}
                        title={m.bank.status !== "active" ? "The bank itself is inactive. Activate it in the Bank List." : undefined}
                        onChange={(value) => setActive(m, value)} />
                      <span className={m.active && m.bank.status === "active" ? "font-medium text-green-600" : "text-gray-500"}>
                        {m.active && m.bank.status === "active" ? "Yes" : "No"}
                      </span>
                    </span>
                  </td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(limit(m, "minPaise"))} / {rupees(limit(m, "maxPaise"))}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(limit(m, "dailyLimitPaise"))}</td>
                  <td className="pr-4 whitespace-nowrap">{m.bank.methods.join(", ")}</td>
                  <td className="pr-4">{m.bank.level}</td>
                  <td className="pr-4 whitespace-nowrap">{formatIST(m.createdAt)}</td>
                  <td className="pr-4 whitespace-nowrap">{formatIST(m.updatedAt)}</td>
                  <td className="text-right">
                    <button type="button" className={`${iconButtonClass} hover:text-red-600 hover:bg-red-50`}
                      aria-label={`Remove ${m.bank.bankId}`} title="Remove mapping" onClick={() => setRemoving(m)}>
                      <Trash2 size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold">PAYIN META</h3>
            <p className="text-xs text-gray-500">Manual banks that are active and not mapped to this merchant.</p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-9 w-72`} placeholder="Search banks" aria-label="Search banks"
              value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pr-4">Bank ID</th>
                <th className="pr-4">Bank</th>
                <th className="pr-4 text-right">Min / Max</th>
                <th className="pr-4 text-right">Daily limit</th>
                <th className="pr-4">Method</th>
                <th className="pr-4">Level</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {unmapped.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-500">No unmapped banks{search ? " match this search" : ""}.</td></tr>
              )}
              {unmapped.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-4 whitespace-nowrap"><code>{b.bankId}</code></td>
                  <td className="pr-4"><BankCell bank={b} /></td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(b.minPaise)} / {rupees(b.maxPaise)}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(b.dailyLimitPaise)}</td>
                  <td className="pr-4 whitespace-nowrap">{b.methods.join(", ")}</td>
                  <td className="pr-4">{b.level}</td>
                  <td className="text-right">
                    <button type="button" disabled={busy} onClick={() => addMeta(b)}
                      className={`inline-flex items-center gap-1 px-3 py-1 text-sm ${buttonClass.outline}`}>
                      <Plus size={15} /> Add Meta
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {banks.total > banks.data.length && (
          <p className="mt-3 text-xs text-gray-500">Showing the first {banks.data.length} of {banks.total} banks. Search to narrow the list.</p>
        )}
      </Card>

      {removing && (
        <Modal title="Remove mapping" size="sm" onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" onClick={() => setRemoving(null)} className={buttonClass.ghost}>Cancel</button>
              <button type="button" onClick={remove} disabled={busy} className={buttonClass.danger}>Remove</button>
            </>
          }>
          <p className="text-sm text-gray-600">
            Remove <span className="font-medium text-gray-900">{removing.bank.holderName}, {removing.bank.bankName}</span> from this
            merchant? The bank account itself is kept.
          </p>
        </Modal>
      )}
    </div>
  )
}
