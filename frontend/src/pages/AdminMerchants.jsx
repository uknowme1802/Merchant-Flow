import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import {
  ArrowRightLeft, CircleCheck, CircleX, KeyRound, Layers, OctagonX, Plus, RotateCw, Search, SquarePen, Trash2, UserPlus
} from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import Pagination from "../components/ui/Pagination"
import RowMenu from "../components/ui/RowMenu"
import Switch from "../components/ui/Switch"
import SecretModal from "../components/SecretModal"
import StatusBadge from "../components/merchant/StatusBadge"
import AuditLogTable from "../components/admin/AuditLogTable"
import {
  BulkMappingModal, CreateMerchantModal, DecisionModal, DeleteMerchantModal, EditConfigModal, ForceDeleteModal,
  KeysModal, ReviewModal, SwitchModeModal, TeamModal
} from "../components/admin/MerchantDialogs"
import { buttonClass, errorMessage, formatIST, inputClass } from "../utils/format"

const STATUSES = [
  ["", "All Status"], ["pending", "Pending"], ["active", "Active"], ["suspended", "Suspended"],
  ["rejected", "Rejected"], ["deleted", "Deleted"]
]

const pill = "px-3 py-1 rounded-full ring-1 ring-inset text-xs font-semibold tracking-wide transition"

