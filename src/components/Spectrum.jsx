import { useEffect, useRef } from 'react'
import { extractSpectrumBars, syntheticSpectrum, smoothAudioLevel, SPECTRUM_BARS } from '../audio.js'
import { getWallpaperAudioFrame } from '../wallpaperAudio.js'

// Canvas 2D is used instead of 128 DOM nodes: a bar chart that redraws at
// 60fps needs a single paint call, not 128 style invalidations.

const COLORS = {
  barTop: 'rgba(168, 196, 255, 0.95)',
  barBottom: 'rgba(96, 128, 220, 0.55)',
}

// Wallpaper Engine sends real system audio. Anywhere the engine is absent the
// synthetic data stands in, because browsers cannot tap system output.
//
// The distinction matters: once the engine is detected we must *never* fall
// back to synthetic bars, or silencing the music would leave the spectrum
// bouncing on its own.
function useRealAudio() {
  return typeof window !== 'undefined' && typeof window.wallpaperRegisterAudioListener === 'function'
}

function readBars(timeSeconds, out) {
  if (useRealAudio()) {
    const frame = getWallpaperAudioFrame()
    // No frame yet, or the engine went quiet: draw silence, not a fake beat.
    if (!frame) {
      out.fill(0)
      return out
    }
    const bars = extractSpectrumBars(frame, out)
    if (bars) return bars
    out.fill(0)
    return out
  }

  return syntheticSpectrum(timeSeconds, out)
}

export default function Spectrum({ visible, position = 'bottom', height = 22 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!visible) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    const targets = new Float32Array(SPECTRUM_BARS)
    const levels = new Float32Array(SPECTRUM_BARS)

    let frameId = 0
    let lastTime = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      // Backing store in CSS pixels keeps this consistent with the WebGL
      // canvas, which also ignores devicePixelRatio.
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    const draw = (delta, timeSeconds) => {
      const width = canvas.width
      const height = canvas.height

      context.clearRect(0, 0, width, height)

      const gap = Math.max(1, Math.round(width / SPECTRUM_BARS / 4))
      const barWidth = width / SPECTRUM_BARS

      for (let i = 0; i < SPECTRUM_BARS; i += 1) {
        levels[i] = smoothAudioLevel(levels[i], targets[i], delta)

        const x = i * barWidth
        const barHeight = Math.max(1, levels[i] * height)
        const w = Math.max(1, barWidth - gap)

        const gradient = context.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.barBottom)
        gradient.addColorStop(1, COLORS.barTop)
        context.fillStyle = gradient
        context.fillRect(x, height - barHeight, w, barHeight)
      }
    }

    const tick = (now) => {
      const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
      lastTime = now

      readBars(now / 1000, targets)
      draw(delta, now / 1000)

      frameId = window.requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={`spectrum spectrum--${position}`}
      style={{ '--spectrum-height': `${height}vh` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="spectrum__canvas" />
    </div>
  )
}
