// A labelled form control with an optional hint and validation message.
//
//   <Field label="Email" error={errors.email}><input ... /></Field>
export default function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="block mb-1.5 font-medium text-gray-700">{label}</span>
      {children}
      {error
        ? <span className="block mt-1 text-xs text-red-600">{error}</span>
        : hint && <span className="block mt-1 text-xs text-gray-500">{hint}</span>}
    </label>
  )
}
