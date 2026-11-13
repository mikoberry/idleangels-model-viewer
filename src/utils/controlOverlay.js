// Translation layer between the app's stored widget preferences and WallKit's
// component props.
//
// The app keeps the preference shapes the drawer and `model-presets.json`
// already use, so existing `localStorage` entries and presets keep working.
// WallKit has its own, stricter contract (bottom-left anchor, `size` as a
// percentage of the widget's reference box, `variant` / `colorHex` naming), so
// the conversion lives here rather than inside the components: the library must
// stay free of app-specific conventions.
//
// Every function here is pure, so the mapping can be checked without a browser.

import { ALBUM_ART_SIZE_MAX, ALBUM_ART_SIZE_MIN } from 'wallkit/components/album-art'
import { SPECTRUM_SIZE_MAX, SPECTRUM_SIZE_MIN } from 'wallkit/components/spectrum'
import { formatClockDateParts } from './clock.js'

// The spectrum's reference box in WallKit is 30% of the viewport width by 15%
// of its height at `size: 100`; the anchor is its bottom-left corner. The app
// still stores the box *centre* (50 = centred), which is what the drawer
// sliders and the saved presets mean by "position".
const SPECTRUM_BOX_WIDTH = 30
const SPECTRUM_BOX_HEIGHT = 15

// WallKit's album card is built around an 18vh cover at `size: 100`, while the
// app stores the cover height as a viewport percentage (10-40).
const ALBUM_COVER_BASE_VH = 18

// WallKit formats through `Intl`, so it needs a BCP 47 tag rather than the
// app's short language id.
const CLOCK_LOCALES = { zh: 'zh-CN', en: 'en-GB', ja: 'ja-JP', ko: 'ko-KR' }

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(Math.max(number, min), max)
}

/**
 * Map the app's spectrum preferences onto `Spectrum` props.
 *
 * @param {{ size: number, offsetX: number, offsetY: number }} spectrum
 * @returns {{ size: number, offsetX: number, offsetY: number }}
 */
export function spectrumOverlayProps({ size, offsetX, offsetY }) {
  const clampedSize = clamp(size, SPECTRUM_SIZE_MIN, SPECTRUM_SIZE_MAX)

  return {
    size: clampedSize,
    // Centre -> bottom-left anchor: subtract half of the rendered box.
    offsetX: Number(offsetX) - (SPECTRUM_BOX_WIDTH * clampedSize) / 200,
    offsetY: Number(offsetY) - (SPECTRUM_BOX_HEIGHT * clampedSize) / 200,
  }
}

/**
 * Map the app's album-card preferences onto `AlbumArt` props.
 *
 * @param {{ size: number, offsetX: number, offsetY: number }} albumArt
 * @returns {{ size: number, offsetX: number, offsetY: number }}
 */
export function albumArtOverlayProps({ size, offsetX, offsetY }) {
  return {
    size: clamp(
      (Number(size) * 100) / ALBUM_COVER_BASE_VH,
      ALBUM_ART_SIZE_MIN,
      ALBUM_ART_SIZE_MAX,
    ),
    offsetX: Number(offsetX),
    offsetY: Number(offsetY),
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
