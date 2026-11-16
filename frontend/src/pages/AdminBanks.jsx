import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { BadgeCheck, Plus, Search, SquarePen, Trash2 } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Field from "../components/ui/Field"
import Modal from "../components/ui/Modal"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/merchant/StatusBadge"
import {
  buttonClass, errorMessage, formatIST, iconButtonClass, inputClass, isMoneyText, paiseFromInput, rupees, rupeesInput
} from "../utils/format"

const METHODS = ["UPI", "IMPS"]

const EMPTY_BANK = {
  holderName: "", bankName: "", accountNumber: "", ifsc: "", upiId: "",
  min: "", max: "", daily: "", methods: ["UPI"], qrEnabled: true, level: "Level1", status: "active"
}

const toForm = (bank) => ({
  holderName: bank.holderName, bankName: bank.bankName, accountNumber: bank.accountNumber, ifsc: bank.ifsc,
  upiId: bank.upiId, min: rupeesInput(bank.minPaise), max: rupeesInput(bank.maxPaise), daily: rupeesInput(bank.dailyLimitPaise),
  methods: bank.methods, qrEnabled: bank.qrEnabled, level: bank.level || "", status: bank.status
})

const toBody = (f) => ({
  holderName: f.holderName.trim(), bankName: f.bankName.trim(), accountNumber: f.accountNumber.trim(),
  ifsc: f.ifsc.trim().toUpperCase(), upiId: f.upiId.trim(),
  minPaise: paiseFromInput(f.min), maxPaise: paiseFromInput(f.max), dailyLimitPaise: paiseFromInput(f.daily),
  methods: f.methods, qrEnabled: f.qrEnabled, level: f.level.trim() || "Level1", status: f.status
})

const validate = (f) => {
  const errors = {}
  if (f.holderName.trim().length < 2) errors.holderName = "At least 2 characters"
  if (f.bankName.trim().length < 2) errors.bankName = "At least 2 characters"
  if (!/^\d{9,18}$/.test(f.accountNumber.trim())) errors.accountNumber = "9 to 18 digits"
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.trim().toUpperCase())) errors.ifsc = "Looks like YESB0000001"
  if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,32}$/.test(f.upiId.trim())) errors.upiId = "Looks like name@bank"
  for (const key of ["min", "max", "daily"]) {
    if (String(f[key]).trim() !== "" && !isMoneyText(f[key])) errors[key] = "An amount in rupees, with at most 2 decimals"
  }
  if (!errors.min && !errors.max && f.min !== "" && f.max !== "" && Number(f.min) > Number(f.max)) {
    errors.min = "The minimum cannot be above the maximum"
  }
  if (!f.methods.length) errors.methods = "Choose at least one method"
  return errors
}

function BankForm({ bank, onClose, onSaved }) {
  const [form, setForm] = useState(bank ? toForm(bank) : EMPTY_BANK)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const text = (key, props = {}) => <input className={inputClass} value={form[key]} onChange={set(key)} autoComplete="off" {...props} />
  const toggleMethod = (method) => setForm({
    ...form,
    methods: form.methods.includes(method) ? form.methods.filter((m) => m !== method) : [...form.methods, method]
  })

  const save = async () => {
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      if (bank) {
        // Send only what changed, so the audit entry shows the real edit.
        const before = toBody(toForm(bank))
        const patch = Object.fromEntries(Object.entries(toBody(form))
          .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])))
        if (!Object.keys(patch).length) return onClose()
        await API.patch(`/admin/banks/${bank.id}`, patch)
      } else {
        await API.post("/admin/banks", toBody(form))
      }
      toast.success(bank ? "Bank updated" : "Bank added")
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the bank"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={bank ? `Edit ${bank.bankId}` : "Add bank"} size="lg" onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass.ghost}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className={buttonClass.primary}>{bank ? "Save" : "Add bank"}</button>
        </>
      }>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Holder name" error={errors.holderName}>{text("holderName")}</Field>
        <Field label="Bank name" error={errors.bankName}>{text("bankName")}</Field>
        <Field label="Account number" error={errors.accountNumber}>{text("accountNumber", { inputMode: "numeric" })}</Field>
        <Field label="IFSC" error={errors.ifsc}>{text("ifsc", { placeholder: "YESB0000001" })}</Field>
        <Field label="UPI ID" error={errors.upiId}>{text("upiId", { placeholder: "name@bank" })}</Field>
        <Field label="Level" hint="A label only; it does not affect routing.">{text("level", { maxLength: 30 })}</Field>

        <Field label="Minimum per transaction (₹)" error={errors.min} hint="Leave empty for no minimum.">{text("min", { inputMode: "decimal" })}</Field>
        <Field label="Maximum per transaction (₹)" error={errors.max} hint="Leave empty for no maximum.">{text("max", { inputMode: "decimal" })}</Field>
        <Field label="Daily turnover limit (₹)" error={errors.daily} hint="Leave empty for no limit.">{text("daily", { inputMode: "decimal" })}</Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <fieldset className="text-sm">
          <legend className="mb-1 font-medium text-gray-700">Methods</legend>
          <div className="flex gap-6">
            {METHODS.map((method) => (
              <label key={method} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.methods.includes(method)}
                  onChange={() => toggleMethod(method)} />
                {method}
              </label>
            ))}
          </div>
          {errors.methods && <p className="mt-1 text-xs text-red-600">{errors.methods}</p>}
        </fieldset>

        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.qrEnabled}
            onChange={(e) => setForm({ ...form, qrEnabled: e.target.checked })} />
          <span className="font-medium text-gray-700">QR enabled</span>
        </label>
      </div>

      <p className="mt-4 text-xs text-gray-500">Limits are stored and shown; they are not enforced yet.</p>
    </Modal>
  )
}

