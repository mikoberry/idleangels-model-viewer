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

// Ranges come from WallKit where the library exports them, so a slider bound and
// a preset bound can never drift apart. Only plain-JavaScript entry points are
// imported here: this module is also loaded by `scripts/prepare-models.mjs`
// under bare node, which cannot parse the components' JSX.
import {
  ANCHORS,
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
  SPECTRUM_CURVE_MAX,
  SPECTRUM_CURVE_MIN,
  SPECTRUM_INTENSITY_MAX,
  SPECTRUM_INTENSITY_MIN,
} from 'wallkit/core'
import {
  CLOCK_BEAT_CURVE_MAX,
  CLOCK_BEAT_CURVE_MIN,
  CLOCK_OFFSET_MAX,
  CLOCK_OFFSET_MIN,
} from './clock.js'

// Bounds shared with the drawer sliders. Kept here so the loader, the UI and the
// build-time validator all agree.
export const PRESET_LIMITS = {
  scale: { min: 0.5, max: 10 },
  positionX: { min: -300, max: 300 },
  positionY: { min: -300, max: 300 },
  clockSize: { min: CLOCK_SIZE_MIN, max: CLOCK_SIZE_MAX },
  // Offsets are measured inward from the widget's anchor, so a negative value
  // pushes it past the anchor and a large one crosses the viewport.
  widgetOffset: { min: CLOCK_OFFSET_MIN, max: CLOCK_OFFSET_MAX },
  // WallKit's spectrum size percentage: 100 is the widget's reference box
  // (30vw x 15vh), 500 fills a wide screen.
  spectrumSize: { min: 20, max: 500 },
  albumSize: { min: 10, max: 40 },
  beatIntensity: { min: CLOCK_BEAT_INTENSITY_MIN, max: CLOCK_BEAT_INTENSITY_MAX },
  beatCurve: { min: CLOCK_BEAT_CURVE_MIN, max: CLOCK_BEAT_CURVE_MAX },
  spectrumIntensity: { min: SPECTRUM_INTENSITY_MIN, max: SPECTRUM_INTENSITY_MAX },
  spectrumCurve: { min: SPECTRUM_CURVE_MIN, max: SPECTRUM_CURVE_MAX },
  spectrumBandHeight: { min: 6, max: 60 },
  parallaxAmount: { min: -15, max: 15 },
}

export const VIEW_KEYS = ['scale', 'positionX', 'positionY', 'backgroundColor']

// The widgets all share one placement contract: an anchor point out of
// WallKit's nine, plus an offset per axis measured inward from it in viewport
// percent. Each widget keeps its own numbers — the three are independent
// overlays, not one panel with three renderers.
export const CLOCK_DEFAULTS = {
  show: false,
  placement: 'minimal',
  anchor: 'bottom-left',
  offsetX: 10,
  offsetY: 50,
  size: 100,
  reactToBeat: false,
  beatIntensity: 100,
  beatCurve: 0.62,
  tilt: true,
  use24Hour: true,
  theme: 'dark',
}

// The spectrum floats around the middle of the screen by default, which is what
// the `center` anchor with zero offset means. `size` is WallKit's percentage of
// the widget reference box; `edgeToEdge` swaps that box for a full-width band
// whose height is `bandHeight` (vh).
export const SPECTRUM_DEFAULTS = {
  show: false,
  style: 'bars',
  anchor: 'center',
  offsetX: 0,
  offsetY: 0,
  size: 300,
  color: '#a8c4ff',
  intensity: 100,
  curve: 1,
  edgeToEdge: false,
  bandHeight: 15,
}

export const ALBUM_DEFAULTS = {
  show: false,
  style: 'classic',
  anchor: 'bottom-right',
  // Cover diameter in vh, which is exactly what WallKit's `size` string means,
  // so the stored number is also the rendered size.
  size: 18,
  offsetX: 0,
  offsetY: 0,
  theme: 'light',
  // The card's inline spectrum follows the spectrum overlay's colour unless the
  // user says otherwise; `color` is only used when `colorFollow` is false.
  colorFollow: true,
  color: '#a8c4ff',
}

const CLOCK_PLACEMENTS = [
  'card',
  'bar',
  'minimal',
  'cyberpunk',
  'infobar',
  'split',
  'poster',
  'ring',
  'segments',
  'stamp',
]
const SPECTRUM_STYLES = [
  'bars',
  'mirror',
  'curve',
  'pill',
  'ring',
  'ringwave',
  'dots',
  'ripples',
  'aurora',
]
const ALBUM_STYLES = ['classic', 'glass', 'vinyl', 'minimal', 'bar', 'wall']
const ALBUM_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

