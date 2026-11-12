import { useEffect, useRef } from 'react'
import {
  DEFAULT_SPECTRUM_COLOR,
  extractSpectrumBars,
  smoothAudioLevel,
  summarizeWallpaperAudio,
  syntheticAudioLevel,
  syntheticSpectrum,
  SPECTRUM_BARS,
} from '../utils/audio.js'
import {
  createRendererState,
  drawAurora,
  drawBars,
  drawCurve,
  drawDots,
  drawMirror,
  drawRing,
  drawRingWave,
  drawRipples,
  SPECTRUM_STYLES,
} from '../utils/spectrum.js'
import { getWallpaperAudioFrame } from '../utils/wallpaperAudio.js'
import { isWallpaperPaused } from '../utils/wallpaperPause.js'
import './MiniSpectrum.css'

// Inline, size-agnostic spectrum. The full-screen Spectrum component is pinned
// to a screen edge and owns its own position; this one simply fills whatever
// box its parent gives it, so it can sit inside the album card.
//
// It shares the same data path: real engine frames inside Wallpaper Engine,
// synthetic data in a browser, and silence (never fake bars) once the engine is
// detected but sends nothing. It also shares the renderer set in
// src/utils/spectrum.js, so every style the full-screen widget offers is
// available inside the card too.

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

function readBass(timeSeconds) {
  if (useRealAudio()) {
    const frame = getWallpaperAudioFrame()
    if (!frame) return 0
    return summarizeWallpaperAudio(frame)?.bass ?? 0
  }
  return syntheticAudioLevel(timeSeconds).bass
}

// A dense 128-bar spectrum is unreadable at card size: the bars end up a couple
// of pixels wide with visible gaps between them, so the strip reads as mostly
// empty. Grouping bands into fewer, wider bars keeps the same overall energy
// while looking filled. The renderers that fold their own bands (dots, aurora)
// simply receive the folded array.
const MINI_BARS = 32

// Raw band values sit well below 1 for most music, so plotting them directly
// leaves the strip almost empty. The bars are mapped into a visible band: the
// floor sits just above the baseline and the loudest peaks stop at 78% of the
// card, leaving the top area to the metadata drawn over the graph.
const VISIBLE_FLOOR = 0.05
const VISIBLE_CEIL = 0.78

const RENDERERS = {
  bars: (ctx, levels, w, h, color) => drawBars(ctx, levels, w, h, color),
  mirror: (ctx, levels, w, h, color) => drawMirror(ctx, levels, w, h, color),
  curve: (ctx, levels, w, h, color) => drawCurve(ctx, levels, w, h, color),
  ring: (ctx, levels, w, h, color, state, meta) => drawRing(ctx, levels, w, h, color, meta),
  ringwave: (ctx, levels, w, h, color, state, meta) =>
    drawRingWave(ctx, levels, w, h, color, meta),
  dots: (ctx, levels, w, h, color) => drawDots(ctx, levels, w, h, color),
  ripples: (ctx, levels, w, h, color, state, meta) =>
    drawRipples(ctx, levels, w, h, color, state, meta),
  aurora: (ctx, levels, w, h, color, state, meta) =>
    drawAurora(ctx, levels, w, h, color, state, meta),
}


export default function MiniSpectrum({
  active = true,
  style = 'bars',
  color = DEFAULT_SPECTRUM_COLOR,
}) {
  const canvasRef = useRef(null)
  const colorRef = useRef(color)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  const variant = SPECTRUM_STYLES.includes(style) ? style : 'bars'

  useEffect(() => {
    if (!active) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    const targets = new Float32Array(SPECTRUM_BARS)
    const levels = new Float32Array(MINI_BARS)
    const state = createRendererState(variant)
    const render = RENDERERS[variant] ?? RENDERERS.bars

    let frameId = 0
    let lastTime = performance.now()
    // Animation clock in seconds, advanced only while drawing so a paused
    // wallpaper freezes the ring rotation instead of jumping it ahead.
    let elapsed = 0

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

    const tick = (now) => {
      const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
      lastTime = now

      if (!isWallpaperPaused()) {
        elapsed += delta
        const timeSeconds = elapsed
        readBars(timeSeconds, targets)
        foldBars(folded)
        for (let i = 0; i < MINI_BARS; i += 1) {
          levels[i] = smoothAudioLevel(levels[i], folded[i], delta)
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        render(context, levels, canvas.width, canvas.height, colorRef.current, state, {
          time: timeSeconds,
          bass: readBass(timeSeconds),
        })
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
  }, [active, variant])

  if (!active) return null

  return <canvas ref={canvasRef} className="mini-spectrum" aria-hidden="true" />
}
