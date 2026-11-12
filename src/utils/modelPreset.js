// Model presets.
//
// A preset is the complete set of look-and-feel choices for one model: the view
// (scale/position/background), the clock, the spectrum and the album card. The
// viewer applies a model's preset when it is selected, and the build step copies
// it into the generated manifest so a packaged wallpaper opens exactly as it was
// tuned in the browser.
//
// Two shapes are accepted for backwards compatibility:
//
//   flat (legacy)   { scale, positionX, positionY, backgroundColor }
//   nested          { view: {...}, clock: {...}, spectrum: {...}, albumArt: {...} }
//
// The flat shape is what model-presets.json has always stored; the nested shape
// adds the widget settings. `normalizePreset` folds both into one object so the
// rest of the app never has to care which one it got.

// Bounds shared with the drawer sliders. Kept here so the loader, the UI and the
// build-time validator all agree.
export const PRESET_LIMITS = {
  scale: { min: 0.5, max: 10 },
  positionX: { min: -300, max: 300 },
  positionY: { min: -300, max: 300 },
  clockSize: { min: 50, max: 200 },
  widgetOffset: { min: -100, max: 200 },
  spectrumScale: { min: 0.5, max: 5 },
  albumSize: { min: 10, max: 40 },
  beatIntensity: { min: 0, max: 1000 },
  parallaxAmount: { min: -15, max: 15 },
}

export const VIEW_KEYS = ['scale', 'positionX', 'positionY', 'backgroundColor']

export const CLOCK_DEFAULTS = {
  show: false,
  placement: 'minimal',
  offsetX: 10,
  offsetY: 50,
  size: 100,
  reactToBeat: false,
  beatIntensity: 100,
  use24Hour: true,
  theme: 'dark',
}

// The spectrum is a free-floating overlay: offsetX/offsetY place its centre in
// the same 0-100 viewport percentages the other widgets use (50 is the centre),
// and `scale` sizes the whole surface. The retired `position`/`height` fields
// are ignored on purpose, so an older preset falls back to these defaults.
export const SPECTRUM_DEFAULTS = {
  show: false,
  style: 'bars',
  offsetX: 50,
  offsetY: 50,
  scale: 1,
  color: '#a8c4ff',
}

export const ALBUM_DEFAULTS = {
  show: false,
  style: 'classic',
  corner: 'bottom-right',
  size: 18,
  offsetX: 0,
  offsetY: 0,
}

const CLOCK_PLACEMENTS = ['card', 'bar', 'minimal', 'cyberpunk', 'infobar', 'split', 'poster']
const SPECTRUM_STYLES = ['bars', 'mirror', 'curve', 'ring', 'ringwave', 'dots', 'ripples', 'aurora']
const ALBUM_STYLES = ['classic', 'glass', 'vinyl', 'minimal', 'bar', 'wall']
const ALBUM_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

function clampNumber(value, fallback, { min, max }) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function hexColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeView(value, fallback = { scale: 1, positionX: 0, positionY: 0, backgroundColor: '#000000' }) {
  const source = isPlainObject(value) ? value : {}
  return {
    scale: clampNumber(source.scale, fallback.scale, PRESET_LIMITS.scale),
    positionX: clampNumber(source.positionX, fallback.positionX, PRESET_LIMITS.positionX),
    positionY: clampNumber(source.positionY, fallback.positionY, PRESET_LIMITS.positionY),
    backgroundColor: hexColor(source.backgroundColor, fallback.backgroundColor),
    // Interaction settings live with the view because they are tuned per model
    // alongside the framing. They are optional so presets written before these
    // existed still load, and a missing key keeps whatever the app has.
    ...(typeof source.parallax === 'boolean' ? { parallax: source.parallax } : {}),
    ...(typeof source.parallaxAmount === 'number' && Number.isFinite(source.parallaxAmount)
      ? {
          parallaxAmount: clampNumber(
            source.parallaxAmount,
            fallback.parallaxAmount ?? 3,
            PRESET_LIMITS.parallaxAmount,
          ),
        }
      : {}),
    ...(typeof source.clickToAction === 'boolean'
      ? { clickToAction: source.clickToAction }
      : {}),
  }
}

