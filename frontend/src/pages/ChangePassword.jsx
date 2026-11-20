import { useContext, useState } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import { Eye, EyeClosed } from "lucide-react"
import API from "../services/api"
import { AuthContext } from "../context/AuthContext"
import Button from "../components/ui/Button"
import { errorMessage } from "../utils/format"
import { submitOnEnter } from "../utils/keys"

// Change your own password. After an admin issues a temporary password this page is forced:
// every other screen sends the user back here until a new password is chosen.
export default function ChangePassword() {
  const navigate = useNavigate()
  const { user, logout } = useContext(AuthContext)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!localStorage.getItem("token")) return <Navigate to="/" />

  const forced = localStorage.getItem("mustChangePassword") === "1"
  const home = user?.role === "merchant" ? "/merchant" : "/dashboard"

  const submit = async () => {
    if (!currentPassword || !newPassword) return toast.error("Enter your current and new password")
    if (newPassword.length < 8) return toast.error("The new password needs at least 8 characters")
    if (newPassword !== repeat) return toast.error("The two new passwords do not match")
    if (newPassword === currentPassword) return toast.error("Choose a different password")

    setBusy(true)
    try {
      const res = await API.post("/auth/change-password", { currentPassword, newPassword })
      // Every other session is signed out; this one continues with fresh tokens.
      localStorage.setItem("token", res.data.accessToken)
      localStorage.setItem("refreshToken", res.data.refreshToken)
      localStorage.removeItem("mustChangePassword")
      toast.success("Password changed")
      if (res.data.mfaSetupRequired) {
        localStorage.setItem("mfaSetupRequired", "1")
        return navigate("/mfa-setup")
      }
      navigate(home)
    } catch (e) {
      toast.error(errorMessage(e, "Could not change the password"))
    } finally {
      setBusy(false)
    }
  }

  const type = show ? "text" : "password"

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-r from-indigo-500 to-purple-600">
      <div className="bg-white p-10 rounded-xl shadow-xl w-96" onKeyDown={submitOnEnter(submit, busy)}>
        <h2 className="text-2xl font-bold mb-2 text-center">Change password</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          {forced
            ? "You signed in with a temporary password. Choose your own to continue."
            : "You are signed out on your other devices after the change."}
        </p>

        <input className="w-full mb-4 p-3 border rounded" type={type} autoComplete="current-password"
          placeholder={forced ? "Temporary password" : "Current password"}
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />

        <div className="relative w-full mb-4">
          <input className="w-full p-3 border rounded" type={type} autoComplete="new-password"
            placeholder="New password (at least 8 characters)"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <span onClick={() => setShow(!show)} className="absolute right-3 top-3 cursor-pointer text-gray-500"
            role="button" aria-label={show ? "Hide passwords" : "Show passwords"}>
            {show ? <EyeClosed size={18} /> : <Eye size={18} />}
          </span>
        </div>

        <input className="w-full mb-6 p-3 border rounded" type={type} autoComplete="new-password"
          placeholder="Repeat the new password"
          value={repeat} onChange={(e) => setRepeat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit() }} />

        <Button onClick={submit} disabled={busy} className="w-full bg-indigo-600 text-white p-2 rounded">
          Change password
        </Button>

        <p className="text-sm text-gray-500 mt-4 text-center">
          {forced
            ? <button type="button" onClick={logout} className="p-0 text-indigo-600 hover:underline">Log out</button>
            : <Link to={home} className="text-indigo-600 hover:underline">Cancel</Link>}
        </p>
      </div>
    </div>
  )
}
