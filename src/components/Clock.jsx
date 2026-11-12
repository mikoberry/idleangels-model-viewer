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
  use24Hour = true,
  theme = 'dark',
  onToggleHourFormat,
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

  const time = formatClockTime(now, { use24Hour })
  const parts = formatClockDateParts(now, language)
  const weekday = t(`weekday.${parts.weekday}`)
  // Always show the real calendar date; "today"/"yesterday" only annotates it
  // so the date itself is never hidden behind a relative word.
  const dateLabel = t('clock.dateWithWeekday', {
    date: parts.absolute,
    weekday,
  })
  const zoneInfo = formatClockZone(now)
  const zone = zoneInfo.display || zoneInfo.short || zoneInfo.iana

  // Deconstruct components for specialized layouts
  const timeClean = time.replace(/\s*[AP]M$/i, '')
  const ampm = time.match(/[AP]M$/i)?.[0] || ''
  const timeChunks = timeClean.split(':')
  const hoursStr = timeChunks[0] || '00'
  const minutesStr = timeChunks[1] || '00'
  const secondsStr = timeChunks[2] || '00'

  // Outer placement anchor style
  const anchorStyle = {
    left: `${offsetX}%`,
    bottom: `${offsetY}%`,
  }

  // Audio beat intensity
  const intensity =
    Math.min(Math.max(beatIntensity, CLOCK_BEAT_INTENSITY_MIN), CLOCK_BEAT_INTENSITY_MAX) / 100

  const tiltStyle = {
    transform: `perspective(900px) rotateX(${tilt.rotateX.toFixed(3)}deg) rotateY(${tilt.rotateY.toFixed(3)}deg) scale(${(1 + beat * BEAT_SCALE * intensity).toFixed(3)})`,
    '--clock-scale': size / 100,
    '--clock-beat-glow': (beat * BEAT_GLOW * intensity).toFixed(3),
  }

  const themeClass = theme === 'light' ? 'clock--theme-light' : 'clock--theme-dark'

  let content = null

  if (placement === 'minimal') {
    // 1. 极简数字时钟（Minimal Digital）
    content = (
      <div
        className={`clock-minimal-digital ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <div className="clock-minimal-digital__time">
          <span className="clock-minimal-digital__hm">{hoursStr}:{minutesStr}</span>
          <span className="clock-minimal-digital__colon">:</span>
          <span className="clock-minimal-digital__sec">{secondsStr}</span>
          {ampm && <span className="clock-minimal-digital__ampm">{ampm}</span>}
        </div>
        <div className="clock-minimal-digital__date">
          {parts.absolute} {weekday}
        </div>
        <div className="clock-minimal-digital__zone">
          {zoneInfo.iana ? `${zoneInfo.iana} · ${zoneInfo.short}` : zone}
        </div>
      </div>
    )
  } else if (placement === 'cyberpunk') {
    // 2. 赛博朋克霓虹时钟（Cyberpunk Neon）
    content = (
      <div
        className={`clock-cyberpunk ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <div className="clock-cyberpunk__scanline" aria-hidden="true" />
        <div className="clock-cyberpunk__time">
          <span className="clock-cyberpunk__hm">{hoursStr}:{minutesStr}</span>
          <span className="clock-cyberpunk__colon">:</span>
          <span className="clock-cyberpunk__sec">{secondsStr}</span>
          {ampm && <span className="clock-cyberpunk__ampm">{ampm}</span>}
        </div>
        <div className="clock-cyberpunk__divider" />
        <div className="clock-cyberpunk__footer">
          <span className="clock-cyberpunk__date">{parts.absolute}</span>
          <span className="clock-cyberpunk__weekday">{weekday}</span>
          <span className="clock-cyberpunk__zone">{zoneInfo.short || zoneInfo.iana || zone}</span>
        </div>
      </div>
    )
  } else if (placement === 'infobar') {
    // 3. 横向信息条时钟（Horizontal Info Bar）
    content = (
      <div
        className={`clock-infobar ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <span className="clock-infobar__zone">{zoneInfo.iana || zone}</span>
        <span className="clock-infobar__sep">|</span>
        <span className="clock-infobar__date">{weekday} {parts.absolute}</span>
        <span className="clock-infobar__sep">|</span>
        <span className="clock-infobar__time">{time}</span>
      </div>
    )
  } else if (placement === 'bar') {
    content = (
      <div
        className={`clock-bar ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <span className="clock-bar__time">{time}</span>
        <span className="clock-bar__separator" aria-hidden="true">
          ·
        </span>
        <span className="clock-bar__date">{dateLabel}</span>
        <span className="clock-bar__zone">{zone}</span>
      </div>
    )
  } else if (placement === 'split') {
    content = (
      <div
        className={`clock-split ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <div className="clock-split__header">
          <span className="clock-split__badge">{weekday}</span>
          <span className="clock-split__date">{parts.absolute}</span>
          {zone && <span className="clock-split__zone">{zone}</span>}
        </div>
        <div className="clock-split__time">{time}</div>
      </div>
    )
  } else if (placement === 'poster') {
    content = (
      <div
        className={`clock-poster ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <div className="clock-poster__main">
          <span className="clock-poster__hm">{hoursStr}:{minutesStr}</span>
          <span className="clock-poster__sec">{secondsStr}</span>
        </div>
        <div className="clock-poster__footer">
          <span className="clock-poster__date">{parts.absolute}</span>
          <span className="clock-poster__weekday">{weekday}</span>
          {zone && <span className="clock-poster__zone">{zone}</span>}
        </div>
      </div>
    )
  } else {
    // Default 'card'
    content = (
      <div
        className={`clock-card ${themeClass}`}
        role="timer"
        aria-label={t('clock.label')}
        onClick={onToggleHourFormat}
        title={zoneInfo.iana || zone}
      >
        <span className="clock-card__date">{dateLabel}</span>
        <span className="clock-card__time">{time}</span>
        <span className="clock-card__zone">{zone}</span>
      </div>
    )
  }

  return (
    <div className="clock-anchor" style={anchorStyle}>
      <div className="clock-tilt" style={tiltStyle}>
        {content}
      </div>
    </div>
  )
}
