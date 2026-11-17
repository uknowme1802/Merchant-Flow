import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Plus } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Field from "../components/ui/Field"
import Modal from "../components/ui/Modal"
import Pagination from "../components/ui/Pagination"
import StatusBadge from "../components/merchant/StatusBadge"
import { buttonClass, errorMessage, formatIST, inputClass, isMoneyText, paiseFromInput, rupees } from "../utils/format"

// The bank statement. Each line is money that arrived in a bank account; a customer's order claims
// it by entering the same UTR, for the same amount, on the bank that order asked them to pay.
// Money that nobody has claimed yet is what lets a late payer (whose first order expired) succeed.

const EMPTY = { bankId: "", amount: "", utr: "", receivedAt: "", note: "" }

const validate = (f) => {
  const errors = {}
  if (!f.bankId) errors.bankId = "Choose the bank account that received the money"
  if (!isMoneyText(f.amount) || Number(f.amount) <= 0) errors.amount = "An amount in rupees above zero, with at most 2 decimals"
  if (!/^\d{12}$/.test(f.utr)) errors.utr = "The 12-digit bank reference number"
  if (f.receivedAt && new Date(f.receivedAt) > new Date()) errors.receivedAt = "Cannot be in the future"
  return errors
}

function CreditForm({ banks, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      await API.post("/admin/bank-credits", {
        bankId: form.bankId,
        amountPaise: paiseFromInput(form.amount),
        utr: form.utr,
        ...(form.receivedAt ? { receivedAt: new Date(form.receivedAt).toISOString() } : {}),
        note: form.note.trim()
      })
      toast.success("Credit added")
      onSaved()
    } catch (e) {
      // A repeated UTR is a mistake in this form, so show it next to the field.
      if (e.response?.status === 409) setErrors({ utr: errorMessage(e) })
      else toast.error(errorMessage(e, "Could not add the credit"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add bank credit" onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass.ghost}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className={buttonClass.primary}>Add credit</button>
        </>
      }>
      <div className="space-y-4">
        <Field label="Bank account" error={errors.bankId}>
          <select className={inputClass} value={form.bankId} onChange={set("bankId")}>
            <option value="">Choose a bank account</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.bankName} · {b.holderName} · {b.bankId}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount (₹)" error={errors.amount}>
            <input className={inputClass} inputMode="decimal" placeholder="500.00" autoComplete="off"
              value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label="UTR" error={errors.utr} hint="12 digits, from the bank statement.">
            <input className={`${inputClass} font-mono`} inputMode="numeric" placeholder="412345678901" autoComplete="off"
              value={form.utr} onChange={(e) => setForm({ ...form, utr: e.target.value.replace(/\D/g, "").slice(0, 12) })} />
          </Field>
        </div>
        <Field label="Received at" error={errors.receivedAt} hint="Leave empty for now.">
          <input type="datetime-local" className={inputClass} value={form.receivedAt} onChange={set("receivedAt")} />
        </Field>
        <Field label="Note" hint="Optional, for example the statement date.">
          <input className={inputClass} maxLength={200} value={form.note} onChange={set("note")} autoComplete="off" />
        </Field>
        <p className="text-xs text-gray-500">
          The customer's order is paid only when its UTR, amount and bank all match a credit that is still open.
        </p>
      </div>
    </Modal>
  )
}

export default function AdminBankCredits() {
  const [banks, setBanks] = useState([])
  const [bankId, setBankId] = useState("")
  const [claimed, setClaimed] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [reloadKey, setReloadKey] = useState(0)
  const [adding, setAdding] = useState(false)

  const reload = () => setReloadKey((n) => n + 1)

  // The bank list feeds both the filter and the add form (100 is the API's page maximum).
  useEffect(() => {
    let ignore = false
    API.get("/admin/banks", { params: { limit: 100 } })
      .then((res) => { if (!ignore) setBanks(res.data.data) })
      .catch(() => {})
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    API.get("/admin/bank-credits", { params: { bankId: bankId || undefined, claimed: claimed || undefined, page, limit } })
      .then((res) => { if (!ignore) setResult({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [bankId, claimed, page, limit, reloadKey])

  const select = "px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank Credits</h2>
          <p className="mt-1 text-sm text-gray-500">Money that arrived in the bank accounts. A customer claims a line with its UTR.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className={select} aria-label="Bank" value={bankId} onChange={(e) => { setBankId(e.target.value); setPage(1) }}>
            <option value="">all banks</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} · {b.bankId}</option>)}
          </select>
          <select className={select} aria-label="Claimed" value={claimed} onChange={(e) => { setClaimed(e.target.value); setPage(1) }}>
            <option value="">all credits</option>
            <option value="false">open (not claimed)</option>
            <option value="true">claimed</option>
          </select>
          <button type="button" aria-label="Add bank credit" title="Add bank credit" onClick={() => setAdding(true)}
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
                <th className="pr-4">Received</th>
                <th className="pr-4">Bank</th>
                <th className="pr-4">UTR</th>
                <th className="pr-4 text-right">Amount</th>
                <th className="pr-4">Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-500">No bank credits found.</td></tr>
              )}
              {result.data.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatIST(c.receivedAt)}</td>
                  <td className="pr-4">
                    <span className="block">{c.bank.bankName || "-"}</span>
                    <span className="block text-xs text-gray-500">{c.bank.bankId}</span>
                  </td>
                  <td className="pr-4"><code>{c.utr}</code></td>
                  <td className="pr-4 text-right whitespace-nowrap font-medium">{rupees(c.amountPaise)}</td>
                  <td className="pr-4 whitespace-nowrap">
                    {c.claimed ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <StatusBadge value="claimed" />
                        {c.claimedMode && <StatusBadge value={c.claimedMode} />}
                        {c.claimedByOrder && <code className="text-xs text-gray-500">{c.claimedByOrder}</code>}
                      </span>
                    ) : <StatusBadge value="open" />}
                  </td>
                  <td className="text-gray-600">{c.note}</td>
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

      {adding && <CreditForm banks={banks} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setPage(1); reload() }} />}
    </div>
  )
}
