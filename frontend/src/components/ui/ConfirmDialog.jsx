import Modal from "./Modal"
import { buttonClass } from "../../utils/format"

// A Yes / Cancel box shown before a change is applied.
//
//   <ConfirmDialog title="Disable user" onConfirm={apply} onCancel={close} busy={busy}>
//     Disable asha? She is signed out at once.
//   </ConfirmDialog>
export default function ConfirmDialog({ title, children, onConfirm, onCancel, busy = false, confirmLabel = "Yes", tone = "primary" }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className={buttonClass.ghost}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={buttonClass[tone]}>{confirmLabel}</button>
        </>
      }
    >
      <div className="text-sm text-gray-600">{children}</div>
    </Modal>
  )
}
