// Clock formatting helpers.
//
// Month/day order follows the active UI language through Intl. Weekday names
// are rendered through i18n so the label stays consistent with the rest of the
// UI.

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// Clock layout limits, shared by the overlay and the settings drawer so the
// controls and the clamping logic can never disagree.
//
// Widgets use one uniform position range on both axes so the same numbers mean
// the same thing everywhere: 0% sits on the anchor edge and 100% sits on the
// opposite edge, which keeps every widget inside the screen. The model view
// (positions on the Spine layer) uses its own -100..100 range and is unrelated.
export const CLOCK_OFFSET_MIN = 0
export const CLOCK_OFFSET_MAX = 100
export const CLOCK_SIZE_MIN = 40
export const CLOCK_SIZE_MAX = 200

// Range of the clock's audio-reactive intensity. 0% still follows the audio
// internally but shows nothing; 1000% is the strongest response the slider
// allows (ten times the built-in animation).
export const CLOCK_BEAT_INTENSITY_MIN = 0
export const CLOCK_BEAT_INTENSITY_MAX = 1000

export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()]
}

function localeFor(language) {
  if (language === 'zh') return 'zh-CN'
  if (language === 'ko') return 'ko-KR'
  if (language === 'ja') return 'ja-JP'
  return 'en-GB'
}

// 24-hour clock everywhere; it is the common choice for this small viewer and
// keeps the layout width stable across languages.
export function formatClockTime(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    const pad = (value) => String(value).padStart(2, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
}

// Returns the calendar date plus the weekday key so callers can render both.
//
// `absolute` is always a real date ("2026年11月12日"): a clock overlay is
// expected to show the date itself, so a relative word like "today" must never
// replace it.
export function formatClockDateParts(date, language) {
  const weekday = weekdayKey(date)

  try {
    const formatter = new Intl.DateTimeFormat(localeFor(language), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return { absolute: formatter.format(date), weekday }
  } catch {
    return { absolute: date.toDateString(), weekday }
  }
}

export function formatClockZone(date) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(date)
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

// Clamp a value into [min, max]; shared by the tilt maths below.
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Maps the pointer position to a 3D tilt for the clock card.
//
// The card behaves like a physical panel: pointing at its top-right corner
// lifts that corner toward the viewer while the bottom-left corner sinks away
// from the screen. That needs a positive rotateX (top edge toward the viewer)
// and a positive rotateY (right edge toward the viewer).
//
// Normalisation uses the *viewport* size, not the card size. Normalising by the
// card made the tilt hit its limit as soon as the pointer left the card and
// then jump instantly between extremes; mapping the whole viewport keeps the
// angle changing linearly and smoothly across the entire screen.
//
// `point` is the pointer in client coordinates. `bounds` is the viewport (or
// any region) whose centre the card should face flat. The result is normalised
// to [-1, 1] on both axes, where 0 means the pointer is level with the viewport
// centre, then scaled by `maxTilt` degrees.
export function computeClockTilt(point, bounds, { maxTilt = 14 } = {}) {
  if (!point || !bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
    return { rotateX: 0, rotateY: 0 }
  }

  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2

  // Positive when the pointer is above / right of the viewport centre.
  const horizontal = clamp((point.x - centerX) / (bounds.width / 2), -1, 1)
  const vertical = -clamp((point.y - centerY) / (bounds.height / 2), -1, 1)

  return {
    rotateX: vertical * maxTilt,
    rotateY: horizontal * maxTilt,
  }
}

// Eases a value toward a target by a frame-independent fraction, so the tilt
// follows the pointer instead of snapping. `deltaSeconds` is the time since the
// previous frame; `speed` is roughly "how quickly it catches up" per second.
export function smoothStep(current, target, deltaSeconds, speed = 8) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current
  // Higher speed => snappier. 1 - e^(-k*t) keeps the response smooth and
  // independent of frame rate.
  const alpha = 1 - Math.exp(-speed * deltaSeconds)
  const next = current + (target - current) * alpha
  // Snap once the remaining distance is imperceptible, so it settles steadily.
  return Math.abs(target - next) < 0.01 ? target : next
}
