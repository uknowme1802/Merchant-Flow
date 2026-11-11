import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import API from "../services/api"
import Card from "../components/ui/Card"
import Button from "../components/ui/Button"

export default function MerchantTeam() {
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({ email: "", password: "", merchantRole: "developer" })
  const [logs, setLogs] = useState([])

  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey((n) => n + 1)

  useEffect(() => {
    Promise.all([API.get("/merchant/team"), API.get("/merchant/audit-logs?limit=15")])
      .then(([t, a]) => { setMembers(t.data.data); setLogs(a.data.data) })
      .catch(() => {})
  }, [reloadKey])

  const add = async () => {
    try {
      await API.post("/merchant/team", form)
      toast.success("Member added")
      setForm({ email: "", password: "", merchantRole: "developer" })
      load()
    } catch (e) { toast.error(e.response?.data?.message || "Could not add member") }
  }

  const remove = async (id) => {
    if (!window.confirm("Remove this member? They lose access immediately.")) return
    try { await API.delete(`/merchant/team/${id}`); load() }
    catch (e) { toast.error(e.response?.data?.message || "Could not remove member") }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold">Team</h2>

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2">{m.email}</td>
                <td>{m.merchantRole}</td>
                <td className="text-right">
                  {m.merchantRole !== "owner" && (
                    <button className="text-red-600 hover:underline" onClick={() => remove(m.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Add a member</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input className="p-2 border rounded" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="p-2 border rounded" type="password" placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="p-2 border rounded" value={form.merchantRole} onChange={(e) => setForm({ ...form, merchantRole: e.target.value })}>
            <option value="developer">Developer (API keys)</option>
            <option value="finance">Finance</option>
          </select>
          <Button onClick={add}>Add</Button>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Recent activity</h3>
        <ul className="text-sm space-y-1">
          {logs.length === 0 && <li className="text-gray-500">Nothing yet.</li>}
          {logs.map((l) => (
            <li key={l._id || l.id} className="flex justify-between">
              <span>{l.action} <span className="text-gray-500">by {l.actorEmail || l.actorType}</span></span>
              <span className="text-gray-500">{new Date(l.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
