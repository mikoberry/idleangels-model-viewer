import { useEffect, useRef, useState } from 'react'
import {
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  computeClockTilt,
  formatClockDateParts,
  formatClockTime,
  formatClockZone,
  smoothStep,
} from '../utils/clock.js'
import { smoothAudioLevel, summarizeWallpaperAudio, syntheticAudioLevel } from '../utils/audio.js'
import { getWallpaperAudioFrame, isWallpaperAudioAvailable } from '../utils/wallpaperAudio.js'
import { onWallpaperPauseChange } from '../utils/wallpaperPause.js'

// Idle tilt eases back to flat when the pointer leaves the window.
const FLAT = { rotateX: 0, rotateY: 0 }

// Maximum scale added by a full-strength beat, before the user's intensity
// setting scales it down or up. Small on purpose: the clock should breathe with
// the music, not bounce.
const BEAT_SCALE = 0.12
// Extra glow spread at full beat.
const BEAT_GLOW = 0.55

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function viewportBounds() {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

// Wallpaper Engine reports real system audio; anywhere else the synthetic
// curve stands in, because browsers cannot tap system output.
//
// Once the engine is detected it must never fall back to synthetic data: a
// missing frame means "no audio right now", so the beat level should settle to
// zero rather than keep bouncing on a fake tempo.
const SILENT_TARGET = { bass: 0, left: 0, right: 0 }

function readAudioTarget(timeSeconds) {
  if (isWallpaperAudioAvailable()) {
    const frame = getWallpaperAudioFrame()
    if (!frame) return SILENT_TARGET
    return summarizeWallpaperAudio(frame) ?? SILENT_TARGET
  }
  return syntheticAudioLevel(timeSeconds)
}

export default function Clock({
  placement,
  language,
  visible,
  offsetX = 0,
  offsetY = 0,
  size = 100,
  reactToBeat = false,
  beatIntensity = 100,
  t,
}) {
  const [now, setNow] = useState(() => new Date())
  const [tilt, setTilt] = useState(FLAT)
  const [beat, setBeat] = useState(0)

  // The rendered tilt is driven by a rAF loop that eases `current` toward the
  // pointer-derived `target`. A CSS transition alone stutters while the target
  // keeps changing, because every new value restarts the transition.
  const targetRef = useRef(FLAT)
  const currentRef = useRef(FLAT)
  const beatRef = useRef(0)
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const reactToBeatRef = useRef(reactToBeat)

  useEffect(() => {
    reactToBeatRef.current = reactToBeat
  }, [reactToBeat])

  useEffect(() => {
    if (!visible) return undefined

    const update = () => setNow(new Date())
    update()

    const interval = window.setInterval(update, 1000)

    // Repaint immediately when the wallpaper is unpaused or the tab becomes
    // visible again, instead of waiting for the next interval tick. The pause
    // state comes from the shared bridge, not from reassigning the engine's
    // callback (which would replace the one registered at startup).
    const onVisibilityChange = () => {
      if (!document.hidden) update()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    const unsubscribe = onWallpaperPauseChange((paused) => {
      if (!paused) update()
    })

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribe()
    }
  }, [visible])

  // Pointer tracking drives the tilt target. It listens on window because the
  // canvas owns the pointer events.
  useEffect(() => {
    if (!visible) return undefined

    const reduced = prefersReducedMotion()

    const handlePointerMove = (event) => {
      if (reduced) return
      targetRef.current = computeClockTilt(
        { x: event.clientX, y: event.clientY },
        viewportBounds(),
      )
    }

    const handleLeave = () => {
      targetRef.current = FLAT
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handleLeave)
    document.addEventListener('pointerleave', handleLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handleLeave)
      document.removeEventListener('pointerleave', handleLeave)
    }
  }, [visible])

  // Ease the rendered tilt toward the target every frame.
  useEffect(() => {
    if (!visible) return undefined

    if (prefersReducedMotion()) {
      currentRef.current = FLAT
      targetRef.current = FLAT
      setTilt(FLAT)
      return undefined
    }

    lastTimeRef.current = performance.now()

    const tick = (nowMs) => {
      const delta = Math.min(Math.max((nowMs - lastTimeRef.current) / 1000, 0), 0.05)
      lastTimeRef.current = nowMs

      const current = currentRef.current
      const target = targetRef.current
      const next = {
        rotateX: smoothStep(current.rotateX, target.rotateX, delta),
        rotateY: smoothStep(current.rotateY, target.rotateY, delta),
      }

      // Only re-render when the angle actually moved; a settled card costs
      // nothing. The threshold is finer than a hundredth of a degree.
      if (
        Math.abs(next.rotateX - current.rotateX) > 0.001 ||
        Math.abs(next.rotateY - current.rotateY) > 0.001
      ) {
        currentRef.current = next
        setTilt(next)
      }

      // Beat response shares this loop so audio and tilt cannot drift apart.
      if (reactToBeatRef.current) {
        const audioTarget = readAudioTarget(nowMs / 1000)
        const eased = smoothAudioLevel(beatRef.current, audioTarget.bass, delta)
        if (Math.abs(eased - beatRef.current) > 0.002) {
          beatRef.current = eased
          setBeat(eased)
        }
      } else if (beatRef.current !== 0) {
        beatRef.current = 0
        setBeat(0)
      }

      frameRef.current = window.requestAnimationFrame(tick)
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [visible])

  // Reset the eased state when the overlay is hidden so it reappears flat.
  useEffect(() => {
    if (visible) return
    targetRef.current = FLAT
    currentRef.current = FLAT
    setTilt(FLAT)
  }, [visible])

  if (!visible) return null

  const time = formatClockTime(now)
  const parts = formatClockDateParts(now, language)
  const weekday = t(`weekday.${parts.weekday}`)
  // Always show the real calendar date; "today"/"yesterday" only annotates it
  // so the date itself is never hidden behind a relative word.
  const dateLabel = t('clock.dateWithWeekday', {
    date: parts.absolute,
    weekday,
  })
  const zone = formatClockZone(now)

  // The outer element owns placement only. The tilt wrapper owns the 3D
  // transform, so positioning and rotation never overwrite each other.
  const anchorStyle = {
    left: `${offsetX}%`,
    bottom: `${offsetY}%`,
  }

  // The user's intensity slider scales both the scale bump and the glow. 0%
  // means the clock still follows the audio internally but visibly does
  // nothing; CLOCK_BEAT_INTENSITY_MAX is the strongest response the slider
  // allows. The clamp lives here as well so a stale stored value can never
  // overshoot the control range.
  const intensity =
    Math.min(Math.max(beatIntensity, CLOCK_BEAT_INTENSITY_MIN), CLOCK_BEAT_INTENSITY_MAX) / 100

  const tiltStyle = {
    // No CSS transition here: the rAF loop already eases the values, and a
    // transition on top would add lag and stutter.
    transform: `perspective(900px) rotateX(${tilt.rotateX.toFixed(3)}deg) rotateY(${tilt.rotateY.toFixed(3)}deg) scale(${(1 + beat * BEAT_SCALE * intensity).toFixed(3)})`,
    '--clock-scale': size / 100,
    // A soft glow that grows with the beat; 0 when the feature is off.
    '--clock-beat-glow': (beat * BEAT_GLOW * intensity).toFixed(3),
  }

  const content =
    placement === 'bar' ? (
      <div className="clock-bar" role="timer" aria-label={t('clock.label')}>
        <span className="clock-bar__time">{time}</span>
        <span className="clock-bar__separator" aria-hidden="true">
          ·
        </span>
        <span className="clock-bar__date">{dateLabel}</span>
        <span className="clock-bar__zone">{zone}</span>
      </div>
    ) : (
      <div className="clock-card" role="timer" aria-label={t('clock.label')}>
        <span className="clock-card__date">{dateLabel}</span>
        <span className="clock-card__time">{time}</span>
        <span className="clock-card__zone">{zone}</span>
      </div>
    )

  return (
    <div className="clock-anchor" style={anchorStyle}>
      <div className="clock-tilt" style={tiltStyle}>
        {content}
      </div>
    </div>
  )
}
