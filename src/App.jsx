import { useEffect, useRef, useState } from 'react'
import SettingsDrawer from './components/SettingsDrawer.jsx'
import ControlOverlays from './components/ControlOverlays.jsx'
import { detectLanguage, getTranslator, LANGUAGES, saveLanguage } from './i18n.js'
import { smoothStep } from './utils/clock.js'
import { copyText } from './utils/clipboard.js'
import {
  ALBUM_DEFAULTS,
  CLOCK_DEFAULTS,
  SPECTRUM_DEFAULTS,
  buildPresetForModel,
  normalizeAlbumPreset,
  normalizeClockPreset,
  normalizeSpectrumPreset,
} from './utils/modelPreset.js'
import { getWallpaperAudioFrame, isWallpaperAudioAvailable } from './utils/wallpaperAudio.js'
import { isWidgetPreview } from './utils/preview.js'
import { startSpineStage } from './spineStage.js'
import './App.css'

const MODEL_VIEWS_KEY = 'spine-viewer:model-views:v1'
const CLOCK_KEY = 'spine-viewer:clock:v1'
const SPECTRUM_KEY = 'spine-viewer:spectrum:v1'
const ALBUM_ART_KEY = 'spine-viewer:album-art:v1'

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

// Widget settings are normalised by the same functions that read presets, so a
// value cannot mean one thing when it arrives from localStorage and another when
// it arrives from model-presets.json. They also carry the one-time conversions
// for preferences written before WallKit anchored widgets to a named point
// (the spectrum's centre-relative offsets, the album card's `corner` field).

function loadClockSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CLOCK_KEY) ?? 'null')
    return normalizeClockPreset(value, CLOCK_DEFAULTS)
  } catch {
    return CLOCK_DEFAULTS
  }
}

function saveClockSettings(clock) {
  try {
    window.localStorage.setItem(CLOCK_KEY, JSON.stringify(clock))
  } catch {
    return
  }
}

// The spectrum keeps its own preferences so enabling audio visualisation does
// not depend on the clock being shown.
function loadSpectrumSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SPECTRUM_KEY) ?? 'null')
    return normalizeSpectrumPreset(value, SPECTRUM_DEFAULTS)
  } catch {
    return SPECTRUM_DEFAULTS
  }
}

function saveSpectrumSettings(spectrum) {
  try {
    window.localStorage.setItem(SPECTRUM_KEY, JSON.stringify(spectrum))
  } catch {
    return
  }
}

// Album art card: cover plus track metadata from the engine's media session.
function loadAlbumArtSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ALBUM_ART_KEY) ?? 'null')
    return normalizeAlbumPreset(value, ALBUM_DEFAULTS)
  } catch {
    return ALBUM_DEFAULTS
  }
}

function saveAlbumArtSettings(albumArt) {
  try {
    window.localStorage.setItem(ALBUM_ART_KEY, JSON.stringify(albumArt))
  } catch {
    return
  }
}

