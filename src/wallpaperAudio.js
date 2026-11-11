// Wallpaper Engine audio bridge.
//
// Registration happens in an inline classic script in `index.html`, which runs
// during HTML parsing. Doing it here would be too late: Vite emits the app as a
// deferred module script, and the engine may have finished scanning for
// listeners by the time it runs.
//
// The inline handler writes two globals:
//
//   window.__weAudioFrame  Float32Array(128) or null
//   window.__weAudioAt     arrival timestamp (ms)
//
// This module only reads them, so it stays side-effect free.

const FRAME_KEY = '__weAudioFrame'
const AT_KEY = '__weAudioAt'

// A frame older than this counts as stale, so consumers settle instead of
// freezing on the last loud sample when playback stops.
const DEFAULT_STALE_MS = 1500

export function isWallpaperAudioAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof window.wallpaperRegisterAudioListener === 'function'
  )
}

// The most recent frame, or null when nothing usable has arrived or the last
// frame is older than `staleMs`.
export function getWallpaperAudioFrame(staleMs = DEFAULT_STALE_MS) {
  if (typeof window === 'undefined') return null

  const frame = window[FRAME_KEY]
  if (!frame || frame.length < 128) return null

  const stamped = window[AT_KEY]
  if (stamped && Date.now() - stamped > staleMs) return null

  return frame
}
