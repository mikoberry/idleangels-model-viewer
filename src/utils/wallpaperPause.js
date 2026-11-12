// Wallpaper Engine pause state.
//
// The engine freezes the render process while the wallpaper is paused, but the
// page can still have its own requestAnimationFrame loops, intervals and audio
// processing running. Pausing those explicitly saves power on a desktop
// wallpaper, which runs for hours.
//
// The inline bridge in index.html cannot call into this module: it runs before
// the deferred module loads. It therefore records the flag on
// `window.__wePaused` and dispatches a `we-pause-change` event on window. This
// module only reads the flag and listens for that event.

const PAUSED_KEY = '__wePaused'
const EVENT_NAME = 'we-pause-change'

// True while the engine reports the wallpaper as paused. Outside the engine
// this is always false.
export function isWallpaperPaused() {
  if (typeof window === 'undefined') return false
  return window[PAUSED_KEY] === true
}

// Subscribe to pause/resume transitions. Returns an unsubscribe function.
// The listener receives the current state immediately, then every change.
export function onWallpaperPauseChange(listener) {
  if (typeof window === 'undefined') return () => {}

  const handle = (event) => {
    listener(event?.detail === true)
  }

  window.addEventListener(EVENT_NAME, handle)
  listener(isWallpaperPaused())

  return () => {
    window.removeEventListener(EVENT_NAME, handle)
  }
}

// Event name shared with the inline bridge.
export const PAUSE_EVENT_NAME = EVENT_NAME
