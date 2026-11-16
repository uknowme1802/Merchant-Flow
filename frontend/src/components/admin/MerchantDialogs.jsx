import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Search, TriangleAlert } from "lucide-react"
import API from "../../services/api"
import Field from "../ui/Field"
import Modal from "../ui/Modal"
import StatusBadge from "../merchant/StatusBadge"
import {
  bpsFromInput, buttonClass, errorMessage, formatIST, inputClass, isMoneyText,
  paiseFromInput, percentInput, rupeesInput
} from "../../utils/format"

// The dialogs opened from the Merchant List: create, review, Edit Config, Keys, team and reset
// password, the sandbox/production switch and bulk bank mapping. Each one calls the API itself
// and reports back through its callbacks. A dialog never keeps a secret: it hands the one-time
// value to the page (onSecret), which shows it in SecretModal.

const ENVIRONMENT = { sandbox: "sandbox", production: "live" }
const BUSINESS_TYPES = [
  ["company", "Company"], ["sole_proprietor", "Sole proprietor"], ["non_profit", "Non-profit"], ["other", "Other"]
]

const Footer = ({ onClose, onConfirm, confirmLabel, busy, disabled, tone = "primary" }) => (
  <>
    <button type="button" onClick={onClose} className={buttonClass.ghost}>Cancel</button>
    <button type="button" onClick={onConfirm} disabled={busy || disabled} className={buttonClass[tone]}>
      {confirmLabel}
    </button>
  </>
)

const MerchantSummary = ({ merchant }) => (
  <dl className="grid grid-cols-3 gap-y-1 text-sm mb-4">
    <dt className="text-gray-500">Merchant</dt><dd className="col-span-2">{merchant.businessName}</dd>
    <dt className="text-gray-500">MID</dt><dd className="col-span-2"><code>{merchant.mid}</code></dd>
    <dt className="text-gray-500">Mode</dt><dd className="col-span-2"><StatusBadge value={merchant.mode} /></dd>
  </dl>
)

// ---- Create ----

const EMPTY_MERCHANT = {
  businessName: "", businessType: "company", website: "", country: "IN",
  contactName: "", contactPhone: "", email: "", username: "", mode: "sandbox", remark: "",
  registrationNumber: "", taxId: "", address: ""
}

const validateMerchant = (f) => {
  const errors = {}
  if (f.businessName.trim().length < 2) errors.businessName = "At least 2 characters"
  if (f.contactName.trim().length < 2) errors.contactName = "At least 2 characters"
  if (!/^\+?[0-9 ()-]{7,20}$/.test(f.contactPhone.trim())) errors.contactPhone = "7 to 20 digits; may start with +"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = "Enter a valid email address"
  if (!/^[a-z0-9_]{3,30}$/.test(f.username.trim().toLowerCase())) {
    errors.username = "3 to 30 characters: lower case letters, digits and underscore"
  }
  if (f.website.trim() && !/^https?:\/\/\S+$/.test(f.website.trim())) errors.website = "Must start with http:// or https://"
  if (f.country.trim() && f.country.trim().length !== 2) errors.country = "Two-letter country code"
  if (f.registrationNumber.trim().length < 3) errors.registrationNumber = "At least 3 characters"
  if (f.address.trim().length < 5) errors.address = "At least 5 characters"
  if (f.remark.length > 200) errors.remark = "At most 200 characters"
  return errors
}

