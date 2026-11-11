import { useEffect, useRef, useState } from 'react'
import SettingsDrawer from './SettingsDrawer.jsx'
import { startSpineStage } from './spineStage.js'

const EYE_HINT_KEY = 'spine-viewer:eye-hint:v1'
const MODEL_VIEWS_KEY = 'spine-viewer:model-views:v1'

function hasSeenEyeHint() {
  try {
    return window.localStorage.getItem(EYE_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function markEyeHintSeen() {
  try {
    window.localStorage.setItem(EYE_HINT_KEY, '1')
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

function formatBrowser(userAgent) {
  const version = (pattern) => userAgent.match(pattern)?.[1] ?? ''
  if (userAgent.includes('Edg/')) return `Edge ${version(/Edg\/([\d.]+)/)}`.trim()
  if (userAgent.includes('OPR/')) return `Opera ${version(/OPR\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Chrome/')) return `Chrome ${version(/Chrome\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Firefox/')) return `Firefox ${version(/Firefox\/([\d.]+)/)}`.trim()
  if (userAgent.includes('Version/') && userAgent.includes('Safari')) {
    return `Safari ${version(/Version\/([\d.]+)/)}`.trim()
  }
  return '未知'
}

function readWebglInfo(canvas) {
  if (!canvas) return '未就绪'

  let gl
  try {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  } catch {
    return '不可用'
  }
  if (!gl) return '不可用'

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

function loadJson(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'text'
    request.onload = () => {
      if (request.status !== 200 && request.status !== 0) {
        reject(new Error(`模型清单加载失败：HTTP ${request.status}`))
        return
      }

      try {
        resolve(JSON.parse(request.responseText))
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(new Error('模型清单加载失败：网络请求错误'))
    request.send()
  })
}

function collectDebugInfo(canvas) {
  const userAgent = navigator.userAgent
  const weApi = window.wallpaperPropertyListener
    ? 'wallpaperPropertyListener'
    : typeof window.wallpaperRegisterAudioListener === 'function'
      ? 'wallpaperRegisterAudioListener'
      : '未检测到'
  const isWallpaperEngine =
    weApi !== '未检测到' || /wallpaper[\s_-]*engine/i.test(userAgent)

  return [
    { label: '运行环境', value: isWallpaperEngine ? 'Wallpaper Engine' : '浏览器' },
    { label: '浏览器', value: formatBrowser(userAgent) },
    { label: '窗口', value: `${window.innerWidth} × ${window.innerHeight}` },
    { label: 'Canvas', value: canvas ? `${canvas.width} × ${canvas.height}` : '未就绪' },
    { label: '屏幕', value: `${screen.width} × ${screen.height}` },
    { label: '可用屏幕', value: `${screen.availWidth} × ${screen.availHeight}` },
    { label: '像素比', value: String(window.devicePixelRatio) },
    {
      label: 'CPU 线程',
      value: navigator.hardwareConcurrency
        ? String(navigator.hardwareConcurrency)
        : '未知',
    },
    {
      label: '设备内存',
      value: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '未知',
    },
    { label: '平台', value: navigator.platform || '未知' },
    { label: '语言', value: navigator.language || '未知' },
    { label: 'WebGL', value: readWebglInfo(canvas) },
    { label: 'WE API', value: weApi },
    { label: '页面', value: window.location.href },
    { label: 'User Agent', value: userAgent },
  ]
}

export default function App() {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const [status, setStatus] = useState('正在启动 React 外壳…')
  const [isError, setIsError] = useState(false)
  const inWallpaperEngine = isWallpaperEngineEnvironment()
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => !inWallpaperEngine)
  const [showEyeHint, setShowEyeHint] = useState(() => !hasSeenEyeHint())
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
  }))
  const [recordedViews, setRecordedViews] = useState(loadModelViews)
  const modelViewsRef = useRef(recordedViews)

  const recordModelView = (id, view) => {
    if (!id) return false

    const next = {
      ...modelViewsRef.current,
      [id]: {
        scale: view.scale,
        positionX: view.positionX,
        positionY: view.positionY,
        backgroundColor: view.backgroundColor,
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
      setStatus('正在加载模型清单…')
      setIsError(false)

      try {
        const manifestUrl = new URL('spine/models/manifest.json', document.baseURI)
        const data = await loadJson(manifestUrl.href)
        if (!Array.isArray(data.models) || data.models.length === 0) {
          throw new Error('模型清单为空')
        }

        if (cancelled) return
        setModels(data.models)
        setSelectedModelId(data.models[0].id)
        setStatus(`模型清单已加载 · ${data.models.length} 个模型`)
      } catch (error) {
        if (cancelled) return
        console.error(error)
        setStatus(error instanceof Error ? error.message : String(error))
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
      onStatus: (text, error = false) => {
        if (disposed) return
        setStatus(text)
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
        const recorded = modelViewsRef.current[selectedModel.id]
        const initialView = recorded
          ? { ...currentRecommendedView, ...recorded }
          : currentRecommendedView

        setViewSettings((current) => ({
          ...current,
          ...initialView,
        }))
        stage.setView(
          initialView.scale,
          initialView.positionX / 100,
          initialView.positionY / 100,
        )
        disposeStage = stage.dispose
      })
      .catch((error) => {
        if (disposed) return
        console.error(error)
        setStatus(error instanceof Error ? error.message : String(error))
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

    const update = () => setDebugInfo(collectDebugInfo(canvasRef.current))
    update()
    window.addEventListener('resize', update)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
    }
  }, [debugOpen])

  const dismissEyeHint = (openDrawer = false) => {
    setShowEyeHint(false)
    markEyeHintSeen()
    if (openDrawer) setIsDrawerOpen(true)
  }

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

  const handleCanvasPointerUp = (event) => {
    if (isDrawerOpen || !viewSettings.clickToAction) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    stageRef.current?.triggerAction()
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
      {debugOpen && (
        <div className="debug-hud">
          <section id="debug-panel" className="debug-panel" aria-label="调试信息">
            <header className="debug-panel__header">
              <span className="debug-panel__title">调试信息</span>
              <span className="debug-panel__hint">可在播放设置中关闭</span>
            </header>
            <dl className="debug-panel__list">
              <div className={`debug-panel__row${isError ? ' is-error' : ''}`}>
                <dt>状态</dt>
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
        className={`viewer__settings-button${isDrawerOpen ? ' is-open' : ''}${showEyeHint ? ' is-hinting' : ''}`}
        onClick={() => {
          if (showEyeHint) dismissEyeHint()
          setIsDrawerOpen((open) => !open)
        }}
        aria-expanded={isDrawerOpen}
        aria-controls="settings-drawer"
        aria-label={isDrawerOpen ? '关闭设置' : '打开设置'}
        title={isDrawerOpen ? '关闭设置' : '打开设置'}
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
      {showEyeHint && (
        <aside className="eye-hint" role="status">
          <p className="eye-hint__text">点击小眼睛可以打开设置</p>
          <button
            type="button"
            className="eye-hint__button"
            onClick={() => dismissEyeHint(true)}
          >
            我知道了
          </button>
          <span className="eye-hint__arrow" aria-hidden="true" />
        </aside>
      )}
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
        status={status}
        isError={isError}
        modelId={selectedModel?.id ?? ''}
        recommendedView={currentRecommendedView}
        recordedViews={recordedViews}
        onRecordView={handleRecordView}
      />
    </main>
  )
}
