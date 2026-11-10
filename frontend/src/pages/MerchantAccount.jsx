import { useEffect, useState } from "react"
import API from "../services/api"
import Card from "../components/ui/Card"
import StatusBadge from "../components/merchant/StatusBadge"

const messages = {
  pending: "Your application is under review. You can build against the sandbox now; live mode unlocks after approval.",
  active: "Your account is approved. Sandbox and live modes are available.",
  suspended: "Your account is suspended. Live and sandbox API calls are blocked; contact support.",
  rejected: "Your application was rejected. See the note below."
}

const Row = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b last:border-0 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-right">{value || "-"}</span>
  </div>
)

export default function MerchantAccount() {
  const [me, setMe] = useState(null)

  useEffect(() => {
    API.get("/merchant/me").then((res) => setMe(res.data)).catch(() => {})
  }, [])

  if (!me) return <p className="text-gray-500">Loading...</p>
  const { merchant, teamRole, capabilities } = me

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-2xl font-bold">{merchant.businessName}</h2>

      <Card>
        <div className="flex items-center gap-3 mb-2">
          <StatusBadge value={merchant.status} />
          <span className="text-sm text-gray-500">Your role: {teamRole}</span>
        </div>
        <p className="text-sm text-gray-600">{messages[merchant.status]}</p>
        {(merchant.statusReason || merchant.kyc.reviewNote) && (
          <p className="text-sm mt-2"><b>Note:</b> {merchant.statusReason || merchant.kyc.reviewNote}</p>
        )}
        <div className="flex gap-2 mt-3">
          <span className="text-sm">Sandbox: {capabilities.sandbox ? "available" : "blocked"}</span>
          <span className="text-sm">Live: {capabilities.live ? "available" : "locked"}</span>
        </div>
      </Card>

      <Card>
        <Row label="Merchant ID (MID)" value={<code>{merchant.mid}</code>} />
        <Row label="Business type" value={merchant.businessType} />
        <Row label="Website" value={merchant.website} />
        <Row label="Country" value={merchant.country} />
        <Row label="Contact" value={`${merchant.contactName} (${merchant.contactEmail})`} />
        <Row label="Registration number" value={merchant.kyc.registrationNumber} />
        <Row label="KYC status" value={merchant.kyc.status} />
      </Card>
    </div>
  )
}