export function CreateMerchantModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_MERCHANT)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const text = (key, props = {}) => (
    <input className={inputClass} value={form[key]} onChange={set(key)} autoComplete="off" {...props} />
  )

  const save = async () => {
    const found = validateMerchant(form)
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const res = await API.post("/admin/merchants", {
        businessName: form.businessName.trim(),
        businessType: form.businessType,
        website: form.website.trim() || undefined,
        country: form.country.trim() || undefined,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        email: form.email.trim(),
        username: form.username.trim().toLowerCase(),
        mode: form.mode,
        remark: form.remark.trim() || undefined,
        kyc: {
          registrationNumber: form.registrationNumber.trim(),
          taxId: form.taxId.trim() || undefined,
          address: form.address.trim()
        }
      })
      onCreated(res.data)
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the merchant"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add merchant" size="lg" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={save} confirmLabel="Create merchant" busy={busy} />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Business name" error={errors.businessName}>{text("businessName")}</Field>
        <Field label="Business type">
          <select className={inputClass} value={form.businessType} onChange={set("businessType")}>
            {BUSINESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>

        <Field label="Username" error={errors.username} hint="The owner logs in with this or the email.">
          {text("username")}
        </Field>
        <Field label="Owner email" error={errors.email}>{text("email", { type: "email" })}</Field>

        <Field label="Contact name" error={errors.contactName}>{text("contactName")}</Field>
        <Field label="Contact phone" error={errors.contactPhone}>{text("contactPhone", { placeholder: "+91 98765 43210" })}</Field>

        <Field label="Website (optional)" error={errors.website}>{text("website", { placeholder: "https://" })}</Field>
        <Field label="Country" error={errors.country}>{text("country", { maxLength: 2 })}</Field>

        <Field label="Registration number" error={errors.registrationNumber}>{text("registrationNumber")}</Field>
        <Field label="Tax ID (optional)">{text("taxId")}</Field>

        <Field label="Registered address" error={errors.address} className="sm:col-span-2">
          <textarea className={inputClass} rows={2} value={form.address} onChange={set("address")} />
        </Field>

        <fieldset className="sm:col-span-2 text-sm">
          <legend className="mb-1 font-medium text-gray-700">Mode</legend>
          <div className="flex gap-6">
            {[["sandbox", "Sandbox"], ["production", "Production"]].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="mode" className="accent-indigo-600" value={value}
                  checked={form.mode === value} onChange={set("mode")} />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Both modes are simulations. A merchant moved to production later starts with no orders and no funds.
          </p>
        </fieldset>

        <Field label="Remark (optional)" error={errors.remark} hint="Admin-only note shown in the list."
          className="sm:col-span-2">
          {text("remark", { maxLength: 200 })}
        </Field>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        The merchant is created already approved. A temporary password for the owner is shown once after you create it.
      </p>
    </Modal>
  )
}

// ---- Review (details, approve / reject / suspend / reactivate, emergency key revoke) ----

const NEEDS_REASON = ["reject", "suspend"]
const DECISIONS = { pending: ["approve", "reject"], active: ["suspend"], suspended: ["reactivate"], rejected: [] }

export function ReviewModal({ merchantId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [reason, setReason] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    API.get(`/admin/merchants/${merchantId}`)
      .then((res) => { if (!ignore) setDetail(res.data) })
      .catch((e) => { toast.error(errorMessage(e, "Could not load the merchant")) })
    return () => { ignore = true }
  }, [merchantId, reloadKey])

  const decide = async (action) => {
    if (NEEDS_REASON.includes(action) && !reason.trim()) return toast.error("A reason is required")
    try {
      await API.post(`/admin/merchants/${merchantId}/${action}`, { reason: reason.trim() || undefined })
      toast.success(`Merchant ${action}${action.endsWith("e") ? "d" : "ed"}`)
      onChanged()
    } catch (e) { toast.error(errorMessage(e, "Action failed")) }
  }

  const revokeKey = async (credentialId) => {
    if (!window.confirm("Emergency-revoke this key? Requests using it fail immediately.")) return
    try {
      await API.delete(`/admin/merchants/${merchantId}/credentials/${credentialId}`)
      setReloadKey((n) => n + 1)
    } catch (e) { toast.error(errorMessage(e, "Could not revoke")) }
  }

  const m = detail?.merchant
  const actions = m ? DECISIONS[m.status] || [] : []

  return (
    <Modal title={m ? m.businessName : "Merchant"} onClose={onClose}>
      {!m ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <div className="flex items-center gap-3 mb-3">
            <code className="text-sm">{m.mid}</code>
            <StatusBadge value={m.status} />
            <StatusBadge value={m.mode} />
          </div>

          <dl className="text-sm grid grid-cols-3 gap-y-1 mb-4">
            <dt className="text-gray-500">Type</dt><dd className="col-span-2">{m.businessType}</dd>
            <dt className="text-gray-500">Website</dt><dd className="col-span-2">{m.website || "-"}</dd>
            <dt className="text-gray-500">Country</dt><dd className="col-span-2">{m.country || "-"}</dd>
            <dt className="text-gray-500">Contact</dt><dd className="col-span-2">{m.contactName}, {m.contactPhone}, {m.contactEmail}</dd>
            <dt className="text-gray-500">Registration no.</dt><dd className="col-span-2">{m.kyc.registrationNumber}</dd>
            <dt className="text-gray-500">Tax ID</dt><dd className="col-span-2">{m.kyc.taxId || "-"}</dd>
            <dt className="text-gray-500">Address</dt><dd className="col-span-2">{m.kyc.address}</dd>
            <dt className="text-gray-500">Applied</dt><dd className="col-span-2">{formatIST(m.createdAt)}</dd>
            {m.statusReason && (<><dt className="text-gray-500">Last reason</dt><dd className="col-span-2">{m.statusReason}</dd></>)}
          </dl>

          <h4 className="font-semibold mb-1">Keys</h4>
          <ul className="text-sm mb-4">
            {detail.credentials.length === 0 && <li className="text-gray-500">None issued.</li>}
            {detail.credentials.map((c) => (
              <li key={c.id} className="flex justify-between items-center py-1">
                <span className="flex items-center gap-2">{c.environment} <code>{c.keyHint}</code> <StatusBadge value={c.status} /></span>
                {["active", "retiring"].includes(c.status) && (
                  <button type="button" className="px-2 py-1 text-red-600 hover:underline" onClick={() => revokeKey(c.id)}>Revoke</button>
                )}
              </li>
            ))}
          </ul>

          {actions.length > 0 && (
            <>
              <textarea className={`${inputClass} mb-3`} rows={2}
                placeholder="Reason (required to reject or suspend)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                {actions.map((a) => (
                  <button key={a} type="button" onClick={() => decide(a)}
                    className={`capitalize text-white ${a === "approve" || a === "reactivate" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

// ---- Approve / Reject / Suspend / Reactivate from the row menu ----

const DECISION_TEXT = {
  approve: { title: "Approve merchant", done: "Merchant approved", tone: "primary", note: "The merchant becomes active and can use live keys." },
  reject: { title: "Reject merchant", done: "Merchant rejected", tone: "danger", note: "The application is closed. This cannot be undone." },
  suspend: { title: "Suspend merchant", done: "Merchant suspended", tone: "danger", note: "Every login of this merchant is signed out at once and cannot log in until it is reactivated. Its API keys stop working." },
  reactivate: { title: "Reactivate merchant", done: "Merchant reactivated", tone: "primary", note: "The merchant can log in and use the API again." }
}

export function DecisionModal({ merchant, action, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const text = DECISION_TEXT[action]
  const needsReason = NEEDS_REASON.includes(action)

  const run = async () => {
    setBusy(true)
    try {
      await API.post(`/admin/merchants/${merchant.id}/${action}`, { reason: reason.trim() || undefined })
      toast.success(text.done)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e, "Action failed"))
      setBusy(false)
    }
  }

  return (
    <Modal title={text.title} size="sm" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={run} busy={busy} tone={text.tone}
        disabled={needsReason && reason.trim().length < 3} confirmLabel={text.title.split(" ")[0]} />}>
      <MerchantSummary merchant={merchant} />
      <p className="text-sm text-gray-600 mb-4">{text.note}</p>
      <Field label={needsReason ? "Reason" : "Note (optional)"}>
        <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

// ---- Delete (soft) and Force Delete (permanent) ----

export function DeleteMerchantModal({ merchant, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await API.post(`/admin/merchants/${merchant.id}/delete`, { reason: reason.trim() })
      toast.success("Merchant deleted")
      onDone()
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the merchant"))
      setBusy(false)
    }
  }

  return (
    <Modal title="Delete merchant" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={run} busy={busy} tone="danger" disabled={reason.trim().length < 3} confirmLabel="Delete" />}>
      <MerchantSummary merchant={merchant} />

      <div className="flex gap-3 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
        <TriangleAlert size={18} className="shrink-0 mt-0.5" />
        <ul className="list-disc pl-4 space-y-1">
          <li>The merchant leaves the list. Find it again with the Deleted status filter.</li>
          <li>Every login of this merchant is signed out at once and cannot log in. Its API keys are revoked.</li>
          <li>Nothing is erased: its details, logins and bank mappings are kept until you Force Delete it.</li>
        </ul>
      </div>

      <Field label="Reason">
        <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

export function ForceDeleteModal({ merchant, onClose, onDone }) {
  const [confirmMid, setConfirmMid] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const res = await API.post(`/admin/merchants/${merchant.id}/force-delete`, { confirmMid: confirmMid.trim() })
      const { logins, credentials, mappings } = res.data.removed
      toast.success(`Merchant removed with ${logins} login(s), ${credentials} key(s) and ${mappings} mapping(s)`)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e, "Could not force delete the merchant"))
      setBusy(false)
    }
  }

  return (
    <Modal title="Force delete merchant" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={run} busy={busy} tone="danger"
        disabled={confirmMid.trim() !== merchant.mid} confirmLabel="Force Delete" />}>
      <MerchantSummary merchant={merchant} />

      <div className="flex gap-3 p-3 mb-4 rounded-lg bg-red-50 text-red-800 text-sm">
        <TriangleAlert size={18} className="shrink-0 mt-0.5" />
        <ul className="list-disc pl-4 space-y-1">
          <li><b>This cannot be undone.</b> The merchant is permanently removed, with all its logins, API keys and bank mappings.</li>
          <li>The bank accounts themselves and the audit log are kept.</li>
          <li>The email and username become free to use again.</li>
        </ul>
      </div>

      <Field label={`Type the MID to confirm: ${merchant.mid}`}>
        <input className={inputClass} value={confirmMid} onChange={(e) => setConfirmMid(e.target.value)}
          autoComplete="off" spellCheck={false} />
      </Field>
    </Modal>
  )
}

// ---- Edit Config ----

const validateConfig = (f) => {
  const errors = {}
  for (const key of ["payin", "payout", "settlement"]) {
    const value = String(f[key]).trim()
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(value) || Number(value) > 100) {
      errors[key] = "A percentage from 0 to 100, with at most 2 decimals"
    }
  }
  if (!/^\d{1,2}$/.test(String(f.settlementDays).trim()) || Number(f.settlementDays) > 30) {
    errors.settlementDays = "A whole number of days from 0 to 30"
  }
  for (const key of ["minAmount", "maxAmount"]) {
    if (String(f[key]).trim() !== "" && !isMoneyText(f[key])) errors[key] = "An amount in rupees, with at most 2 decimals"
  }
  if (!errors.minAmount && !errors.maxAmount && f.minAmount !== "" && f.maxAmount !== ""
    && Number(f.minAmount) > Number(f.maxAmount)) {
    errors.minAmount = "The minimum cannot be above the maximum"
  }
  if (f.remark.length > 200) errors.remark = "At most 200 characters"
  return errors
}

export function EditConfigModal({ merchant, onClose, onSaved }) {
  const config = merchant.config
  const [form, setForm] = useState({
    webhookAutoTrigger: config.webhookAutoTrigger,
    payin: percentInput(config.payinBps),
    payout: percentInput(config.payoutBps),
    settlement: percentInput(config.settlementBps),
    settlementDays: String(config.settlementDays),
    minAmount: rupeesInput(config.minAmountPaise),
    maxAmount: rupeesInput(config.maxAmountPaise),
    remark: merchant.remark || ""
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    const found = validateConfig(form)
    setErrors(found)
    if (Object.keys(found).length) return

    const next = {
      webhookAutoTrigger: form.webhookAutoTrigger,
      payinBps: bpsFromInput(form.payin),
      payoutBps: bpsFromInput(form.payout),
      settlementBps: bpsFromInput(form.settlement),
      settlementDays: Number(form.settlementDays),
      minAmountPaise: paiseFromInput(form.minAmount),
      maxAmountPaise: paiseFromInput(form.maxAmount),
      remark: form.remark.trim()
    }
    // Send only what changed, so the audit entry shows the real edit.
    const current = { ...config, remark: merchant.remark || "" }
    const patch = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]))
    if (!Object.keys(patch).length) return onClose()

    setBusy(true)
    try {
      await API.patch(`/admin/merchants/${merchant.id}/config`, patch)
      toast.success("Config saved")
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the config"))
    } finally {
      setBusy(false)
    }
  }

  const number = (key, props = {}) => (
    <input className={inputClass} inputMode="decimal" value={form[key]} onChange={set(key)} {...props} />
  )

  return (
    <Modal title="Edit Merchant" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={save} confirmLabel="Save" busy={busy} />}>
      <MerchantSummary merchant={merchant} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="sm:col-span-2 flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.webhookAutoTrigger}
            onChange={(e) => setForm({ ...form, webhookAutoTrigger: e.target.checked })} />
          <span>
            <span className="font-medium text-gray-700">Webhook auto-trigger</span>
            <span className="block text-xs text-gray-500">Off stops automatic callbacks; a manual resend still works.</span>
          </span>
        </label>

        <Field label="Pay-in charge (%)" error={errors.payin}>{number("payin")}</Field>
        <Field label="Payout charge (%)" error={errors.payout}>{number("payout")}</Field>
        <Field label="Settlement rate (%)" error={errors.settlement}>{number("settlement")}</Field>
        <Field label="Settlement cycle (days)" error={errors.settlementDays} hint="T+N: 0 settles at once, 1 after 24 hours.">
          {number("settlementDays", { inputMode: "numeric" })}
        </Field>
        <Field label="Minimum order amount (₹)" error={errors.minAmount} hint="Leave empty for no minimum.">{number("minAmount")}</Field>
        <Field label="Maximum order amount (₹)" error={errors.maxAmount} hint="Leave empty for no maximum.">{number("maxAmount")}</Field>
        <Field label="Remark" error={errors.remark} hint="Admin-only note shown in the list." className="sm:col-span-2">
          <input className={inputClass} value={form.remark} onChange={set("remark")} maxLength={200} />
        </Field>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Changed charges apply to orders created afterwards. Every save is recorded in the audit log with the old and new values.
      </p>
    </Modal>
  )
}

// ---- Keys ----

export function KeysModal({ merchant, onClose, onSecret }) {
  const [credentials, setCredentials] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    API.get(`/admin/merchants/${merchant.id}`)
      .then((res) => { if (!ignore) setCredentials(res.data.credentials) })
      .catch((e) => { toast.error(errorMessage(e, "Could not load the keys")) })
    return () => { ignore = true }
  }, [merchant.id])

  const current = credentials?.find((c) => c.environment === ENVIRONMENT[merchant.mode] && c.status === "active")

  const generate = async () => {
    setBusy(true)
    try {
      const res = await API.post(`/admin/merchants/${merchant.id}/credentials`)
      onSecret({
        title: res.data.regenerated ? "Key regenerated" : "Key generated",
        label: "Secret key",
        value: res.data.secret,
        details: [["Merchant", merchant.businessName], ["MID", res.data.mid], ["Mode", merchant.mode], ["Key ends in", res.data.credential.keyHint]],
        note: res.data.previousKeyExpiresAt
          ? `The old key keeps working until ${formatIST(res.data.previousKeyExpiresAt)}.`
          : undefined
      })
    } catch (e) {
      toast.error(errorMessage(e, "Could not generate the key"))
      setBusy(false)
    }
  }

  return (
    <Modal title="Keys" size="sm" onClose={onClose}
      footer={
        confirming
          ? <Footer onClose={() => setConfirming(false)} onConfirm={generate} confirmLabel="Yes, regenerate" busy={busy} tone="danger" />
          : <Footer onClose={onClose} onConfirm={current ? () => setConfirming(true) : generate}
              confirmLabel={current ? "Regenerate key" : "Generate key"} busy={busy} disabled={!credentials} />
      }>
      <MerchantSummary merchant={merchant} />

      <p className="text-sm">
        <span className="text-gray-500">Current {merchant.mode} key: </span>
        {!credentials ? "Loading…" : current ? <code>{current.keyHint}</code> : "none yet"}
      </p>

      {confirming ? (
        <div className="flex gap-3 p-3 mt-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
          <TriangleAlert size={18} className="shrink-0 mt-0.5" />
          <p>Regenerate the key? The old key keeps working for the grace period (24 hours by default) and then expires.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          The secret is shown once, right after it is generated. It cannot be read back later.
        </p>
      )}
    </Modal>
  )
}

// ---- Team and reset password ----

export function TeamModal({ merchant, onClose, onSecret }) {
  const [members, setMembers] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    API.get(`/admin/merchants/${merchant.id}/team`)
      .then((res) => { if (!ignore) setMembers(res.data.data) })
      .catch((e) => { toast.error(errorMessage(e, "Could not load the team")) })
    return () => { ignore = true }
  }, [merchant.id])

  const reset = async () => {
    setBusy(true)
    try {
      const res = await API.post(`/admin/merchants/${merchant.id}/reset-password`, { userId: target.id })
      onSecret({
        title: "Password reset",
        label: "Temporary password",
        value: res.data.temporaryPassword,
        details: [["MID", merchant.mid], ["Username", res.data.username || "-"], ["Email", res.data.email]],
        note: "The user is signed out and must change it at next login."
      })
    } catch (e) {
      toast.error(errorMessage(e, "Could not reset the password"))
      setBusy(false)
    }
  }

  return (
    <Modal title="Team and reset password" size="lg" onClose={onClose}
      footer={target
        ? <Footer onClose={() => setTarget(null)} onConfirm={reset} confirmLabel="Reset password" busy={busy} tone="danger" />
        : <button type="button" onClick={onClose} className={buttonClass.ghost}>Close</button>}>
      <MerchantSummary merchant={merchant} />

      {target ? (
        <p className="text-sm text-gray-600">
          Reset the password for <span className="font-medium text-gray-900">{target.username || target.email}</span>?
          They are signed out everywhere and get a new temporary password, which is shown to you once.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="pr-4">Username</th><th className="pr-4">Email</th><th className="pr-4">Team role</th>
              <th className="pr-4">MFA</th><th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {!members && <tr><td colSpan={5} className="py-4 text-gray-500">Loading…</td></tr>}
            {members?.map((member) => (
              <tr key={member.id}>
                <td className="py-2 pr-4">{member.username || "-"}</td>
                <td className="pr-4">{member.email}</td>
                <td className="pr-4 capitalize">{member.merchantRole}</td>
                <td className="pr-4">{member.mfaEnabled ? "Yes" : "No"}</td>
                <td className="text-right">
                  <button type="button" className="px-2 py-1 text-indigo-600 hover:underline" onClick={() => setTarget(member)}>
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}

// ---- Switch sandbox / production ----

export function SwitchModeModal({ merchant, onClose, onSecret }) {
  const target = merchant.mode === "sandbox" ? "production" : "sandbox"
  const [confirmMid, setConfirmMid] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const needsReason = target === "sandbox"
  const ready = confirmMid.trim() === merchant.mid && (!needsReason || reason.trim().length >= 3)

  const run = async () => {
    setBusy(true)
    try {
      const res = await API.post(`/admin/merchants/${merchant.id}/switch-mode`, {
        mode: target, confirmMid: confirmMid.trim(), reason: reason.trim() || undefined
      })
      onSecret({
        title: `Now in ${target}`,
        label: "Secret key",
        value: res.data.secret,
        details: [["Merchant", merchant.businessName], ["MID", merchant.mid], ["Mode", target], ["Key ends in", res.data.credential.keyHint]],
        note: `The ${merchant.mode} key has been revoked.`
      })
    } catch (e) {
      toast.error(errorMessage(e, "Could not change the mode"))
      setBusy(false)
    }
  }

  return (
    <Modal title={target === "production" ? "Switch to production" : "Move back to sandbox"} onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={run} busy={busy} disabled={!ready} tone="danger"
        confirmLabel={target === "production" ? "Switch to production" : "Move to sandbox"} />}>
      <MerchantSummary merchant={merchant} />

      <div className="flex gap-3 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
        <TriangleAlert size={18} className="shrink-0 mt-0.5" />
        <ul className="list-disc pl-4 space-y-1">
          <li>The merchant starts {target} with no orders and no funds. The {merchant.mode} data is hidden, not deleted.</li>
          <li>The {merchant.mode} key is revoked now. A {target} key is issued and shown to you once.</li>
          <li>Bank mappings are kept.</li>
        </ul>
      </div>

      <div className="space-y-4">
        <Field label={`Type the MID to confirm: ${merchant.mid}`}>
          <input className={inputClass} value={confirmMid} onChange={(e) => setConfirmMid(e.target.value)}
            autoComplete="off" spellCheck={false} />
        </Field>
        {needsReason && (
          <Field label="Reason" hint="Required to move a merchant back to sandbox.">
            <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  )
}

// ---- Bulk Payin Meta Mapping ----

const MAX_PER_SIDE = 50
const MAX_PAIRS = 500

function Checklist({ title, rows, selected, onToggle, render }) {
  const [filter, setFilter] = useState("")
  const visible = rows.filter((row) => render(row).search.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-gray-500">{selected.size} selected</span>
      </div>
      <div className="relative p-2 border-b">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className={`${inputClass} pl-8 text-sm`} placeholder="Filter" aria-label={`Filter ${title.toLowerCase()}`}
          value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ul className="max-h-64 overflow-y-auto text-sm">
        {visible.length === 0 && <li className="p-3 text-gray-500">Nothing to show.</li>}
        {visible.map((row) => {
          const { primary, secondary } = render(row)
          return (
            <li key={row.id}>
              <label className="flex items-center gap-3 px-3 py-2 hover:bg-indigo-50 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={selected.has(row.id)} onChange={() => onToggle(row.id)} />
                <span className="min-w-0">
                  <span className="block truncate">{primary}</span>
                  <span className="block truncate text-xs text-gray-500">{secondary}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BulkMappingModal({ onClose, onDone }) {
  const [merchants, setMerchants] = useState([])
  const [banks, setBanks] = useState([])
  const [merchantIds, setMerchantIds] = useState(() => new Set())
  const [bankIds, setBankIds] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    Promise.all([
      API.get("/admin/merchants", { params: { limit: 100 } }),
      API.get("/admin/banks", { params: { limit: 100, status: "active" } })
    ])
      .then(([m, b]) => { if (!ignore) { setMerchants(m.data.data); setBanks(b.data.data) } })
      .catch((e) => { toast.error(errorMessage(e, "Could not load merchants and banks")) })
    return () => { ignore = true }
  }, [])

  const toggle = (setter) => (id) => setter((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const pairs = merchantIds.size * bankIds.size
  const tooMany = merchantIds.size > MAX_PER_SIDE || bankIds.size > MAX_PER_SIDE || pairs > MAX_PAIRS

  const run = async () => {
    setBusy(true)
    try {
      const res = await API.post("/admin/bank-mappings/bulk", { merchantIds: [...merchantIds], bankIds: [...bankIds] })
      toast.success(`${res.data.created} mapped, ${res.data.skipped} already existed`)
      onDone()
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the mappings"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Bulk Payin Meta Mapping" size="lg" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={run} busy={busy} disabled={pairs === 0 || tooMany}
        confirmLabel={pairs ? `Create ${pairs} mapping${pairs === 1 ? "" : "s"}` : "Create mappings"} />}>
      <p className="text-sm text-gray-600 mb-4">
        Every selected bank is mapped to every selected merchant. Pairs that are already mapped are skipped.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Checklist title="Merchants" rows={merchants} selected={merchantIds} onToggle={toggle(setMerchantIds)}
          render={(m) => ({
            primary: m.username ? `${m.username} · ${m.businessName}` : m.businessName,
            secondary: `${m.mid} · ${m.mode} · ${m.status}`,
            search: `${m.username || ""} ${m.businessName} ${m.mid}`
          })} />
        <Checklist title="Banks" rows={banks} selected={bankIds} onToggle={toggle(setBankIds)}
          render={(b) => ({
            primary: `${b.holderName} · ${b.bankName}`,
            secondary: `${b.bankId} · ${b.upiId}${b.verified ? "" : " · not verified"}`,
            search: `${b.holderName} ${b.bankName} ${b.bankId} ${b.upiId} ${b.accountNumber}`
          })} />
      </div>

      {tooMany && (
        <p className="mt-3 text-sm text-red-600">
          Choose at most {MAX_PER_SIDE} merchants and {MAX_PER_SIDE} banks, and at most {MAX_PAIRS} mappings in one go.
        </p>
      )}
    </Modal>
  )
}
