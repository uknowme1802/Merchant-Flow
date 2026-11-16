import { useEffect, useRef, useState } from "react"
import { EllipsisVertical } from "lucide-react"
import { iconButtonClass } from "../../utils/format"

const MENU_WIDTH = 240
const ITEM_HEIGHT = 40
const TONES = {
  default: "text-gray-700 hover:bg-indigo-50 hover:text-indigo-600",
  warning: "text-orange-600 hover:bg-orange-50",
  danger: "text-red-600 hover:bg-red-50"
}

// The three-dot button at the end of a table row.
//
//   items = [{ label, icon: Icon, onClick, disabled, hint, tone }]   tone: "warning" | "danger"
//
// The menu is positioned against the window, not the row, so a scrolling table cannot clip it.
// It closes on a choice, a click outside, Escape, or when the page scrolls or resizes.
export default function RowMenu({ label = "Row actions", items }) {
  const [position, setPosition] = useState(null)
  const button = useRef(null)
  const menu = useRef(null)

  const toggle = () => {
    if (position) return setPosition(null)
    const rect = button.current.getBoundingClientRect()
    const height = items.length * ITEM_HEIGHT + 8
    const opensUp = rect.bottom + height > window.innerHeight && rect.top > height
    setPosition({
      top: opensUp ? rect.top - height - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH)
    })
  }

  useEffect(() => {
    if (!position) return
    const close = () => setPosition(null)
    const onDown = (e) => {
      if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) close()
    }
    const onKey = (e) => { if (e.key === "Escape") { close(); button.current?.focus() } }

    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [position])

  return (
    <>
      <button ref={button} type="button" className={iconButtonClass}
        aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(position)} onClick={toggle}>
        <EllipsisVertical size={18} />
      </button>

      {position && (
        <div ref={menu} role="menu" style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-40 p-1 bg-white rounded-xl shadow-float ring-1 ring-gray-900/5 text-left">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
              title={item.disabled ? item.hint : undefined}
              onClick={() => { setPosition(null); item.onClick() }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal ${TONES[item.tone] || TONES.default} disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed`}>
              {item.icon && <item.icon size={16} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