function loadModelViews() {
  try {
    const value = JSON.parse(window.localStorage.getItem(MODEL_VIEWS_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    const views = {}
    for (const [id, view] of Object.entries(value)) {
      if (!view || typeof view !== 'object') continue
      if (
        !Number.isFinite(view.scale) ||
        !Number.isFinite(view.positionX) ||
        !Number.isFinite(view.positionY)
      ) {
        continue
      }

      views[id] = {
        scale: view.scale,
        positionX: view.positionX,
        positionY: view.positionY,
        ...(typeof view.backgroundColor === 'string' &&
        /^#[0-9a-f]{6}$/i.test(view.backgroundColor)
          ? { backgroundColor: view.backgroundColor.toLowerCase() }
          : {}),
        ...(typeof view.parallax === 'boolean' ? { parallax: view.parallax } : {}),
        ...(Number.isFinite(view.parallaxAmount) ? { parallaxAmount: view.parallaxAmount } : {}),
        ...(typeof view.clickToAction === 'boolean' ? { clickToAction: view.clickToAction } : {}),
      }
    }
    return views
  } catch {
    return {}
  }
}

function saveModelViews(views) {
  try {
    window.localStorage.setItem(MODEL_VIEWS_KEY, JSON.stringify(views))
  } catch {
    return
  }
}

function isWallpaperEngineEnvironment() {
  return (
    Boolean(window.wallpaperPropertyListener) ||
    typeof window.wallpaperRegisterAudioListener === 'function' ||
    /wallpaper[\s_-]*engine/i.test(navigator.userAgent)
  )
}

const DEFAULT_MODEL_VIEW = {
  scale: 1,
  positionX: 0,
  positionY: 0,
  backgroundColor: '#000000',
}

function recommendedViewFor(model) {
  const view = model?.recommendedView ?? {}
  return {
    scale: Number.isFinite(view.scale) ? view.scale : DEFAULT_MODEL_VIEW.scale,
    positionX: Number.isFinite(view.positionX)
      ? view.positionX
      : DEFAULT_MODEL_VIEW.positionX,
    positionY: Number.isFinite(view.positionY)
      ? view.positionY
      : DEFAULT_MODEL_VIEW.positionY,
    backgroundColor:
      typeof view.backgroundColor === 'string' &&
      /^#[0-9a-f]{6}$/i.test(view.backgroundColor)
        ? view.backgroundColor.toLowerCase()
        : DEFAULT_MODEL_VIEW.backgroundColor,
  }
}

function formatBrowser(userAgent, t) {
  const version = (pattern) => userAgent.match(pattern)?.[1] ?? ''
  if (userAgent.includes('Edg/')) return `Edge ${version(/Edg\/([\d.]+)/)}`.trim()
  if (userAgent.includes('OPR/')) return `Opera ${version(/OPR\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Chrome/')) return `Chrome ${version(/Chrome\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Firefox/')) return `Firefox ${version(/Firefox\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Version/') && userAgent.includes('Safari')) {
    return `Safari ${version(/Version\/([\d.]+)/)}`.trim()
  }
  return t('common.unknown')
}

function readWebglInfo(canvas, t) {
  if (!canvas) return t('common.notReady')

  let gl
  try {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  } catch {
    return t('common.unavailable')
  }
  if (!gl) return t('common.unavailable')

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const version = gl.getParameter(gl.VERSION)
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR)
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER)

  return `${version} · ${vendor} · ${renderer}`
}

function loadJson(url, t) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'text'
    request.onload = () => {
      if (request.status !== 200 && request.status !== 0) {
        reject(
          new Error(t('app.error.manifestHttp', { status: request.status })),
        )
        return
      }

      try {
        resolve(JSON.parse(request.responseText))
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () =>
      reject(new Error(t('app.error.manifestNetwork')))
    request.send()
  })
}

// Surfaces whether Wallpaper Engine audio is actually flowing. Without this the
// spectrum silently falls back to synthetic data and looks alive with no music.
function describeAudioFrame(t) {
  if (!isWallpaperAudioAvailable()) return t('debug.audioUnavailable')
  if (!getWallpaperAudioFrame()) return t('debug.audioWaiting')
  return t('debug.audioActive')
}

