// An on/off switch in the iOS style: a pill track with a round white thumb that slides.
// `label` is read by screen readers; `title` is the hover hint (use it to say why a disabled
// switch cannot be changed).
export default function Switch({ checked, onChange, disabled = false, label, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-0 align-middle
        transition-colors duration-200 ease-out
        focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200
        ${checked ? "bg-indigo-600" : "bg-gray-200"}
        disabled:opacity-45 disabled:cursor-not-allowed`}
    >
      <span
        className={`pointer-events-none inline-block h-[22px] w-[22px] rounded-full bg-white
          shadow-[0_2px_5px_rgba(15,23,42,0.25),0_0_0_0.5px_rgba(15,23,42,0.06)]
          transition-transform duration-200 ease-out
          ${checked ? "translate-x-[22px]" : "translate-x-[2px]"}`}
      />
    </button>
  )
}
