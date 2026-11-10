import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Copy } from "lucide-react"
import API from "../services/api"
import Card from "../components/ui/Card"
import Button from "../components/ui/Button"
import StatusBadge from "../components/merchant/StatusBadge"

const when = (value) => (value ? new Date(value).toLocaleString() : "-")

export default function MerchantCredentials() {
  const [keys, setKeys] = useState([])
  const [me, setMe] = useState(null)
  const [fresh, setFresh] = useState(null) // { mid, secret, environment } shown once
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [k, m] = await Promise.all([API.get("/merchant/credentials"), API.get("/merchant/me")])
      setKeys(k.data.data)
      setMe(m.data)
    } catch { /* interceptor shows the error */ }
  }

  useEffect(() => { load() }, [])

  const run = async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(e.response?.data?.message || "Request failed") }
    finally { setBusy(false) }
  }

  const create = (environment) => run(async () => {
    const res = await API.post("/merchant/credentials", { environment })
    setFresh({ mid: res.data.mid, secret: res.data.secret, environment })
    await load()
  })

  const rotate = (environment) => {
    if (!window.confirm(`Rotate the ${environment} key? The old key keeps working for a short grace period.`)) return
    run(async () => {
      const res = await API.post(`/merchant/credentials/${environment}/rotate`)
      setFresh({ mid: res.data.mid, secret: res.data.secret, environment })
      await load()
    })
  }

  const revoke = (id) => {
    if (!window.confirm("Revoke this key now? Requests using it will fail immediately.")) return
    run(async () => {
      await API.delete(`/merchant/credentials/${id}`)
      toast.success("Key revoked")
      await load()
    })
  }

  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))
  const canManage = me && ["owner", "developer"].includes(me.teamRole)
  const hasActive = (env) => keys.some((k) => k.environment === env && k.status === "active")

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold">API credentials</h2>

      {fresh && (
        <Card>
          <p className="font-semibold text-amber-700 mb-2">
            Copy your {fresh.environment} secret now. It will not be shown again.
          </p>
          <div className="space-y-2 text-sm">
            <div>MID: <code>{fresh.mid}</code></div>
            <div className="flex items-center gap-2">
              <code className="bg-gray-100 p-2 rounded break-all">{fresh.secret}</code>
              <button onClick={() => copy(fresh.secret)} aria-label="Copy secret"><Copy size={16} /></button>
            </div>
          </div>
          <Button onClick={() => setFresh(null)} className="mt-3 bg-gray-800 text-white px-3 py-1 rounded">
            I have saved it
          </Button>
        </Card>
      )}

      {canManage && (
        <div className="flex gap-3">
          {["sandbox", "live"].map((env) => (
            <Button key={env} disabled={busy || hasActive(env) || (env === "live" && !me.capabilities.live)}
              onClick={() => create(env)}>
              Create {env} key
            </Button>
          ))}
        </div>
      )}
      {me && !me.capabilities.live && (
        <p className="text-sm text-gray-500">Live keys unlock after your account is approved.</p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Environment</th><th>Key</th><th>Status</th><th>Expires</th><th>Last used</th><th></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={6} className="py-4 text-gray-500">No keys yet.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-b last:border-0">
                <td className="py-2"><StatusBadge value={k.environment} /></td>
                <td><code>{k.keyHint}</code></td>
                <td><StatusBadge value={k.status} /></td>
                <td>{when(k.expiresAt)}</td>
                <td>{when(k.lastUsedAt)}</td>
                <td className="text-right space-x-3">
                  {canManage && k.status === "active" && (
                    <button className="text-indigo-600 hover:underline" disabled={busy} onClick={() => rotate(k.environment)}>Rotate</button>
                  )}
                  {canManage && ["active", "retiring"].includes(k.status) && (
                    <button className="text-red-600 hover:underline" disabled={busy} onClick={() => revoke(k.id)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Signing your requests</h3>
        <p className="text-sm text-gray-600 mb-2">
          Send <code>X-MID</code>, <code>X-Timestamp</code> (unix seconds) and <code>X-Signature</code>, where the signature is
          the hex HMAC-SHA256 with your secret of:
        </p>
        <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">{`timestamp + "\\n" + METHOD + "\\n" + pathWithQuery + "\\n" + sha256hex(rawBody)`}</pre>
        <p className="text-sm text-gray-600 mt-2">Test it with <code>GET /v1/whoami</code>.</p>
      </Card>
    </div>
  )
}