function collectDebugInfo(canvas, t) {  const userAgent = navigator.userAgent
  const weApi = window.wallpaperPropertyListener
    ? 'wallpaperPropertyListener'
    : typeof window.wallpaperRegisterAudioListener === 'function'
      ? 'wallpaperRegisterAudioListener'
      : t('common.notDetected')
  const isWallpaperEngine =
    weApi !== t('common.notDetected') || /wallpaper[\s_-]*engine/i.test(userAgent)

  return [
    {
      label: t('debug.environment'),
      value: isWallpaperEngine ? t('common.wallpaperEngine') : t('common.browser'),
    },
    { label: t('debug.browser'), value: formatBrowser(userAgent, t) },
    { label: t('debug.window'), value: `${window.innerWidth} × ${window.innerHeight}` },
    {
      label: t('debug.canvas'),
      value: canvas ? `${canvas.width} × ${canvas.height}` : t('common.notReady'),
    },
    { label: t('debug.screen'), value: `${screen.width} × ${screen.height}` },
    {
      label: t('debug.availableScreen'),
      value: `${screen.availWidth} × ${screen.availHeight}`,
    },
    { label: t('debug.pixelRatio'), value: String(window.devicePixelRatio) },
    {
      label: t('debug.cpuThreads'),
      value: navigator.hardwareConcurrency
        ? String(navigator.hardwareConcurrency)
        : t('common.unknown'),
    },
    {
      label: t('debug.deviceMemory'),
      value: navigator.deviceMemory
        ? `${navigator.deviceMemory} GB`
        : t('common.unknown'),
    },
    { label: t('debug.platform'), value: navigator.platform || t('common.unknown') },
    { label: t('debug.language'), value: navigator.language || t('common.unknown') },
    { label: t('debug.webgl'), value: readWebglInfo(canvas, t) },
    { label: t('debug.weApi'), value: weApi },
    { label: t('debug.audio'), value: describeAudioFrame(t) },
    { label: t('debug.page'), value: window.location.href },
    { label: t('debug.userAgent'), value: userAgent },
  ]
}