export default function AdminBanks() {
  const [status, setStatus] = useState("")
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [reloadKey, setReloadKey] = useState(0)

  const [form, setForm] = useState(null)        // { bank } to edit, {} to add
  const [confirming, setConfirming] = useState(null) // { action: "verify" | "delete", bank }
  const [busy, setBusy] = useState(false)

  const reload = () => setReloadKey((n) => n + 1)

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let ignore = false
    API.get("/admin/banks", { params: { status: status || undefined, search: search || undefined, page, limit } })
      .then((res) => { if (!ignore) setResult({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [status, search, page, limit, reloadKey])

  const confirm = async () => {
    const { action, bank } = confirming
    setBusy(true)
    try {
      if (action === "verify") await API.post(`/admin/banks/${bank.id}/verify`)
      else await API.delete(`/admin/banks/${bank.id}`)
      toast.success(action === "verify" ? "Bank verified" : "Bank deleted")
      setConfirming(null)
      reload()
    } catch (e) {
      toast.error(errorMessage(e, "Action failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Bank List</h2>

        <div className="flex flex-wrap items-center gap-3">
          <select className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" aria-label="Status" value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">all statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-9 w-72`} placeholder="Search bank ID, holder, bank, account or UPI"
              aria-label="Search banks" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <button type="button" aria-label="Add bank" title="Add bank" onClick={() => setForm({})}
            className="flex h-10 w-10 items-center justify-center rounded-full p-0 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95">
            <Plus size={20} />
          </button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pr-4">Bank ID</th>
                <th className="pr-4">Holder</th>
                <th className="pr-4">Bank details</th>
                <th className="pr-4">UPI ID</th>
                <th className="pr-4 text-right">Min / Max</th>
                <th className="pr-4 text-right">Daily limit</th>
                <th className="pr-4">Methods</th>
                <th className="pr-4">Level</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">Created on</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={11} className="py-6 text-center text-gray-500">No bank accounts found.</td></tr>
              )}
              {result.data.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <code>{b.bankId}</code>
                      {b.verified && <BadgeCheck size={16} className="text-green-600" aria-label="Verified" />}
                    </span>
                  </td>
                  <td className="pr-4 font-medium">{b.holderName}</td>
                  <td className="pr-4">
                    <span className="block">{b.bankName}</span>
                    <span className="block text-xs text-gray-500">{b.accountNumber} · {b.ifsc}</span>
                  </td>
                  <td className="pr-4">{b.upiId}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(b.minPaise)} / {rupees(b.maxPaise)}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{rupees(b.dailyLimitPaise)}</td>
                  <td className="pr-4 whitespace-nowrap">{b.methods.join(", ")}{b.qrEnabled ? " · QR" : ""}</td>
                  <td className="pr-4">{b.level}</td>
                  <td className="pr-4"><StatusBadge value={b.status} /></td>
                  <td className="pr-4 whitespace-nowrap">{formatIST(b.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className={iconButtonClass} disabled={b.verified}
                      aria-label={`Verify ${b.bankId}`} title={b.verified ? "Already verified" : "Mark as verified"}
                      onClick={() => setConfirming({ action: "verify", bank: b })}>
                      <BadgeCheck size={17} />
                    </button>
                    <button type="button" className={iconButtonClass} aria-label={`Edit ${b.bankId}`} title="Edit bank"
                      onClick={() => setForm({ bank: b })}>
                      <SquarePen size={17} />
                    </button>
                    <button type="button" className={`${iconButtonClass} hover:text-red-600 hover:bg-red-50`}
                      aria-label={`Delete ${b.bankId}`} title="Delete bank"
                      onClick={() => setConfirming({ action: "delete", bank: b })}>
                      <Trash2 size={17} />
                    </button>
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

      {form && <BankForm bank={form.bank} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}

      {confirming && (
        <Modal title={confirming.action === "verify" ? "Verify bank" : "Delete bank"} size="sm" onClose={() => setConfirming(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirming(null)} className={buttonClass.ghost}>Cancel</button>
              <button type="button" onClick={confirm} disabled={busy}
                className={confirming.action === "verify" ? buttonClass.primary : buttonClass.danger}>
                {confirming.action === "verify" ? "Mark as verified" : "Delete"}
              </button>
            </>
          }>
          <p className="text-sm text-gray-600">
            {confirming.action === "verify"
              ? <>Confirm that the details of <span className="font-medium text-gray-900">{confirming.bank.holderName}, {confirming.bank.bankName}</span> ({confirming.bank.accountNumber}, {confirming.bank.ifsc}) are correct. Unverified banks will not be chosen for orders.</>
              : <>Delete <span className="font-medium text-gray-900">{confirming.bank.bankId}</span>? A bank that is mapped to a merchant cannot be deleted; set it to inactive instead.</>}
          </p>
        </Modal>
      )}
    </div>
  )
}
