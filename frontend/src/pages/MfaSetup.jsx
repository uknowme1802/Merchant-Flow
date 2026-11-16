import { useContext, useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import axios from "axios"
import toast from "react-hot-toast"
import API from "../services/api"
import { AuthContext } from "../context/AuthContext"
import Button from "../components/ui/Button"
import { errorMessage } from "../utils/format"

// Shown right after login when an admin requires two-factor for this user and it is not set up
// yet. Every other screen sends the user back here until the setup is finished.
export default function MfaSetup() {
  const navigate = useNavigate()
  const { user, logout } = useContext(AuthContext)

  const [setup, setSetup] = useState(null) // { qrCode, secret }
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  const signedIn = Boolean(localStorage.getItem("token"))
  const home = user?.role === "merchant" ? "/merchant" : "/dashboard"

  useEffect(() => {
    if (!signedIn) return
    let ignore = false
    API.post("/2fa/setup")
      .then((res) => { if (!ignore) setSetup({ qrCode: res.data.qrCode, secret: res.data.secret }) })
      .catch((e) => {
        if (ignore) return
        // Already set up (for example in another tab): nothing left to do here.
        if (e.response?.status === 400) {
          localStorage.removeItem("mfaSetupRequired")
          navigate(home)
        } else {
          toast.error(errorMessage(e, "Could not start the setup"))
        }
      })
    return () => { ignore = true }
  }, [signedIn, home, navigate])

  if (!signedIn) return <Navigate to="/" />

  const confirm = async () => {
    if (code.length !== 6) return toast.error("Enter the 6-digit code from your authenticator app")

    setBusy(true)
    try {
      await API.post("/2fa/enable", { token: code })
      // The current token only allows the setup. A refreshed one is a normal session.
      const refreshed = await axios.post(`${import.meta.env.VITE_API_URL}/auth/refresh`, { token: localStorage.getItem("refreshToken") })
      localStorage.setItem("token", refreshed.data.accessToken)
      localStorage.removeItem("mfaSetupRequired")
      toast.success("Two-factor authentication is set up")
      navigate(home)
    } catch (e) {
      toast.error(errorMessage(e, "Invalid code"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
      <div className="bg-white p-10 rounded-xl shadow-xl w-96">
        <h2 className="text-2xl font-bold mb-2 text-center">Set up two-factor</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Your administrator requires two-factor authentication. Scan the QR code with an authenticator app, then enter the 6-digit code it shows.
        </p>

        {!setup ? <p className="text-sm text-gray-500 text-center mb-6">Loading…</p> : (
          <>
            <img src={setup.qrCode} alt="QR code for your authenticator app" className="mx-auto mb-4 w-48 h-48" />
            <p className="text-xs text-gray-500 mb-1 text-center">Cannot scan? Enter this key by hand:</p>
            <code className="block bg-gray-100 p-2 rounded text-xs text-center break-all select-all mb-6">{setup.secret}</code>
          </>
        )}

        <input className="w-full mb-4 p-3 border rounded text-center tracking-widest text-lg" placeholder="000000"
          inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") confirm() }} />

        <Button onClick={confirm} disabled={busy || !setup} className="w-full bg-indigo-600 text-white p-2 rounded">
          Confirm
        </Button>

        <p className="text-sm text-gray-500 mt-4 text-center">
          <button type="button" onClick={logout} className="p-0 text-indigo-600 hover:underline">Log out</button>
        </p>
      </div>
    </div>
  )
}
