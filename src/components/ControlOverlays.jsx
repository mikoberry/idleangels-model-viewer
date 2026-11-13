// Engine-only overlays: clock, spectrum and album card.
//
// The widgets themselves come from WallKit, which is a pure-view library: it
// renders what it is given and never touches `window.wallpaper*`, localStorage
// or a timer. Everything the engine hands us — audio frames, media updates, the
// paused flag — is collected here, so the library stays reusable and this file
// stays the only place that knows the widgets exist.
//
// Rendering the three widgets from one component also keeps the per-frame audio
// work out of `App`: a newly arrived frame only re-renders this subtree, not the
// canvas, the drawer and the debug panel.

import { useEffect, useMemo, useRef, useState } from 'react'
import Clock from 'wallkit/components/clock'
import Spectrum from 'wallkit/components/spectrum'
import AlbumArt from 'wallkit/components/album-art'
import {
  SPECTRUM_BARS,
  extractSpectrumBars,
  smoothAudioLevel,
  summarizeWallpaperAudio,
} from '../utils/audio.js'
import {
  albumArtOverlayProps,
  clockLabels,
  spectrumOverlayProps,
} from '../utils/controlOverlay.js'
import { getWallpaperAudioFrame } from '../utils/wallpaperAudio.js'
import { getWallpaperMedia } from '../utils/wallpaperMedia.js'
import { isWallpaperPaused, onWallpaperPauseChange } from '../utils/wallpaperPause.js'

// The engine pushes media changes rather than emitting events the page can
// subscribe to, so the card re-reads the bridge on a cheap poll.
const MEDIA_POLL_MS = 1000

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// The bridge returns a fresh object on every read, so compare the fields the
// card actually renders before storing it. Without this the card would re-render
// once a second for as long as the wallpaper runs.
function sameTrack(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.thumbnail === b.thumbnail &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.albumTitle === b.albumTitle &&
    a.primaryColor === b.primaryColor &&
    a.playback === b.playback
  )
}

export default function ControlOverlays({
  clock,
  spectrum,
  albumArt,
  language,
  t,
  onToggleHourFormat,
}) {
  const [now, setNow] = useState(() => new Date())
  const [beat, setBeat] = useState(0)
  const [track, setTrack] = useState(() => getWallpaperMedia())
  const [paused, setPaused] = useState(() => isWallpaperPaused())

  // One buffer for the whole session. `Spectrum` and `AlbumArt` keep a reference
  // to the array and read it inside their own draw loop, so mutating it in place
  // updates both widgets without a React render per audio frame.
  const barsRef = useRef(null)
  if (!barsRef.current) barsRef.current = new Float32Array(SPECTRUM_BARS)

  const showSpectrum = spectrum.show === true
  const showAlbumArt = albumArt.show === true
  const showClock = clock.show === true
  const reactToBeat = showClock && clock.reactToBeat === true
  const needsBars = showSpectrum || showAlbumArt

  // Pause handling: the engine freezes the render process but keeps timers and
  // rAF running, so nothing may keep working while it is paused.
  useEffect(() => onWallpaperPauseChange(setPaused), [])

  // The clock owns no timer of its own: `now` is driven from here so it can stop
  // when the widget is hidden or the wallpaper is paused.
  useEffect(() => {
    if (!showClock) return undefined

    const update = () => setNow(new Date())
    update()

    const interval = window.setInterval(update, 1000)

    // Refresh straight away when the wallpaper resumes instead of waiting for
    // the next tick, which would leave a stale minute on screen.
    const handleVisibilityChange = () => {
      if (!document.hidden) update()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    const unsubscribe = onWallpaperPauseChange((value) => {
      if (!value) update()
    })

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      unsubscribe()
    }
  }, [showClock])

  // Audio: one loop feeds both the bars and the beat level.
  //
  // Inside the engine a missing frame means "nothing is playing", so the bars are
  // zeroed and the beat settles to zero rather than freezing on the last frame.
  // Browsers never reach this component — the overlays are only mounted in the
  // engine — so there is no synthetic fallback to pick between.
  useEffect(() => {
    if (paused || (!needsBars && !reactToBeat)) return undefined

    const bars = barsRef.current
    let frame = 0
    let last = performance.now()
    let level = 0

    const tick = (nowMs) => {
      const delta = clamp((nowMs - last) / 1000, 0, 0.05)
      last = nowMs

      const audioFrame = getWallpaperAudioFrame()

      if (needsBars) {
        if (!audioFrame || !extractSpectrumBars(audioFrame, bars)) bars.fill(0)
      }

      if (reactToBeat) {
        const bass = audioFrame ? (summarizeWallpaperAudio(audioFrame)?.bass ?? 0) : 0
        const next = smoothAudioLevel(level, bass, delta)
        // Only re-render when the level actually moved; a settled card costs
        // nothing.
        if (Math.abs(next - level) > 0.002) {
          level = next
          setBeat(next)
        }
      }

      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [paused, needsBars, reactToBeat])

  useEffect(() => {
    if (!showAlbumArt) return undefined

    const update = () => {
      const next = getWallpaperMedia()
      setTrack((previous) => (sameTrack(previous, next) ? previous : next))
    }

    update()
    const interval = window.setInterval(update, MEDIA_POLL_MS)
    return () => window.clearInterval(interval)
  }, [showAlbumArt])

  // Date formatting runs through `Intl`, so it is memoised away from the beat
  // re-renders that happen up to 60 times a second.
  const labels = useMemo(() => clockLabels(now, language, t), [now, language, t])

  const spectrumProps = spectrumOverlayProps(spectrum)
  const albumProps = albumArtOverlayProps(albumArt)
  // The card's inline spectrum borrows the overlay's colour by default; the
  // drawer lets it be set independently for the case where the two are both
  // visible and should not read as one object.
  const albumColor = albumArt.colorFollow === false ? albumArt.color : spectrum.color

  return (
    <>
      <Spectrum
        bars={barsRef.current}
        visible={showSpectrum}
        variant={spectrum.style}
        colorHex={spectrum.color}
        anchor={spectrumProps.anchor}
        size={spectrumProps.size}
        width={spectrumProps.width}
        height={spectrumProps.height}
        offsetX={spectrumProps.offsetX}
        offsetY={spectrumProps.offsetY}
        intensity={spectrum.intensity}
        curve={spectrum.curve}
        paused={paused}
      />
      <AlbumArt
        track={track}
        bars={barsRef.current}
        visible={showAlbumArt}
        variant={albumArt.style}
        theme={albumArt.theme}
        colorHex={albumColor}
        anchor={albumProps.anchor}
        size={albumProps.size}
        offsetX={albumProps.offsetX}
        offsetY={albumProps.offsetY}
        paused={paused}
        labels={{
          aria: t('albumArt.label'),
          coverAlt: t('albumArt.coverAlt', {
            title: track?.title || track?.albumTitle || '',
          }),
        }}
      />
      <Clock
        now={now}
        visible={showClock}
        placement={clock.placement}
        theme={clock.theme}
        use24Hour={clock.use24Hour}
        size={clock.size}
        offsetX={clock.offsetX}
        offsetY={clock.offsetY}
        anchor={clock.anchor}
        beat={reactToBeat ? beat : 0}
        beatIntensity={clock.beatIntensity}
        beatCurve={clock.beatCurve}
        tilt={clock.tilt}
        labels={labels}
        onToggleHourFormat={onToggleHourFormat}
      />
    </>
  )
}
