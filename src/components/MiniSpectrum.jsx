import { useEffect, useRef } from 'react'
import {
  DEFAULT_SPECTRUM_COLOR,
  extractSpectrumBars,
  smoothAudioLevel,
  spectrumGradientStops,
  SPECTRUM_BARS,
  syntheticSpectrum,
} from '../utils/audio.js'
import { getWallpaperAudioFrame } from '../utils/wallpaperAudio.js'
import { isWallpaperPaused } from '../utils/wallpaperPause.js'

// Inline, size-agnostic spectrum. The full-screen Spectrum component is pinned
// to a screen edge and owns its own position; this one simply fills whatever
// box its parent gives it, so it can sit inside the album card.
//
// It shares the same data path: real engine frames inside Wallpaper Engine,
// synthetic data in a browser, and silence (never fake bars) once the engine is
// detected but sends nothing.

function useRealAudio() {
  return (
    typeof window !== 'undefined' &&
    typeof window.wallpaperRegisterAudioListener === 'function'
  )
}

function readBars(timeSeconds, out) {
  if (useRealAudio()) {
    const frame = getWallpaperAudioFrame()
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

// A dense 128-bar spectrum is unreadable at card size: the bars end up a couple
// of pixels wide with visible gaps between them, so the strip reads as mostly
// empty. Grouping bands into fewer, wider bars keeps the same overall energy
// while looking filled.
const MINI_BARS = 32

// Raw band values sit well below 1 for most music, so plotting them directly
// leaves the strip almost empty. The bars are mapped into a visible band: the
// floor sits just above the baseline and the loudest peaks stop at 78% of the
// card, leaving the top area to the metadata drawn over the graph.
const VISIBLE_FLOOR = 0.05
const VISIBLE_CEIL = 0.78

export default function MiniSpectrum({ active = true, color = DEFAULT_SPECTRUM_COLOR }) {
  const canvasRef = useRef(null)
  const colorRef = useRef(color)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => {
    if (!active) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    const targets = new Float32Array(SPECTRUM_BARS)
    const levels = new Float32Array(MINI_BARS)

    let frameId = 0
    let lastTime = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    // Folds the 128 engine bands into MINI_BARS by averaging each group, so the
    // bar count is independent of the engine's frame layout. Each averaged band
    // is then lifted into the visible range so quiet music still fills the
    // strip instead of hugging the baseline.
    const foldBars = (out) => {
      const groupSize = SPECTRUM_BARS / MINI_BARS
      for (let i = 0; i < MINI_BARS; i += 1) {
        const start = Math.floor(i * groupSize)
        const end = Math.floor((i + 1) * groupSize)
        let sum = 0
        for (let j = start; j < end; j += 1) sum += targets[j]
        const average = sum / Math.max(1, end - start)
        out[i] = VISIBLE_FLOOR + average * (VISIBLE_CEIL - VISIBLE_FLOOR)
      }
      return out
    }

    const folded = new Float32Array(MINI_BARS)

    const draw = (delta) => {
      const width = canvas.width
      const height = canvas.height

      context.clearRect(0, 0, width, height)
      foldBars(folded)

      const stops =
        spectrumGradientStops(colorRef.current) ??
        spectrumGradientStops(DEFAULT_SPECTRUM_COLOR)

      const slot = width / MINI_BARS
      // A small gap sets the bars apart without making the strip look sparse.
      const gap = Math.max(1, Math.round(slot * 0.28))
      const barWidth = Math.max(1, slot - gap)

      for (let i = 0; i < MINI_BARS; i += 1) {
        levels[i] = smoothAudioLevel(levels[i], folded[i], delta)

        const barHeight = Math.max(1, levels[i] * height)
        const x = i * slot

        const gradient = context.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, stops.bottom)
        gradient.addColorStop(1, stops.top)
        context.fillStyle = gradient
        context.fillRect(x, height - barHeight, barWidth, barHeight)
      }
    }

    const tick = (now) => {
      const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
      lastTime = now

      if (!isWallpaperPaused()) {
        readBars(now / 1000, targets)
        draw(delta)
      }

      frameId = window.requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [active])

  if (!active) return null

  return <canvas ref={canvasRef} className="mini-spectrum" aria-hidden="true" />
}
