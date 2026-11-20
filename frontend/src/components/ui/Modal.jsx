import { useEffect, useId, useRef } from "react"
import { X } from "lucide-react"
import { isEnterInTextBox } from "../../utils/keys"

const WIDTHS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }

// A centred dialog. By default it closes with Escape, the X or a click outside. Pass
// dismissible={false} for dialogs that must be answered with one of their own buttons
// (see SecretModal): then none of those three work and no X is shown.
export default function Modal({ title, onClose, children, footer, size = "md", dismissible = true }) {
  const titleId = useId()
  const panel = useRef(null)
  const footerRef = useRef(null)

  // The latest onClose, so the effects below do not re-run (and move focus) on every render.
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  // Focus moves into the dialog when it opens and back to where it was when it closes.
  useEffect(() => {
    const previous = document.activeElement
    panel.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      if (dismissible) close.current?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [dismissible])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          // Enter in a text box presses the last footer button (Cancel comes first, the main action last).
          if (!isEnterInTextBox(e)) return
          const main = footerRef.current?.querySelector("button:last-of-type")
          if (!main) return
          e.preventDefault()
          if (!main.disabled) main.click()
        }}
        className={`bg-white rounded-2xl shadow-float ring-1 ring-gray-900/5 w-full ${WIDTHS[size] || WIDTHS.md} max-h-[90vh] flex flex-col focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h3>
          {dismissible && (
            <button type="button" aria-label="Close" onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="px-6 py-4 overflow-y-auto">{children}</div>

        {footer && <div ref={footerRef} className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/70 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}