export default function App() {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const [language, setLanguage] = useState(detectLanguage)
  const t = getTranslator(language)
  const [statusState, setStatusState] = useState({ key: 'app.status.starting' })
  const status = t(statusState.key, statusState.params)
  const [isError, setIsError] = useState(false)
  const inWallpaperEngine = isWallpaperEngineEnvironment()
  // The widgets are engine-only in the packaged wallpaper. A browser renders
  // them on synthetic data instead, which is what makes their settings worth
  // opening there — see `utils/preview.js` for when that is allowed.
  const widgetPreview = !inWallpaperEngine && isWidgetPreview()
  const widgetsAvailable = inWallpaperEngine || widgetPreview
  // The drawer starts open in a normal browser so the settings are reachable
  // straight away, and closed inside Wallpaper Engine so the canvas stays
  // unobstructed until the eye button is used. The previous first-visit hint
  // bubble has been removed.
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => !inWallpaperEngine)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugInfo, setDebugInfo] = useState([])
  const [animations, setAnimations] = useState([])
  const [currentAnimation, setCurrentAnimation] = useState('idle')
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null
  const currentRecommendedView = recommendedViewFor(selectedModel)
  const [viewSettings, setViewSettings] = useState(() => ({
    ...DEFAULT_MODEL_VIEW,
    clickToAction: true,
    // Pointer parallax: the character drifts with the mouse. `amount` is a
    // fraction of the viewport at the screen edge, so 0.03 means a 3% drift.
    parallax: true,
    parallaxAmount: 3,
  }))
  const [recordedViews, setRecordedViews] = useState(loadModelViews)
  const modelViewsRef = useRef(recordedViews)
  const [clock, setClock] = useState(loadClockSettings)

  useEffect(() => {
    saveClockSettings(clock)
  }, [clock])

  const [spectrum, setSpectrum] = useState(loadSpectrumSettings)

  useEffect(() => {
    saveSpectrumSettings(spectrum)
  }, [spectrum])

  const [albumArt, setAlbumArt] = useState(loadAlbumArtSettings)

  useEffect(() => {
    saveAlbumArtSettings(albumArt)
  }, [albumArt])

  useEffect(() => {
    saveLanguage(language)
    document.documentElement.lang =
      LANGUAGES.find((item) => item.id === language)?.htmlLang ?? 'en'
    document.title = t('app.title')
  }, [language])

  const recordModelView = (id, view) => {
    if (!id) return false

    const next = {
      ...modelViewsRef.current,
      [id]: {
        scale: view.scale,
        positionX: view.positionX,
        positionY: view.positionY,
        backgroundColor: view.backgroundColor,
        // Interaction settings travel with the record too, otherwise recording a
        // view would fall back to the defaults for them on the next switch.
        ...(typeof view.parallax === 'boolean' ? { parallax: view.parallax } : {}),
        ...(Number.isFinite(view.parallaxAmount) ? { parallaxAmount: view.parallaxAmount } : {}),
        ...(typeof view.clickToAction === 'boolean' ? { clickToAction: view.clickToAction } : {}),
      },
    }

    modelViewsRef.current = next
    setRecordedViews(next)
    saveModelViews(next)
    return true
  }

  useEffect(() => {
    let cancelled = false

    const loadManifest = async () => {
      setStatusState({ key: 'app.status.loadingManifest' })
      setIsError(false)

      try {
        const manifestUrl = new URL('spine/models/manifest.json', document.baseURI)
        const data = await loadJson(manifestUrl.href, t)
        if (!Array.isArray(data.models) || data.models.length === 0) {
          throw new Error(t('app.error.manifestEmpty'))
        }

        if (cancelled) return
        setModels(data.models)
        setSelectedModelId(data.models[0].id)
        setStatusState({
          key: 'app.status.manifestLoaded',
          params: { count: data.models.length },
        })
      } catch (error) {
        if (cancelled) return
        console.error(error)
        setStatusState({
          key: 'app.status.error',
          params: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
        setIsError(true)
      }
    }

    loadManifest()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !selectedModel) return undefined

    let disposed = false
    let disposeStage = () => {}

    setAnimations([])
    setCurrentAnimation('idle')
    stageRef.current = null

    startSpineStage(canvas, {
      model: selectedModel,
      t,
      onStatus: (key, vars, error = false) => {
        if (disposed) return
        setStatusState({ key, params: vars })
        setIsError(error)
      },
      onAnimationChange: (name) => {
        if (disposed) return
        setCurrentAnimation(name)
      },
      isCancelled: () => disposed,
    })
      .then((stage) => {
        if (disposed) {
          stage.dispose()
          return
        }

        stageRef.current = stage
        setAnimations(stage.animations)
        setCurrentAnimation((name) =>
          stage.animations.includes(name) ? name : (stage.animations[0] ?? 'idle'),
        )
        // Precedence for the view: a locally recorded view wins over the preset
        // shipped in the manifest, which wins over the built-in default. The
        // record is what the user just tuned in the browser, so it must not be
        // overwritten by an older preset.
        const recorded = modelViewsRef.current[selectedModel.id]
        const preset = selectedModel.preset
        const baseView = preset?.view ? { ...currentRecommendedView, ...preset.view } : currentRecommendedView
        const initialView = recorded ? { ...baseView, ...recorded } : baseView

        setViewSettings((current) => ({
          ...current,
          ...initialView,
        }))
        stage.setView(
          initialView.scale,
          initialView.positionX / 100,
          initialView.positionY / 100,
        )
        // Widget settings are only overridden when the model actually carries
        // them, so a preset without a clock section leaves the user's clock alone.
        applyPresetWidgets(preset)
        disposeStage = stage.dispose
      })
      .catch((error) => {
        if (disposed) return
        console.error(error)
        setStatusState({
          key: 'app.status.error',
          params: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
        setIsError(true)
      })

    return () => {
      disposed = true
      disposeStage()
      stageRef.current = null
    }
  }, [selectedModel])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    stage.setView(
      viewSettings.scale,
      viewSettings.positionX / 100,
      viewSettings.positionY / 100,
    )
  }, [viewSettings.positionX, viewSettings.positionY, viewSettings.scale])

  useEffect(() => {
    if (!debugOpen) return undefined

    const update = () => setDebugInfo(collectDebugInfo(canvasRef.current, t))
    update()
    window.addEventListener('resize', update)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
    }
  }, [debugOpen, language])

  const updateViewSettings = (patch) => {
    setViewSettings((previous) => ({ ...previous, ...patch }))
    if (patch.clickToAction === false) stageRef.current?.play('idle')
  }

  const handleAnimationChange = (name) => {
    stageRef.current?.play(name)
  }

  const handleModelChange = (id) => {
    if (id === selectedModel?.id) return
    setSelectedModelId(id)
  }

  const handleRecordView = () => {
    if (!selectedModel) return false
    return recordModelView(selectedModel.id, viewSettings)
  }

  // Apply the widget sections of a model preset. A missing section means "leave
  // this widget alone", which is what lets a preset override only the clock, or
  // only the spectrum, instead of having to restate everything.
  const applyPresetWidgets = (preset) => {
    if (!preset) return
    if (preset.clock) setClock((previous) => normalizeClockPreset(preset.clock, previous))
    if (preset.spectrum) {
      setSpectrum((previous) => normalizeSpectrumPreset(preset.spectrum, previous))
    }
    if (preset.albumArt) setAlbumArt((previous) => normalizeAlbumPreset(preset.albumArt, previous))
  }

  // Everything the user has tuned for the current model, as one object ready to
  // paste into model-presets.json. Mirrors the "copy all views" affordance but
  // covers the clock, spectrum and album card too.
  const handleCopyPreset = async () => {
    if (!selectedModel) return false
    const preset = buildPresetForModel({ view: viewSettings, clock, spectrum, albumArt })
    const payload = { [selectedModel.id]: preset }
    return copyText(JSON.stringify(payload, null, 2))
  }

  const handleCanvasPointerUp = (event) => {
    if (isDrawerOpen || !viewSettings.clickToAction) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    stageRef.current?.triggerAction()
  }

  // Pointer parallax. The listener lives on window because the character must
  // follow the cursor even when the pointer is over an overlay (the drawer, the
  // debug panel) rather than the canvas itself.
  //
  // The target is stored in a ref and eased by the stage's own frame loop, so a
  // fast mouse cannot outrun the animation and the character never snaps. When
  // the feature is off the target is pinned to centre, which parks the camera at
  // the untouched view position.
  const parallaxTargetRef = useRef({ x: 0, y: 0 })
  const parallaxEnabled = viewSettings.parallax !== false
  // Percentage at the screen edge, clamped to the drawer's slider range. A
  // negative value reverses the drift (the character leans away from the
  // pointer), which the slider exposes deliberately.
  const parallaxAmount = clampNumber(viewSettings.parallaxAmount, 3, -15, 15)

  useEffect(() => {
    const reset = () => {
      parallaxTargetRef.current = { x: 0, y: 0 }
    }

    if (!parallaxEnabled) {
      reset()
      return undefined
    }

    const handleMove = (event) => {
      const width = window.innerWidth || 1
      const height = window.innerHeight || 1
      // Normalise to [-1, 1] with 0 at the viewport centre.
      parallaxTargetRef.current = {
        x: (event.clientX / width) * 2 - 1,
        y: (event.clientY / height) * 2 - 1,
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerleave', reset)
    document.addEventListener('pointerleave', reset)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerleave', reset)
      document.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [parallaxEnabled])

  // Push the eased parallax into the stage every frame. Values are eased here
  // rather than in the stage so the smoothing constants live next to the
  // interaction, and only the stage touches the camera.
  useEffect(() => {
    if (!parallaxEnabled) {
      stageRef.current?.setParallax(0, 0, 0)
      return undefined
    }

    let frame = 0
    let currentX = 0
    let currentY = 0
    let last = performance.now()

    const tick = (now) => {
      const delta = Math.min(Math.max((now - last) / 1000, 0), 0.05)
      last = now
      const target = parallaxTargetRef.current
      currentX = smoothStep(currentX, target.x, delta, 6)
      currentY = smoothStep(currentY, target.y, delta, 6)
      stageRef.current?.setParallax(currentX, currentY, parallaxAmount / 100)
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [parallaxEnabled, parallaxAmount])

  // Every widget write goes through the preset normalisers for the same reason
  // the loaders do: one clamp table, one migration path, and a value that means
  // the same thing in state, in storage and in model-presets.json.
  const updateClock = (patch) => {
    setClock((previous) => normalizeClockPreset({ ...previous, ...patch }, previous))
  }

  const updateSpectrum = (patch) => {
    setSpectrum((previous) => normalizeSpectrumPreset({ ...previous, ...patch }, previous))
  }

  const updateAlbumArt = (patch) => {
    setAlbumArt((previous) => normalizeAlbumPreset({ ...previous, ...patch }, previous))
  }

  return (
    <main
      className="viewer"
      style={{ backgroundColor: viewSettings.backgroundColor }}
    >
      <canvas
        ref={canvasRef}
        className="viewer__canvas"
        onPointerUp={handleCanvasPointerUp}
      />
      {/* The clock, spectrum and album card read engine audio and media data
          that a plain browser cannot provide, so a packaged wallpaper mounts
          them only inside Wallpaper Engine. The browser preview mounts the same
          widgets on synthetic audio and a demo track, which is what lets their
          settings be tuned without packaging. The widgets themselves live in
          WallKit; ControlOverlays feeds them. */}
      {widgetsAvailable && (
        <ControlOverlays
          clock={clock}
          spectrum={spectrum}
          albumArt={albumArt}
          language={language}
          t={t}
          preview={widgetPreview}
          onToggleHourFormat={() =>
            setClock((prev) => ({ ...prev, use24Hour: !prev.use24Hour }))
          }
        />
      )}
      {debugOpen && (
        <div className="debug-hud">
          <section
            id="debug-panel"
            className="debug-panel"
            aria-label={t('debug.title')}
          >
            <header className="debug-panel__header">
              <span className="debug-panel__title">{t('debug.title')}</span>
              <span className="debug-panel__hint">{t('debug.closeHint')}</span>
            </header>
            <dl className="debug-panel__list">
              <div className={`debug-panel__row${isError ? ' is-error' : ''}`}>
                <dt>{t('debug.status')}</dt>
                <dd>{status}</dd>
              </div>
              {debugInfo.map(({ label, value }) => (
                <div className="debug-panel__row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
      {isDrawerOpen && (
        <div
          className="inspector-backdrop"
          aria-hidden="true"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
      <button
        type="button"
        className={`viewer__settings-button${isDrawerOpen ? ' is-open' : ''}`}
        onClick={() => setIsDrawerOpen((open) => !open)}
        aria-expanded={isDrawerOpen}
        aria-controls="settings-drawer"
        aria-label={
          isDrawerOpen ? t('viewer.closeSettings') : t('viewer.openSettings')
        }
        title={isDrawerOpen ? t('viewer.closeSettings') : t('viewer.openSettings')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2.75 12s3.4-6 9.25-6 9.25 6 9.25 6-3.4 6-9.25 6-9.25-6-9.25-6Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <SettingsDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        settings={viewSettings}
        onChange={updateViewSettings}
        animations={animations}
        currentAnimation={currentAnimation}
        onAnimationChange={handleAnimationChange}
        models={models}
        selectedModelId={selectedModel?.id ?? ''}
        onModelChange={handleModelChange}
        debugOpen={debugOpen}
        onDebugChange={setDebugOpen}
        clock={clock}
        onClockChange={updateClock}
        spectrum={spectrum}
        onSpectrumChange={updateSpectrum}
        albumArt={albumArt}
        onAlbumArtChange={updateAlbumArt}
        inWallpaperEngine={inWallpaperEngine}
        widgetsAvailable={widgetsAvailable}
        status={status}
        isError={isError}
        modelId={selectedModel?.id ?? ''}
        recommendedView={currentRecommendedView}
        onRecordView={handleRecordView}
        onCopyPreset={handleCopyPreset}
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />
    </main>
  )
}
