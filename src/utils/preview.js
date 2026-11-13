// Widget preview outside Wallpaper Engine.
//
// The clock, spectrum and album card are built for the engine: they read system
// audio, the media session and the pause flag, none of which a normal browser
// has. Their settings, however, should be inspectable without packaging a
// wallpaper, so the browser can mount the same widgets on deterministic
// stand-ins (see `syntheticSpectrum` / `syntheticAudioLevel` in `audio.js`).
//
// The preview is opt-in per environment:
//
//   dev server (`npm run dev`)  always on. `import.meta.env.DEV` is false in
//                               `npm run build`, so nothing leaks into `dist/`
//                               and the packaged wallpaper stays engine-only.
//   `?widgets=1`                on as well, so a production build opened in a
//                               plain browser (`npm run preview`, or
//                               `dist/index.html`) still shows the widgets.
//
// A preview is never a substitute for the engine: there is no real music, the
// beat is synthetic, and the album card shows a made-up track.

const PREVIEW_PARAM = 'widgets'

// True when the browser should render the engine-only widgets.
export function isWidgetPreview() {
  if (import.meta.env?.DEV) return true
  try {
    return new URLSearchParams(window.location.search).get(PREVIEW_PARAM) === '1'
  } catch {
    return false
  }
}

// The album card renders nothing without a cover, so the preview needs one. An
// inline SVG keeps it a string in this file instead of an asset the build has
// to ship for a widget that never shows in the engine.
const PREVIEW_COVER = `data:image/svg+xml,${encodeURIComponent(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="#2b3550"/>',
    '<stop offset="1" stop-color="#a8c4ff"/>',
    '</linearGradient></defs>',
    '<rect width="120" height="120" fill="url(#g)"/>',
    '<circle cx="60" cy="60" r="33" fill="none" stroke="#0d1220"',
    ' stroke-opacity=".32" stroke-width="11"/>',
    '<circle cx="60" cy="60" r="5" fill="#0d1220" fill-opacity=".32"/>',
    '</svg>',
  ].join(''),
)}`

// A track shaped like the engine's `TrackInfo`, so the card needs no special
// case. `t` supplies the two text fields; everything else is static.
export function previewTrack(t) {
  return {
    thumbnail: PREVIEW_COVER,
    title: t('preview.trackTitle'),
    artist: t('preview.trackArtist'),
    albumTitle: '',
    primaryColor: '',
    textColor: '',
    playback: 'playing',
  }
}
