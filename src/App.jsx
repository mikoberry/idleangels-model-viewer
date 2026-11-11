import { useEffect, useRef, useState } from 'react'
import SettingsDrawer from './SettingsDrawer.jsx'
import { startSpineStage } from './spineStage.js'

const EYE_HINT_KEY = 'spine-viewer:eye-hint:v1'

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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [showEyeHint, setShowEyeHint] = useState(() => !hasSeenEyeHint())
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugInfo, setDebugInfo] = useState([])
  const [animations, setAnimations] = useState([])
  const [currentAnimation, setCurrentAnimation] = useState('idle')
  const [viewSettings, setViewSettings] = useState({
    scale: 2.4,
    positionX: -30,
    positionY: -27,
    backgroundColor: '#06070d',
    clickToAction: true,
  })

  const viewSettingsRef = useRef(viewSettings)
  viewSettingsRef.current = viewSettings

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let disposed = false
    let disposeStage = () => {}

    startSpineStage(canvas, {
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
        const current = viewSettingsRef.current
        stage.setView(
          current.scale,
          current.positionX / 100,
          current.positionY / 100,
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
  }, [])

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
      <div className="debug-hud">
        <button
          type="button"
          className={`viewer__status${isError ? ' is-error' : ''}`}
          onClick={() => setDebugOpen((open) => !open)}
          aria-expanded={debugOpen}
          aria-controls="debug-panel"
          title={status}
        >
          <span>log</span>
          <span
            className={`viewer__status-chevron${debugOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          />
        </button>
        {debugOpen && (
          <section id="debug-panel" className="debug-panel" aria-label="log">
            <header className="debug-panel__header">
              <span className="debug-panel__title">log</span>
              <span className="debug-panel__hint">再次点击状态栏收起</span>
            </header>
            <dl className="debug-panel__list">
              {debugInfo.map(({ label, value }) => (
                <div className="debug-panel__row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
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
      {showEyeHint && !isDrawerOpen && (
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
      />
    </main>
  )
}
