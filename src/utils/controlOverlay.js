// Translation layer between the app's stored widget preferences and WallKit's
// component props.
//
// The app keeps the preference shapes the drawer and `model-presets.json`
// already use, so existing `localStorage` entries and presets keep working.
// WallKit has its own, stricter contract (a named anchor point, `size` as a
// percentage of the widget's reference box or as a CSS length, `variant` /
// `colorHex` naming), so the conversion lives here rather than inside the
// components: the library must stay free of app-specific conventions.
//
// Placement is now shared vocabulary rather than a conversion: every widget
// stores an `anchor` out of WallKit's nine plus one offset per axis measured
// inward from it, which is exactly what the library takes. Only the two size
// systems and the clock's label bundle still need translating.
//
// Every function here is pure, so the mapping can be checked without a browser.

import { ANCHORS, normalizeAnchor } from 'wallkit/core'
import { SPECTRUM_SIZE_MAX, SPECTRUM_SIZE_MIN } from 'wallkit/components/spectrum'
import { CLOCK_OFFSET_MAX, CLOCK_OFFSET_MIN, formatClockDateParts } from './clock.js'

// WallKit formats through `Intl`, so it needs a BCP 47 tag rather than the
// app's short language id.
const CLOCK_LOCALES = { zh: 'zh-CN', en: 'en-GB', ja: 'ja-JP', ko: 'ko-KR' }

// A full-width spectrum band is a box override, not a separate widget: the
// library drops its reference box when `width` / `height` are given.
const BAND_WIDTH = '100vw'

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(Math.max(number, min), max)
}

/**
 * Anchor for any widget, with an explicit fallback rather than the library's
 * default: silently moving a widget to the bottom-left because a stored value
 * went bad is worse than keeping it where the caller last saw it.
 *
 * @param {string} value
 * @param {string} fallback  One of `ANCHORS`.
 * @returns {string}
 */
export function widgetAnchor(value, fallback) {
  if (ANCHORS.includes(value)) return value
  return ANCHORS.includes(fallback) ? fallback : normalizeAnchor(undefined)
}

/**
 * Offsets are shared by every widget: viewport percent, growing inward from the
 * anchor, and a number here so the drawer sliders and the library agree.
 *
 * @param {number} value
 * @param {number} fallback
 * @returns {number}
 */
function widgetOffset(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, CLOCK_OFFSET_MIN), CLOCK_OFFSET_MAX)
}

/**
 * Map the app's spectrum preferences onto `Spectrum` props.
 *
 * @param {Object} spectrum  Stored spectrum preference.
 * @returns {{ anchor: string, size: number, offsetX: number, offsetY: number,
 *   width?: string, height?: string }}
 */
export function spectrumOverlayProps({
  anchor,
  offsetX,
  offsetY,
  size,
  edgeToEdge,
  bandHeight,
}) {
  const props = {
    anchor: widgetAnchor(anchor, 'center'),
    size: clamp(size, SPECTRUM_SIZE_MIN, SPECTRUM_SIZE_MAX),
    offsetX: widgetOffset(offsetX, 0),
    offsetY: widgetOffset(offsetY, 0),
  }

  // Edge-to-edge mode: a band across the whole viewport whose height is the
  // stored vh value. `size` stays in the props — the library ignores it once the
  // box is explicit — so turning the mode off restores the normal box as-is.
  if (edgeToEdge) {
    props.width = BAND_WIDTH
    props.height = `${clamp(bandHeight, 6, 30)}vh`
  }

  return props
}

/**
 * Map the app's album-card preferences onto `AlbumArt` props.
 *
 * The stored `size` is the cover diameter in vh, and WallKit treats a string
 * `size` as that exact length, so the number can be passed as a unit and the
 * card's internal 18vh reference never has to be modelled here.
 *
 * @param {{ anchor: string, size: number, offsetX: number, offsetY: number }} albumArt
 * @returns {{ anchor: string, size: string, offsetX: number, offsetY: number }}
 */
export function albumArtOverlayProps({ anchor, size, offsetX, offsetY }) {
  return {
    anchor: widgetAnchor(anchor, 'bottom-right'),
    size: `${clamp(size, 10, 40)}vh`,
    offsetX: widgetOffset(offsetX, 0),
    offsetY: widgetOffset(offsetY, 0),
  }
}

/**
 * Build the `labels` object `Clock` expects from the app's translations.
 *
 * WallKit carries no language pack: the locale decides the `Intl` formatting and
 * every word arrives as a string, so the four app languages stay in `i18n.js`.
 *
 * @param {Date} now
 * @param {string} language  App language id (`zh` / `en` / `ja` / `ko`).
 * @param {(key: string, vars?: Object) => string} t
 */
export function clockLabels(now, language, t) {
  const parts = formatClockDateParts(now, language)
  const weekday = t(`weekday.${parts.weekday}`)

  return {
    locale: CLOCK_LOCALES[language] ?? 'en-GB',
    weekday,
    dateWithWeekday: t('clock.dateWithWeekday', { date: parts.absolute, weekday }),
    aria: t('clock.label'),
  }
}
