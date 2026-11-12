// Clipboard helper.
//
// The drawer has two "copy to clipboard" affordances (all recorded views, and
// the current model's full preset). Both need the same fallback: Wallpaper
// Engine's Chromium build does not always expose navigator.clipboard, and even
// where it does the write can be rejected without a user gesture. The fallback
// uses the legacy execCommand path, which works in both environments.

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  } catch {
    return false
  }
}