export function normalizeClockPreset(value, fallback = CLOCK_DEFAULTS) {
  const source = isPlainObject(value) ? value : {}
  return {
    show: bool(source.show, fallback.show),
    placement: oneOf(source.placement, CLOCK_PLACEMENTS, fallback.placement),
    offsetX: clampNumber(source.offsetX, fallback.offsetX, PRESET_LIMITS.widgetOffset),
    offsetY: clampNumber(source.offsetY, fallback.offsetY, PRESET_LIMITS.widgetOffset),
    size: clampNumber(source.size, fallback.size, PRESET_LIMITS.clockSize),
    reactToBeat: bool(source.reactToBeat, fallback.reactToBeat),
    beatIntensity: clampNumber(
      source.beatIntensity,
      fallback.beatIntensity,
      PRESET_LIMITS.beatIntensity,
    ),
    use24Hour: bool(source.use24Hour, fallback.use24Hour),
    theme: source.theme === 'light' ? 'light' : source.theme === 'dark' ? 'dark' : fallback.theme,
  }
}

export function normalizeSpectrumPreset(value, fallback = SPECTRUM_DEFAULTS) {
  const source = isPlainObject(value) ? value : {}
  return {
    show: bool(source.show, fallback.show),
    style: oneOf(source.style, SPECTRUM_STYLES, fallback.style),
    offsetX: clampNumber(source.offsetX, fallback.offsetX, PRESET_LIMITS.widgetOffset),
    offsetY: clampNumber(source.offsetY, fallback.offsetY, PRESET_LIMITS.widgetOffset),
    scale: clampNumber(source.scale, fallback.scale, PRESET_LIMITS.spectrumScale),
    color: hexColor(source.color, fallback.color),
  }
}

export function normalizeAlbumPreset(value, fallback = ALBUM_DEFAULTS) {
  const source = isPlainObject(value) ? value : {}
  return {
    show: bool(source.show, fallback.show),
    style: oneOf(source.style, ALBUM_STYLES, fallback.style),
    corner: oneOf(source.corner, ALBUM_CORNERS, fallback.corner),
    size: clampNumber(source.size, fallback.size, PRESET_LIMITS.albumSize),
    offsetX: clampNumber(source.offsetX, fallback.offsetX, PRESET_LIMITS.widgetOffset),
    offsetY: clampNumber(source.offsetY, fallback.offsetY, PRESET_LIMITS.widgetOffset),
  }
}

// Fold either preset shape into one nested object. Missing sections stay missing
// (undefined) so the caller can tell "this model has no clock override" from
// "this model explicitly uses the default clock".
export function normalizePreset(value, fallback = {}) {
  const source = isPlainObject(value) ? value : {}
  // Legacy shape: the view keys sit at the top level.
  const hasFlatView = VIEW_KEYS.some((key) => key in source)
  const view = hasFlatView ? source : isPlainObject(source.view) ? source.view : null

  const preset = {}
  if (view) preset.view = normalizeView(view, fallback.view)
  if (isPlainObject(source.clock)) preset.clock = normalizeClockPreset(source.clock, fallback.clock)
  if (isPlainObject(source.spectrum)) {
    preset.spectrum = normalizeSpectrumPreset(source.spectrum, fallback.spectrum)
  }
  if (isPlainObject(source.albumArt)) {
    preset.albumArt = normalizeAlbumPreset(source.albumArt, fallback.albumArt)
  }
  // An empty object is not a preset; report null so callers can skip it.
  return Object.keys(preset).length > 0 ? preset : null
}

// Whether a preset came from the legacy flat shape, so the build step can keep
// writing it back in the same form the file already uses.
export function isLegacyPresetShape(value) {
  return isPlainObject(value) && VIEW_KEYS.some((key) => key in value)
}

// Snapshot of everything currently on screen, in the nested preset shape. Used
// by the drawer's "copy preset" button so the JSON it puts on the clipboard can
// be pasted straight into model-presets.json.
export function buildPresetForModel({ view, clock, spectrum, albumArt }) {
  return {
    view: normalizeView(view),
    clock: normalizeClockPreset(clock),
    spectrum: normalizeSpectrumPreset(spectrum),
    albumArt: normalizeAlbumPreset(albumArt),
  }
}
