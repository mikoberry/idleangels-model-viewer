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
import './Spectrum.css'

// Canvas 2D is used instead of 128 DOM nodes: a bar chart that redraws at
// 60fps needs a single paint call, not 128 style invalidations.

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

// Bass level for the styles that react to the beat as a whole rather than to
// individual bands. Same real/synthetic split as the bars.
function readBass(timeSeconds) {
  if (useRealAudio()) {
    const frame = getWallpaperAudioFrame()
    if (!frame) return 0
    return summarizeWallpaperAudio(frame)?.bass ?? 0
  }
  return syntheticAudioLevel(timeSeconds).bass
}

// The renderer for each style. Kept in one table so the draw loop never has to
// branch on a string every frame.
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

export default function Spectrum({
  visible,
  style = 'bars',
  offsetX = 50,
  offsetY = 50,
  scale = 1,
  color = DEFAULT_SPECTRUM_COLOR,
}) {
  const canvasRef = useRef(null)
  // The draw loop is created once per style; a ref lets a colour change reach it
  // without tearing down and rebuilding the animation.
  const colorRef = useRef(color)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  const variant = SPECTRUM_STYLES.includes(style) ? style : 'bars'

  useEffect(() => {
    if (!visible) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    const targets = new Float32Array(SPECTRUM_BARS)
    const levels = new Float32Array(SPECTRUM_BARS)
    // Per-style state (ripple rings); reset whenever the style changes.
    const state = createRendererState(variant)
    const render = RENDERERS[variant] ?? RENDERERS.bars

    let frameId = 0
    let lastTime = performance.now()
    // Animation clock in seconds. Advanced only on frames that actually draw, so
    // pausing the wallpaper freezes the visuals instead of skipping them ahead.
    let elapsed = 0

    const resize = () => {
      // offsetWidth/offsetHeight describe the layout box and ignore the
      // `transform: scale()` used for the zoom control. getBoundingClientRect
      // would report the *scaled* size, so a zoom change plus a window resize
      // would double-scale the backing store and the bars would jump.
      // Backing store in CSS pixels keeps this consistent with the WebGL
      // canvas, which also ignores devicePixelRatio.
      const width = Math.max(1, Math.round(canvas.offsetWidth))
      const height = Math.max(1, Math.round(canvas.offsetHeight))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    const tick = (now) => {
      const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
      lastTime = now

      // Paused wallpaper: keep the loop alive but skip all drawing work.
      if (!isWallpaperPaused()) {
        // Elapsed animation time, accumulated only while drawing. Using
        // `now / 1000` directly would let a long pause jump the ring's rotation
        // to an arbitrary angle the moment the wallpaper resumes.
        elapsed += delta
        const timeSeconds = elapsed
        readBars(timeSeconds, targets)
        for (let i = 0; i < SPECTRUM_BARS; i += 1) {
          levels[i] = smoothAudioLevel(levels[i], targets[i], delta)
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
  }, [visible, variant])

  if (!visible) return null

  return (
    <div
      className={`spectrum spectrum--style-${variant}`}
      style={{
        // The surface floats at offsetX/offsetY percentages of the viewport and
        // `scale` sizes the whole box, so the widget keeps its aspect ratio.
        // The wrapper is a fixed-size stage centred on that point.
        '--spectrum-offset-x': `${offsetX}%`,
        '--spectrum-offset-y': `${offsetY}%`,
        '--spectrum-scale': scale,
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="spectrum__canvas" />
    </div>
  )
}
