import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import API from "../services/api"
import Button from "../components/ui/Button"

const empty = {
  businessName: "", businessType: "company", website: "", country: "IN",
  contactName: "", contactPhone: "", email: "", password: "",
  registrationNumber: "", taxId: "", address: ""
}

const field = "w-full p-3 border rounded"

export default function MerchantSignup() {
  const navigate = useNavigate()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async () => {
    setBusy(true)
    try {
      const body = {
        businessName: form.businessName, businessType: form.businessType, country: form.country,
        contactName: form.contactName, contactPhone: form.contactPhone,
        email: form.email, password: form.password,
        kyc: { registrationNumber: form.registrationNumber, address: form.address }
      }
      if (form.website) body.website = form.website
      if (form.taxId) body.kyc.taxId = form.taxId

      const res = await API.post("/merchant/signup", body)
      toast.success(res.data.message)
      navigate("/")
    } catch (error) {
      toast.error(error.response?.data?.message || "Sign-up failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-1">Become a merchant</h2>
        <p className="text-sm text-gray-500 mb-6">
          Sandbox access is instant. Live access starts once an admin approves your details (simulated KYC).
        </p>

        <h3 className="font-semibold mb-2">Business</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <input className={field} placeholder="Business name" value={form.businessName} onChange={set("businessName")} />
          <select className={field} value={form.businessType} onChange={set("businessType")}>
            <option value="sole_proprietor">Sole proprietor</option>
            <option value="company">Company</option>
            <option value="non_profit">Non-profit</option>
            <option value="other">Other</option>
          </select>
          <input className={field} placeholder="Website (optional)" value={form.website} onChange={set("website")} />
          <input className={field} placeholder="Country code (IN)" maxLength={2} value={form.country} onChange={set("country")} />
        </div>

        <h3 className="font-semibold mb-2">KYC details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <input className={field} placeholder="Registration number" value={form.registrationNumber} onChange={set("registrationNumber")} />
          <input className={field} placeholder="Tax ID (optional)" value={form.taxId} onChange={set("taxId")} />
          <input className={`${field} sm:col-span-2`} placeholder="Registered address" value={form.address} onChange={set("address")} />
        </div>

        <h3 className="font-semibold mb-2">Owner account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <input className={field} placeholder="Contact name" value={form.contactName} onChange={set("contactName")} />
          <input className={field} placeholder="Phone" value={form.contactPhone} onChange={set("contactPhone")} />
          <input className={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} />
          <input className={field} type="password" placeholder="Password (min 8 characters)" value={form.password} onChange={set("password")} />
        </div>

        <Button onClick={submit} disabled={busy} className="w-full bg-indigo-600 text-white p-2 rounded">
          {busy ? "Submitting..." : "Submit application"}
        </Button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Already registered? <Link to="/" className="text-indigo-600 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
