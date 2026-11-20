// Pressing Enter in a text box does what the form's main button does. Put the result on the
// element that wraps the boxes and the button: <div onKeyDown={submitOnEnter(save, busy)}>.
// Checkboxes, buttons and multi-line boxes keep their own Enter behaviour, and nothing happens
// while an IME is composing text or while the form is busy (so a double press cannot send twice).
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"])

export const isEnterInTextBox = (e) =>
  e.key === "Enter" && !e.nativeEvent?.isComposing && e.target.tagName === "INPUT" && !NOT_TEXT.has(e.target.type)

export const submitOnEnter = (submit, busy = false) => (e) => {
  if (!isEnterInTextBox(e)) return
  e.preventDefault()
  if (!busy) submit()
}