// Pre-anchor preferences stored the spectrum's box *centre* in 0-100 viewport
// percent, and the album card's corner in a `corner` field. Both are read once
// and converted here so old presets and old localStorage entries keep their
// position; neither old field is written back.
const LEGACY_CENTRE = 50

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

// Read an anchor from a widget's settings, accepting the album card's retired
// `corner` field as an alias. Falls back to the caller's current anchor.
function anchorOf(source, fallback) {
  if (ANCHORS.includes(source.anchor)) return source.anchor
  if (ALBUM_CORNERS.includes(source.corner)) return source.corner
  return fallback
}

// Offset for one axis. A legacy source (no anchor at all) measured the box
// centre, so the stored number becomes the signed displacement a `center`
// anchor expects.
function offsetOf(source, key, fallback, legacyShift) {
  if (source[key] === undefined) return fallback
  const value = Number(source[key])
  if (!Number.isFinite(value)) return fallback
  return clampNumber(value + legacyShift, fallback, PRESET_LIMITS.widgetOffset)
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
    // The clock always measured its offsets from the bottom-left corner, which
    // is still its default anchor, so an old preset needs no conversion.
    anchor: anchorOf(source, fallback.anchor ?? CLOCK_DEFAULTS.anchor),
    offsetX: offsetOf(source, 'offsetX', fallback.offsetX, 0),
    offsetY: offsetOf(source, 'offsetY', fallback.offsetY, 0),
    size: clampNumber(source.size, fallback.size, PRESET_LIMITS.clockSize),
    reactToBeat: bool(source.reactToBeat, fallback.reactToBeat),
    beatIntensity: clampNumber(
      source.beatIntensity,
      fallback.beatIntensity,
      PRESET_LIMITS.beatIntensity,
    ),
    beatCurve: clampNumber(source.beatCurve, fallback.beatCurve, PRESET_LIMITS.beatCurve),
    tilt: bool(source.tilt, fallback.tilt),
    use24Hour: bool(source.use24Hour, fallback.use24Hour),
    theme: source.theme === 'light' ? 'light' : source.theme === 'dark' ? 'dark' : fallback.theme,
  }
}

export function normalizeSpectrumPreset(value, fallback = SPECTRUM_DEFAULTS) {
  const source = isPlainObject(value) ? value : {}
  const hasAnchor = ANCHORS.includes(source.anchor)
  const legacy = !hasAnchor && (source.offsetX !== undefined || source.offsetY !== undefined)
  return {
    show: bool(source.show, fallback.show),
    style: oneOf(source.style, SPECTRUM_STYLES, fallback.style),
    anchor: hasAnchor ? source.anchor : legacy ? 'center' : (fallback.anchor ?? 'center'),
    offsetX: offsetOf(source, 'offsetX', fallback.offsetX, legacy ? -LEGACY_CENTRE : 0),
    offsetY: offsetOf(source, 'offsetY', fallback.offsetY, legacy ? -LEGACY_CENTRE : 0),
    // `scale` predates WallKit: 1 was a 90vw-wide surface, which is `size: 300`.
    size: clampNumber(
      source.size ?? Number(source.scale) * 300,
      fallback.size,
      PRESET_LIMITS.spectrumSize,
    ),
    color: hexColor(source.color, fallback.color),
    intensity: clampNumber(
      source.intensity,
      fallback.intensity,
      PRESET_LIMITS.spectrumIntensity,
    ),
    curve: clampNumber(source.curve, fallback.curve, PRESET_LIMITS.spectrumCurve),
    edgeToEdge: bool(source.edgeToEdge, fallback.edgeToEdge),
    bandHeight: clampNumber(
      source.bandHeight,
      fallback.bandHeight,
      PRESET_LIMITS.spectrumBandHeight,
    ),
  }
}

export function normalizeAlbumPreset(value, fallback = ALBUM_DEFAULTS) {
  const source = isPlainObject(value) ? value : {}
  return {
    show: bool(source.show, fallback.show),
    style: oneOf(source.style, ALBUM_STYLES, fallback.style),
    // `corner` and WallKit's `anchor` name the same point and both measure the
    // offsets inward from it, so old presets need no conversion beyond the key
    // rename.
    anchor: anchorOf(source, fallback.anchor ?? ALBUM_DEFAULTS.anchor),
    size: clampNumber(source.size, fallback.size, PRESET_LIMITS.albumSize),
    offsetX: offsetOf(source, 'offsetX', fallback.offsetX, 0),
    offsetY: offsetOf(source, 'offsetY', fallback.offsetY, 0),
    theme: source.theme === 'dark' ? 'dark' : source.theme === 'light' ? 'light' : fallback.theme,
    colorFollow: bool(source.colorFollow, fallback.colorFollow),
    color: hexColor(source.color, fallback.color),
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
