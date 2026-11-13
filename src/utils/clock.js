// Clock data helpers.
//
// The clock is drawn by WallKit, which formats time itself from the `labels`
// bundle this module builds. What is left here is the date/weekday text and the
// frame-independent easing used by the parallax loop — plus the numeric ranges
// the drawer, the loader and the preset validator share.

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// Clock layout limits, shared by the overlay and the settings drawer so the
// controls and the clamping logic can never disagree.
//
// Widgets use one uniform position range on both axes so the same numbers mean
// the same thing everywhere: the offset is measured inward from the widget's
// anchor, 0% sits on the anchor point and 100% reaches the opposite edge. The
// range is deliberately wider than 0-100 because a negative offset is how a
// widget is pushed past its anchor (a deliberate bleed off-screen), and values
// above 100 are legal on a centred axis. The model view (positions on the Spine
// layer) uses its own -100..100 range and is unrelated.
export const CLOCK_OFFSET_MIN = -50
export const CLOCK_OFFSET_MAX = 150
export const CLOCK_SIZE_MIN = 40
export const CLOCK_SIZE_MAX = 200

// Range of the clock's audio-reactive intensity. 0% still follows the audio
// internally but shows nothing; 1000% is the strongest response the slider
// allows (ten times the built-in animation).
export const CLOCK_BEAT_INTENSITY_MIN = 0
export const CLOCK_BEAT_INTENSITY_MAX = 1000

// Shape of the clock's beat response, as a curve exponent. Below 1 the pulse
// swells early and reads as a soft breath; above 1 it stays flat until a real
// hit lands. WallKit clamps to the same bounds but does not export them, so they
// are mirrored here for the slider. 0.62 is the library default.
export const CLOCK_BEAT_CURVE_MIN = 0.2
export const CLOCK_BEAT_CURVE_MAX = 2
export const CLOCK_BEAT_CURVE_DEFAULT = 0.62

export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()]
}

function localeFor(language) {
  if (language === 'zh') return 'zh-CN'
  if (language === 'ko') return 'ko-KR'
  if (language === 'ja') return 'ja-JP'
  return 'en-GB'
}

// Returns the calendar date plus the weekday key so callers can render both.
// Also provides decomposed parts (year, month, day) for calendar styles.
export function formatClockDateParts(date, language) {
  const weekday = weekdayKey(date)
  const year = date.getFullYear()
  const monthNum = date.getMonth() + 1
  const day = date.getDate()

  try {
    const formatter = new Intl.DateTimeFormat(localeFor(language), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const monthFormatter = new Intl.DateTimeFormat(localeFor(language), {
      month: 'short',
    })
    return {
      absolute: formatter.format(date),
      weekday,
      year,
      month: monthFormatter.format(date),
      monthNum,
      day,
    }
  } catch {
    return {
      absolute: date.toDateString(),
      weekday,
      year,
      month: String(monthNum),
      monthNum,
      day,
    }
  }
}

// Eases a value toward a target by a frame-independent fraction, so a follow
// animation trails its target instead of snapping (used by the parallax offset).
// `deltaSeconds` is the time since the previous frame; `speed` is roughly "how
// quickly it catches up" per second.
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
