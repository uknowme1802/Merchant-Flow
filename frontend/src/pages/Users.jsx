import { useContext, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { KeyRound, Plus, Search, SquarePen } from "lucide-react"
import API from "../services/api"
import { AuthContext } from "../context/AuthContext"
import Card from "../components/ui/Card"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import Field from "../components/ui/Field"
import Modal from "../components/ui/Modal"
import Pagination from "../components/ui/Pagination"
import Switch from "../components/ui/Switch"
import SecretModal from "../components/SecretModal"
import { buttonClass, errorMessage, formatIST, iconButtonClass, inputClass, roleLabel } from "../utils/format"

const USERNAME = /^[a-z0-9_]{3,30}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MERCHANT_HINT = "Merchant logins are managed from the Merchant List"

const validate = ({ username, email }, usernameRequired) => {
  const errors = {}
  if (username ? !USERNAME.test(username) : usernameRequired) {
    errors.username = "3 to 30 characters: lower case letters, digits and underscore"
  }
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address"
  return errors
}

const CHANGE_LABELS = { username: "Username", email: "Email", role: "Role", disabled: "Disabled" }
const showValue = (key, value) => (key === "role" ? roleLabel(value) : key === "disabled" ? (value ? "Yes" : "No") : value || "-")

function UserForm({ title, initial, isNew, isSelf, onClose, onSaved }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // The edit waiting for a Yes: null, or the fields that would change.
  const [pending, setPending] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async () => {
    const clean = { ...form, username: form.username.trim().toLowerCase(), email: form.email.trim().toLowerCase() }
    const found = validate(clean, isNew)
    setErrors(found)
    if (Object.keys(found).length) return

    if (isNew) {
      setBusy(true)
      try {
        const res = await API.post("/users", { username: clean.username, email: clean.email, role: clean.role })
        onSaved(res.data)
      } catch (e) {
        toast.error(errorMessage(e, "Could not save the user"))
      } finally {
        setBusy(false)
      }
      return
    }

    // Send only what changed; the server refuses an empty update.
    const patch = {}
    if (clean.username && clean.username !== (initial.username || "")) patch.username = clean.username
    if (clean.email !== initial.email.toLowerCase()) patch.email = clean.email
    if (clean.role !== initial.role) patch.role = clean.role
    if (clean.disabled !== initial.disabled) patch.disabled = clean.disabled
    if (!Object.keys(patch).length) return onSaved()
    setPending(patch)
  }

  const apply = async () => {
    setBusy(true)
    try {
      await API.patch(`/users/${initial.id}`, pending)
      toast.success("User updated")
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the user"))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <ConfirmDialog title="Apply these changes?" onConfirm={apply} onCancel={() => setPending(null)} busy={busy}>
        <ul className="space-y-1">
          {Object.entries(pending).map(([key, value]) => (
            <li key={key}>
              <span className="font-medium text-gray-900">{CHANGE_LABELS[key]}:</span>{" "}
              {showValue(key, initial[key])} → {showValue(key, value)}
            </li>
          ))}
        </ul>
        {("role" in pending || pending.disabled) && (
          <p className="mt-3">The user is signed out at once.</p>
        )}
      </ConfirmDialog>
    )
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass.ghost}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={buttonClass.primary}>
            {isNew ? "Create user" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Username" error={errors.username}>
          <input className={inputClass} value={form.username} onChange={set("username")} autoComplete="off" />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={inputClass} type="email" value={form.email} onChange={set("email")} autoComplete="off" />
        </Field>
        <Field label="Role" hint={isSelf ? "You cannot change your own role." : undefined}>
          <select className={inputClass} value={form.role} onChange={set("role")} disabled={isSelf}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </Field>

        {isNew ? (
          <p className="text-sm text-gray-500">
            A temporary password is generated and shown once after you create the user.
          </p>
        ) : (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.disabled} disabled={isSelf}
              onChange={(e) => setForm({ ...form, disabled: e.target.checked })} />
            <span>
              <span className="font-medium text-gray-700">Disabled</span>
              <span className="block text-xs text-gray-500">
                {isSelf ? "You cannot disable your own account." : "A disabled user is signed out at once and cannot log in."}
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}

export default function Users() {
  const { user: me } = useContext(AuthContext)

  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [reloadKey, setReloadKey] = useState(0)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  // The change waiting for a Yes: { kind: "disable" | "enable" | "mfaOn" | "mfaOff" | "reset", user }
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState(null)

  const reload = () => setReloadKey((n) => n + 1)

  // The search runs on the server, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let ignore = false
    API.get("/users", { params: { search: search || undefined, page, limit } })
      .then((res) => { if (!ignore) setResult({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [search, page, limit, reloadKey])

  const isMe = (u) => u.email.toLowerCase() === me?.email?.toLowerCase()
  const name = (u) => u.username || u.email

  const applyConfirmed = async () => {
    const { kind, user } = confirming
    setBusy(true)
    try {
      if (kind === "reset") {
        const res = await API.post(`/users/${user.id}/reset-password`)
        setSecret({
          title: "Password reset",
          label: "Temporary password",
          value: res.data.temporaryPassword,
          details: [["Username", res.data.username || "-"], ["Email", res.data.email]],
          note: "The user is signed out and must change it at next login."
        })
      } else if (kind === "mfaOff") {
        await API.post(`/users/${user.id}/disable-mfa`)
        toast.success("MFA turned off")
      } else if (kind === "mfaOn") {
        await API.post(`/users/${user.id}/require-mfa`)
        toast.success("MFA is now required")
      } else {
        await API.patch(`/users/${user.id}`, { disabled: kind === "disable" })
        toast.success(kind === "disable" ? "User disabled" : "User enabled")
      }
      setConfirming(null)
      reload()
    } catch (e) {
      toast.error(errorMessage(e, "Could not apply the change"))
    } finally {
      setBusy(false)
    }
  }

  const CONFIRM = {
    disable: { title: "Disable user", tone: "danger", text: (u) => <>Disable <b>{name(u)}</b>? They are signed out at once and cannot log in.</> },
    enable: { title: "Enable user", tone: "primary", text: (u) => <>Enable <b>{name(u)}</b>? They can log in again.</> },
    mfaOn: { title: "Require MFA", tone: "primary", text: (u) => <>Require MFA for <b>{name(u)}</b>? They are signed out now and must set up an authenticator app at their next login.</> },
    mfaOff: { title: "Turn off MFA", tone: "danger", text: (u) => <>Turn off MFA for <b>{name(u)}</b>? Their authenticator code is cleared and they log in with the password alone. Turn it on again to make them set up a new code.</> },
    reset: { title: "Reset password", tone: "danger", text: (u) => <>Reset the password for <b>{name(u)}</b>? They are signed out everywhere and get a new temporary password, which is shown to you once.</> }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">User List</h2>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputClass} pl-9 w-72`}
              placeholder="Search username or email"
              aria-label="Search users"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <button type="button" aria-label="Add user" title="Add user" onClick={() => setCreating(true)}
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
                <th className="pr-4">Username</th>
                <th className="pr-4">Email</th>
                <th className="pr-4">Role</th>
                <th className="pr-4">Disabled</th>
                <th className="pr-4">MFA Enabled</th>
                <th className="pr-4">Created on</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-500">No users found.</td></tr>
              )}
              {result.data.map((u) => {
                const merchantLogin = u.role === "merchant"
                const self = isMe(u)
                return (
                  <tr key={u.id}>
                    <td className="py-3 pr-4 font-medium">{u.username || <span className="text-gray-400">-</span>}</td>
                    <td className="pr-4">{u.email}</td>
                    <td className="pr-4">
                      <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold tracking-wide">
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="pr-4">
                      <span className="inline-flex items-center gap-2">
                        <Switch checked={u.disabled} label={`Disabled: ${name(u)}`}
                          disabled={merchantLogin || self}
                          title={merchantLogin ? MERCHANT_HINT : self ? "You cannot disable your own account" : undefined}
                          onChange={(value) => setConfirming({ kind: value ? "disable" : "enable", user: u })} />
                        <span className={u.disabled ? "font-medium text-red-600" : "text-gray-500"}>{u.disabled ? "Yes" : "No"}</span>
                      </span>
                    </td>
                    <td className="pr-4">
                      <span className="inline-flex items-center gap-2">
                        <Switch checked={u.mfaEnabled || u.mfaRequired} label={`MFA: ${name(u)}`}
                          disabled={merchantLogin || self}
                          title={merchantLogin ? MERCHANT_HINT : self ? "Use the Security page for your own MFA" : undefined}
                          onChange={(value) => setConfirming({ kind: value ? "mfaOn" : "mfaOff", user: u })} />
                        <span className={u.mfaEnabled ? "font-medium text-green-600" : u.mfaRequired ? "font-medium text-amber-600" : "text-gray-500"}
                          title={!u.mfaEnabled && u.mfaRequired ? "Required; the user sets it up at their next login" : undefined}>
                          {u.mfaEnabled ? "Yes" : u.mfaRequired ? "Pending" : "No"}
                        </span>
                      </span>
                    </td>
                    <td className="pr-4 whitespace-nowrap">{formatIST(u.createdAt)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button type="button" className={iconButtonClass} disabled={merchantLogin}
                        aria-label={`Edit ${u.email}`}
                        title={merchantLogin ? MERCHANT_HINT : "Edit user"}
                        onClick={() => setEditing(u)}>
                        <SquarePen size={17} />
                      </button>
                      <button type="button" className={iconButtonClass} disabled={merchantLogin || self}
                        aria-label={`Reset password for ${u.email}`}
                        title={merchantLogin ? MERCHANT_HINT : self ? "Use Change password for your own account" : "Reset password"}
                        onClick={() => setConfirming({ kind: "reset", user: u })}>
                        <KeyRound size={17} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page} setPage={setPage} totalPages={Math.ceil(result.total / limit)}
          pageSize={limit} setPageSize={(n) => { setLimit(n); setPage(1) }} total={result.total}
        />
      </Card>

      {creating && (
        <UserForm
          title="Add user" isNew
          initial={{ username: "", email: "", role: "agent" }}
          onClose={() => setCreating(false)}
          onSaved={(data) => {
            setCreating(false)
            reload()
            setSecret({
              title: "User created",
              label: "Temporary password",
              value: data.temporaryPassword,
              details: [["Username", data.user.username], ["Email", data.user.email], ["Role", roleLabel(data.user.role)]],
              note: "The user must change it at first login."
            })
          }}
        />
      )}

      {editing && (
        <UserForm
          title="Edit user" isSelf={isMe(editing)}
          initial={{ id: editing.id, username: editing.username || "", email: editing.email, role: editing.role, disabled: editing.disabled }}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}

      {confirming && (
        <ConfirmDialog title={CONFIRM[confirming.kind].title} tone={CONFIRM[confirming.kind].tone}
          onConfirm={applyConfirmed} onCancel={() => setConfirming(null)} busy={busy}>
          {CONFIRM[confirming.kind].text(confirming.user)}
        </ConfirmDialog>
      )}

      <SecretModal secret={secret} onDone={() => setSecret(null)} />
    </div>
  )
}
