import toast from "react-hot-toast"
import { Copy, TriangleAlert } from "lucide-react"
import Modal from "./ui/Modal"

// Shows a value the server returns only once: a temporary password or a new secret key.
//
// It cannot be closed with Escape, the X or a click outside. The only way out is the
// "I have saved it" button, which calls onDone; the page then drops the value from its state, so
// it is not kept anywhere in the browser. Never put the value in local storage, the URL or a log.
//
//   secret = { title, label, value, details: [["MID", "mid_..."]], note }
export default function SecretModal({ secret, onDone }) {
  if (!secret) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.value)
      toast.success("Copied")
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.")
    }
  }

  return (
    <Modal
      title={secret.title}
      dismissible={false}
      footer={
        <button type="button" onClick={onDone}
          className="bg-indigo-600 text-white hover:bg-indigo-700">
          I have saved it
        </button>
      }
    >
      <div className="flex gap-3 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
        <TriangleAlert size={18} className="shrink-0 mt-0.5" />
        <p>
          This {secret.label.toLowerCase()} is shown only once. We cannot show it again.
          {secret.note ? ` ${secret.note}` : ""}
        </p>
      </div>

      {secret.details?.length > 0 && (
        <dl className="grid grid-cols-3 gap-y-1 text-sm mb-4">
          {secret.details.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-gray-500">{name}</dt>
              <dd className="col-span-2 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-sm text-gray-500 mb-1">{secret.label}</p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 bg-gray-100 p-3 rounded-lg text-sm break-all select-all">{secret.value}</code>
        <button type="button" onClick={copy}
          className="flex items-center gap-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50">
          <Copy size={16} /> Copy
        </button>
      </div>
    </Modal>
  )
}