export default function AdminMerchants() {
  const navigate = useNavigate()

  const [tab, setTab] = useState("merchants")
  const [status, setStatus] = useState("")
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [reloadKey, setReloadKey] = useState(0)

  // One dialog at a time: { type, merchant }. The one-time value (password or key) is separate,
  // so it outlives the dialog that produced it and is dropped when the admin confirms.
  const [dialog, setDialog] = useState(null)
  const [secret, setSecret] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = () => setReloadKey((n) => n + 1)
  const close = () => setDialog(null)
  const done = () => { close(); reload() }
  const showSecret = (value) => { close(); reload(); setSecret(value) }
  const open = (type, merchant) => () => setDialog({ type, merchant })

  // The search runs on the server, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    if (tab !== "merchants") return
    let ignore = false
    API.get("/admin/merchants", { params: { status: status || undefined, search: search || undefined, page, limit } })
      .then((res) => { if (!ignore) setResult({ data: res.data.data, total: res.data.total }) })
      .catch(() => {})
    return () => { ignore = true }
  }, [tab, status, search, page, limit, reloadKey])

  const applyMfa = async () => {
    setBusy(true)
    try {
      await API.post(`/admin/merchants/${dialog.merchant.id}/${dialog.on ? "require-mfa" : "disable-mfa"}`)
      toast.success(dialog.on ? "2FA is now required" : "2FA turned off")
      done()
    } catch (e) {
      toast.error(errorMessage(e, "Could not change 2FA"))
    } finally {
      setBusy(false)
    }
  }

  const menuFor = (m) => {
    const deleted = m.status === "deleted"
    const gone = { disabled: deleted, hint: "This merchant is deleted" }

    // The decision that fits the merchant's status.
    const decisions = {
      pending: [
        { label: "Approve", icon: CircleCheck, onClick: () => setDialog({ type: "decision", merchant: m, action: "approve" }) },
        { label: "Reject", icon: CircleX, tone: "warning", onClick: () => setDialog({ type: "decision", merchant: m, action: "reject" }) }
      ],
      active: [{ label: "Suspend", icon: CircleX, tone: "warning", onClick: () => setDialog({ type: "decision", merchant: m, action: "suspend" }) }],
      suspended: [{ label: "Reactivate", icon: CircleCheck, onClick: () => setDialog({ type: "decision", merchant: m, action: "reactivate" }) }]
    }

    return [
      { label: "Edit Merchant", icon: SquarePen, onClick: open("config", m), ...gone },
      { label: "API Keys", icon: KeyRound, onClick: open("keys", m), ...gone },
      { label: "Team and reset password", icon: UserPlus, onClick: open("team", m), ...gone },
      {
        label: m.mode === "sandbox" ? "Switch to production" : "Move back to sandbox",
        icon: ArrowRightLeft,
        disabled: m.status !== "active",
        hint: "Only an approved (active) merchant can change mode",
        onClick: open("mode", m)
      },
      ...(decisions[m.status] || []),
      { label: "Delete", icon: Trash2, tone: "danger", onClick: open("delete", m), disabled: deleted, hint: "Already deleted" },
      { label: "Force Delete", icon: OctagonX, tone: "danger", onClick: open("forceDelete", m) }
    ]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Merchant Management</h2>
          <p className="text-sm text-gray-500">Overview of all registered merchants on the platform</p>
        </div>
        <button type="button" onClick={() => setDialog({ type: "create" })}
          className={`flex items-center gap-2 rounded-full ${buttonClass.primary}`}>
          <Plus size={16} /> Add Merchant
        </button>
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-gray-200/60">
        {[["merchants", "Merchant List"], ["audit", "Audit log"]].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-full text-sm ${tab === key ? "bg-white text-indigo-700 font-semibold shadow-sm ring-1 ring-gray-900/5" : "text-gray-600 hover:text-gray-900"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "audit" && <AuditLogTable />}

      {tab === "merchants" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-80 max-w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={`${inputClass} pl-9`} placeholder="Search merchant ID, business, email or username"
                aria-label="Search merchants" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <button type="button" onClick={() => setDialog({ type: "bulk" })}
                className={`flex items-center gap-2 ${buttonClass.outline}`}>
                <Layers size={16} /> Bulk Payin Meta Mapping
              </button>
              <select className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" aria-label="Status" value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" aria-label="Refresh" title="Refresh" onClick={reload}
                className="p-2.5 rounded-xl bg-white text-gray-600 ring-1 ring-gray-200 shadow-sm hover:bg-gray-50">
                <RotateCw size={16} />
              </button>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pr-4">Merchant ID</th>
                    <th className="pr-4">Business Name</th>
                    <th className="pr-4">Email Address</th>
                    <th className="pr-4">Status</th>
                    <th className="pr-4">2FA</th>
                    <th className="pr-4">Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-gray-500">No merchants found.</td></tr>
                  )}
                  {result.data.map((m) => (
                    <tr key={m.id}>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <button type="button" title="View details" onClick={open("review", m)}
                          className="p-0 font-mono text-sm font-normal text-indigo-600 hover:underline">
                          {m.mid}
                        </button>
                      </td>
                      <td className="pr-4 font-medium">{m.businessName}</td>
                      <td className="pr-4">{m.contactEmail}</td>
                      <td className="pr-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge value={m.status} />
                          <StatusBadge value={m.mode} />
                        </span>
                      </td>
                      <td className="pr-4">
                        <Switch checked={m.mfaEnabled || m.mfaRequired} label={`2FA: ${m.businessName}`}
                          disabled={m.status === "deleted"}
                          title={m.mfaEnabled ? "2FA is set up" : m.mfaRequired ? "Required; the owner sets it up at their next login" : "Not required"}
                          onChange={(value) => setDialog({ type: "mfa", merchant: m, on: value })} />
                      </td>
                      <td className="pr-4 whitespace-nowrap">{formatIST(m.createdAt)}</td>
                      <td className="text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <button type="button" onClick={() => navigate(`/admin/merchants/${m.id}/payin`)}
                            className={`${pill} bg-indigo-50 ring-indigo-200 text-indigo-700 hover:bg-indigo-100`}>
                            PAYIN
                          </button>
                          <button type="button" disabled title="Payout is not available yet"
                            className={`${pill} bg-orange-50 ring-orange-200 text-orange-600 opacity-50 cursor-not-allowed`}>
                            PAYOUT
                          </button>
                          <RowMenu label={`Actions for ${m.businessName}`} items={menuFor(m)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page} setPage={setPage} totalPages={Math.ceil(result.total / limit)}
              pageSize={limit} setPageSize={(n) => { setLimit(n); setPage(1) }} total={result.total} sizes={[10, 20, 50]}
            />
          </Card>
        </>
      )}

      {dialog?.type === "create" && (
        <CreateMerchantModal onClose={close} onCreated={(data) => showSecret({
          title: "Merchant created",
          label: "Temporary password",
          value: data.temporaryPassword,
          details: [["Merchant", data.merchant.businessName], ["MID", data.merchant.mid], ["Username", data.username], ["Mode", data.merchant.mode]],
          note: "The owner must change it at first login."
        })} />
      )}
      {dialog?.type === "review" && <ReviewModal merchantId={dialog.merchant.id} onClose={close} onChanged={done} />}
      {dialog?.type === "decision" && <DecisionModal merchant={dialog.merchant} action={dialog.action} onClose={close} onDone={done} />}
      {dialog?.type === "config" && <EditConfigModal merchant={dialog.merchant} onClose={close} onSaved={done} />}
      {dialog?.type === "keys" && <KeysModal merchant={dialog.merchant} onClose={close} onSecret={showSecret} />}
      {dialog?.type === "team" && <TeamModal merchant={dialog.merchant} onClose={close} onSecret={showSecret} />}
      {dialog?.type === "mode" && <SwitchModeModal merchant={dialog.merchant} onClose={close} onSecret={showSecret} />}
      {dialog?.type === "delete" && <DeleteMerchantModal merchant={dialog.merchant} onClose={close} onDone={done} />}
      {dialog?.type === "forceDelete" && <ForceDeleteModal merchant={dialog.merchant} onClose={close} onDone={done} />}
      {dialog?.type === "bulk" && <BulkMappingModal onClose={close} onDone={close} />}
      {dialog?.type === "mfa" && (
        <ConfirmDialog title={dialog.on ? "Require 2FA" : "Turn off 2FA"} tone={dialog.on ? "primary" : "danger"}
          onConfirm={applyMfa} onCancel={close} busy={busy}>
          {dialog.on
            ? <>Require 2FA for the owner of <b>{dialog.merchant.businessName}</b>? They are signed out now and must set up an authenticator app at their next login.</>
            : <>Turn off 2FA for the owner of <b>{dialog.merchant.businessName}</b>? Their authenticator code is cleared and they log in with the password alone. Turn it on again to make them set up a new code.</>}
        </ConfirmDialog>
      )}

      <SecretModal secret={secret} onDone={() => setSecret(null)} />
    </div>
  )
}
