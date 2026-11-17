import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import toast from "react-hot-toast"
import { CheckCircle2, CircleX, Clock, Copy, ShieldCheck, Smartphone } from "lucide-react"
import publicApi from "../services/publicApi"
import { rupees, formatIST, inputClass, buttonClass, errorMessage } from "../utils/format"

// The customer's checkout page, opened from the link a merchant's order returns (/pay/<orderId>).
// No login. The customer pays by UPI, then types the 12-digit UTR from their payment app.

const pad = (n) => String(n).padStart(2, "0")
const clock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function Shell({ order, children }) {
  const sandbox = order?.mode === "sandbox"
  return (
    <div className="min-h-screen px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-gray-400">Paying</p>
            <p className="font-semibold text-gray-900 truncate">{order?.merchantName || "Merchant"}</p>
          </div>
          {order && (
            <span className={`shrink-0 px-3 py-1 text-xs font-medium rounded-full ${sandbox ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-700"}`}>
              {sandbox ? "Sandbox" : "Production"}
            </span>
          )}
        </div>

        {sandbox && (
          <p className="mb-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-800 text-xs px-3 py-2">
            This is a test payment. No real money moves.
          </p>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-card ring-1 ring-gray-900/5">{children}</div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck size={14} /> Payments are confirmed with your UTR
        </p>
      </div>
    </div>
  )
}

function Message({ icon, tone, title, children }) {
  const colour = { green: "text-green-600 bg-green-50", red: "text-red-600 bg-red-50", gray: "text-gray-500 bg-gray-100" }[tone]
  return (
    <div className="text-center py-4">
      <span className={`inline-flex p-3 rounded-full ${colour}`}>{icon}</span>
      <h1 className="mt-4 text-lg font-semibold text-gray-900">{title}</h1>
      <div className="mt-1 text-sm text-gray-500 space-y-1">{children}</div>
    </div>
  )
}

function Amount({ order }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold tracking-tight text-gray-900">{rupees(order.amountPaise)}</p>
      {order.description && <p className="mt-1 text-sm text-gray-500">{order.description}</p>}
    </div>
  )
}

export default function PayPage() {
  const { orderId } = useParams()

  // phase: loading | ready | notfound | error. The order is kept across refreshes.
  const [view, setView] = useState({ phase: "loading", order: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const [utr, setUtr] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [problem, setProblem] = useState("")

  const order = view.order
  const status = order?.status
  const expiresAt = order ? Date.parse(order.expiresAt) : 0
  const lastExpiryCheck = useRef(0)

  // Load the order. A promise chain keeps setState out of the effect's synchronous path.
  useEffect(() => {
    let cancelled = false
    publicApi.get(`/pay/${orderId}`)
      .then((res) => { if (!cancelled) setView({ phase: "ready", order: res.data.order }) })
      .catch((err) => {
        if (cancelled) return
        const missing = err.response?.status === 404
        setView((prev) => (prev.order && !missing ? prev : { phase: missing ? "notfound" : "error", order: null }))
      })
    return () => { cancelled = true }
  }, [orderId, reloadKey])

  // Tick the countdown while the order can still be paid. When time runs out, ask the server: it
  // answers with the order as failed. If this device's clock runs ahead and the server still says
  // pending, ask again, but no more than once every 5 seconds.
  useEffect(() => {
    if (status !== "pending") return undefined
    lastExpiryCheck.current = 0
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= expiresAt && t - lastExpiryCheck.current >= 5000) {
        lastExpiryCheck.current = t
        setReloadKey((k) => k + 1)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [status, expiresAt])

  const onUtrChange = (e) => {
    setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))
    setProblem("")
  }

  const submit = async (e) => {
    e.preventDefault()
    if (utr.length !== 12 || submitting) return
    setSubmitting(true)
    setProblem("")
    try {
      const res = await publicApi.post(`/pay/${orderId}/claim`, { utr })
      setView({ phase: "ready", order: res.data.order })
    } catch (err) {
      const code = err.response?.data?.code
      if (code === "ORDER_NOT_PENDING") {
        // Expired or already paid: show the real state instead of an error.
        setReloadKey((k) => k + 1)
      } else {
        setProblem(errorMessage(err, "Something went wrong. Please try again."))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error("Could not copy. Please select and copy it by hand.")
    }
  }

  if (view.phase === "loading") {
    return (
      <Shell>
        <div className="animate-pulse space-y-4 py-2">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto" />
          <div className="h-40 bg-gray-100 rounded-xl" />
          <div className="h-10 bg-gray-100 rounded-xl" />
        </div>
      </Shell>
    )
  }

  if (view.phase === "notfound") {
    return (
      <Shell>
        <Message icon={<CircleX size={28} />} tone="gray" title="Payment link not found">
          <p>This link is wrong or no longer exists.</p>
          <p>Please go back to the shop and start the payment again.</p>
        </Message>
      </Shell>
    )
  }

  if (view.phase === "error") {
    return (
      <Shell>
        <Message icon={<CircleX size={28} />} tone="gray" title="We could not load this payment">
          <p>Please check your connection and try again.</p>
        </Message>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={`mt-4 w-full ${buttonClass.primary}`}>
          Try again
        </button>
      </Shell>
    )
  }

  if (status === "success") {
    return (
      <Shell order={order}>
        <Message icon={<CheckCircle2 size={28} />} tone="green" title="Payment received">
          <p className="text-2xl font-bold text-gray-900">{rupees(order.amountPaise)}</p>
          <p>Paid to {order.merchantName}</p>
          {order.paidAt && <p className="text-xs">{formatIST(order.paidAt)}</p>}
          <p className="pt-2 text-xs">You can close this page.</p>
        </Message>
      </Shell>
    )
  }

  if (status !== "pending") {
    return (
      <Shell order={order}>
        <Message icon={<CircleX size={28} />} tone="red" title="This payment has expired">
          <p>The time to pay this order has run out.</p>
          <p>If you already paid, keep your payment receipt and contact {order.merchantName}.</p>
          <p>Otherwise, go back to the shop and start a new payment.</p>
        </Message>
      </Shell>
    )
  }

  const msLeft = expiresAt - now
  const pay = order.payment
  return (
    <Shell order={order}>
      <Amount order={order} />

      <p className={`mt-3 flex items-center justify-center gap-1.5 text-sm ${msLeft < 120000 ? "text-red-600" : "text-gray-500"}`}>
        <Clock size={14} /> Pay within <span className="font-mono font-semibold tabular-nums">{clock(msLeft)}</span>
      </p>

      {pay ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-700 mb-3">1. Pay with any UPI app</p>
          {pay.qrDataUrl && (
            <div className="flex justify-center">
              <img src={pay.qrDataUrl} alt={`UPI QR code to pay ${rupees(order.amountPaise)}`} width={200} height={200} className="rounded-xl ring-1 ring-gray-200" />
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">UPI ID · {pay.holderName}</p>
              <p className="font-mono text-sm text-gray-900 truncate">{pay.upiId}</p>
            </div>
            <button type="button" onClick={() => copy(pay.upiId, "UPI ID")} aria-label="Copy UPI ID"
              className="shrink-0 p-2 rounded-lg text-gray-500 hover:bg-white hover:text-indigo-600">
              <Copy size={16} />
            </button>
          </div>
          <a href={pay.upiUri} className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm ${buttonClass.outline}`}>
            <Smartphone size={16} /> Open my UPI app
          </a>
          <p className="mt-2 text-xs text-gray-400 text-center">Pay exactly {rupees(order.amountPaise)}. A different amount cannot be matched.</p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500 text-center">Payment details are not available. Please start a new payment.</p>
      )}

      <form onSubmit={submit} className="mt-6 pt-6 border-t border-gray-100" noValidate>
        <label htmlFor="utr" className="block text-sm font-medium text-gray-700">2. Enter the 12-digit UTR</label>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">After paying, find it in your payment app as UTR or reference number.</p>
        <input
          id="utr"
          value={utr}
          onChange={onUtrChange}
          inputMode="numeric"
          autoComplete="off"
          placeholder="412345678901"
          aria-invalid={!!problem}
          aria-describedby={problem ? "utr-problem" : undefined}
          className={`${inputClass} font-mono tracking-wider text-center text-base`}
        />
        <div aria-live="polite">
          {problem && <p id="utr-problem" className="mt-2 text-sm text-red-600">{problem}</p>}
        </div>
        <button type="submit" disabled={utr.length !== 12 || submitting} className={`mt-3 w-full ${buttonClass.primary}`}>
          {submitting ? "Checking…" : "Confirm payment"}
        </button>
      </form>
    </Shell>
  )
}
