// Audio reactivity.
//
// Two very different sources feed one shape:
//
//  - Wallpaper Engine: `wallpaperRegisterAudioListener` pushes a 128-length
//    array ~30 times a second. Indices 0-63 are the left channel, 64-127 the
//    right, low index = bass, each value roughly 0-1.
//  - Browser: there is no system-audio tap, so a deterministic synthetic
//    spectrum stands in. It keeps the effect visible without microphone
//    permissions.
//
// Both paths only *write* numbers here. Render loops read them and ease toward
// them, so neither path needs to run its own animation or touch the DOM.

// Frequency bands per channel, matching the Wallpaper Engine contract.
export const AUDIO_BANDS = 64

// Total bars drawn by the spectrum visualiser. Mirrors the engine layout so
// the same renderer works for both sources.
export const SPECTRUM_BARS = AUDIO_BANDS * 2

// Bass covers the lowest bands; kick drums and bass lines live here, which is
// what makes an element feel like it is reacting to the beat.
const BASS_BANDS = 8

// Rises fast so a beat is visible immediately, decays slowly so the clock does
// not flicker between frames. These are time constants in 1/second: attack
// reaches ~95% in 0.05s, release fades over roughly half a second.
const ATTACK = 60
const RELEASE = 6

// Wallpaper Engine occasionally reports values slightly above 1.
function clampUnit(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

// Quiet samples carry residual noise that would otherwise show up as a constant
// shimmer across every bar. The engine keeps reporting small non-zero values
// even when nothing is playing, so a low-but-visible floor is needed: without
// it every bar slowly drifts downward on a "silent" frame and never settles.
const NOISE_FLOOR = 0.06

// If the loudest band in a frame is below this, the whole frame is treated as
// silence and every bar is zeroed. The engine's idle noise sits below it while
// real music, however quiet, peaks above it.
const SILENT_FRAME_PEAK = 0.08

function denoise(value) {
  const clamped = clampUnit(value)
  if (clamped <= NOISE_FLOOR) return 0
  // Rescale so the floor does not create a visible step.
  return (clamped - NOISE_FLOOR) / (1 - NOISE_FLOOR)
}

// Turns a raw 128-length frame into per-bar heights.
//
// Layout mirrors the physical channels: the left channel fills bars 0-63 and
// the right channel fills bars 64-127 in reverse, so the two channels meet in
// the middle like a mirrored equaliser. Returns null for unusable frames.
export function extractSpectrumBars(audioArray, out = new Float32Array(SPECTRUM_BARS)) {
  if (!audioArray || typeof audioArray.length !== 'number') return null
  if (audioArray.length < SPECTRUM_BARS) return null
  if (out.length !== SPECTRUM_BARS) return null

  for (let i = 0; i < AUDIO_BANDS; i += 1) {
    out[i] = denoise(audioArray[i])
    // Mirror the right channel so low frequencies sit at both outer edges.
    out[AUDIO_BANDS + i] = denoise(audioArray[SPECTRUM_BARS - 1 - i])
  }

  return out
}

// Reduces a raw 128-length frame from Wallpaper Engine to one level plus a
// left/right split. Returns null for anything that is not a usable frame.
export function summarizeWallpaperAudio(audioArray) {
  if (!audioArray || typeof audioArray.length !== 'number') return null
  if (audioArray.length < AUDIO_BANDS * 2) return null

  let bassSum = 0
  let leftSum = 0
  let rightSum = 0

  for (let i = 0; i < AUDIO_BANDS; i += 1) {
    const left = clampUnit(audioArray[i])
    const right = clampUnit(audioArray[i + AUDIO_BANDS])
    leftSum += left
    rightSum += right
    if (i < BASS_BANDS) bassSum += (left + right) / 2
  }

  return {
    bass: bassSum / BASS_BANDS,
    left: leftSum / AUDIO_BANDS,
    right: rightSum / AUDIO_BANDS,
  }
}

// Deterministic stand-in for the browser: a beat every `beatsPerSecond` plus
// moving spectral detail, so the bars look musical rather than like a flat
// pulse. Each band is driven by a few out-of-phase sines of different speeds.
export function syntheticSpectrum(timeSeconds, out = new Float32Array(SPECTRUM_BARS)) {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    out.fill(0)
    return out
  }

  const beat = (timeSeconds * 0.75) % 1
  const envelope = Math.exp(-beat * 5.5)
  const swell = 0.3 + 0.7 * envelope

  for (let i = 0; i < SPECTRUM_BARS; i += 1) {
    // Bass-heavy profile: low frequencies are loudest, tapering to the treble.
    const position = (i % AUDIO_BANDS) / AUDIO_BANDS
    const tilt = 1 - position * 0.62
    // Independent wobble per band so neighbours do not move in lockstep.
    const wobble =
      Math.sin(timeSeconds * 2.3 + i * 0.45) * 0.16 +
      Math.sin(timeSeconds * 5.7 + i * 1.31) * 0.1
    out[i] = clampUnit(swell * tilt + wobble * (0.35 + envelope))
  }

  return out
}

// Deterministic stand-in for the browser: a slow pulse with a beat every
// `beatsPerSecond`, shaped so peaks are sharp and gaps are quiet.
export function syntheticAudioLevel(timeSeconds, { beatsPerSecond = 0.75 } = {}) {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return { bass: 0, left: 0, right: 0 }

  const beat = (timeSeconds * beatsPerSecond) % 1
  // Sharp attack then exponential decay within each beat.
  const envelope = Math.exp(-beat * 5.5)
  const swell = 0.35 + 0.65 * envelope
  // A gentle sway so the two channels are not identical.
  const sway = Math.sin(timeSeconds * 0.9) * 0.12

  return {
    bass: clampUnit(swell),
    left: clampUnit(swell + sway),
    right: clampUnit(swell - sway),
  }
}

// Frame-rate independent smoothing with asymmetric attack/release, so a beat
// punches in quickly and fades out gently.
export function smoothAudioLevel(current, target, deltaSeconds) {
  if (!Number.isFinite(current)) return clampUnit(target)
  if (!Number.isFinite(target)) return current
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current

  const rising = target > current
  const rate = rising ? ATTACK : RELEASE
  const alpha = 1 - Math.exp(-rate * deltaSeconds)
  const next = current + (target - current) * alpha
  return Math.abs(target - next) < 0.002 ? clampUnit(target) : clampUnit(next)
}
