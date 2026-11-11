import { useEffect, useRef, useState } from 'react'
import {
  computeClockTilt,
  formatClockDateParts,
  formatClockTime,
  formatClockZone,
  smoothStep,
} from '../clock.js'
import { smoothAudioLevel, summarizeWallpaperAudio, syntheticAudioLevel } from '../audio.js'
import { getWallpaperAudioFrame } from '../wallpaperAudio.js'

// Idle tilt eases back to flat when the pointer leaves the window.
const FLAT = { rotateX: 0, rotateY: 0 }

// Maximum scale added by a full-strength beat. Small on purpose: the clock
// should breathe with the music, not bounce.
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
function readAudioTarget(timeSeconds) {
  const frame = getWallpaperAudioFrame()
  if (frame) {
    const summary = summarizeWallpaperAudio(frame)
    if (summary) return summary
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
    // visible again, instead of waiting for the next interval tick. Wallpaper
    // Engine fires setPaused on its own; in a browser the optional call is a
    // no-op because no listener object exists.
    const onVisibilityChange = () => {
      if (!document.hidden) update()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.wallpaperPropertyListener?.setPaused?.(() => update())

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
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

  const tiltStyle = {
    // No CSS transition here: the rAF loop already eases the values, and a
    // transition on top would add lag and stutter.
    transform: `perspective(900px) rotateX(${tilt.rotateX.toFixed(3)}deg) rotateY(${tilt.rotateY.toFixed(3)}deg) scale(${(1 + beat * BEAT_SCALE).toFixed(3)})`,
    '--clock-scale': size / 100,
    // A soft glow that grows with the beat; 0 when the feature is off.
    '--clock-beat-glow': (beat * BEAT_GLOW).toFixed(3),
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
