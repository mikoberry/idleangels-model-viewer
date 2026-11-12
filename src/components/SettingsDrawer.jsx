import * as Slider from '@radix-ui/react-slider'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../i18n.js'
import {
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_OFFSET_MAX,
  CLOCK_OFFSET_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
} from '../utils/clock.js'
import './SettingsDrawer.css'

const MIN_SCALE = 0.5

// Tabs of the settings drawer, rendered as a vertical menu on its left edge.
const DRAWER_TABS = ['clock', 'spectrum', 'model', 'other']
const DRAWER_TAB_KEY = 'spine-viewer:drawer-tab:v1'

// `display` was the single tab that used to hold both the clock and the
// spectrum; it now maps to the clock tab so an existing preference still opens
// a sensible pane after the split.
const LEGACY_TAB_ALIASES = { display: 'clock' }

function loadDrawerTab() {
  try {
    const saved = window.localStorage.getItem(DRAWER_TAB_KEY)
    if (DRAWER_TABS.includes(saved)) return saved
    if (saved && LEGACY_TAB_ALIASES[saved]) return LEGACY_TAB_ALIASES[saved]
  } catch {
    // Storage unavailable: fall back to the default tab.
  }
  return DRAWER_TABS[0]
}

function saveDrawerTab(tab) {
  try {
    window.localStorage.setItem(DRAWER_TAB_KEY, tab)
  } catch {
    // The tab still works for this session.
  }
}
const MAX_SCALE = 5
const POSITION_LIMIT = 100
// Swatches shown above the colour picker. They are muted on purpose: a wallpaper
// background sits behind artwork for hours, so these are desaturated versions of
// recognisable hues rather than full-strength colours that would fight the model.
// Eight fills the swatch grid exactly and keeps the hues far enough apart to be
// told apart at a glance.
const BACKGROUND_PRESETS = [
  '#101217', // near-black
  '#1c2230', // midnight blue
  '#2c2436', // dusk violet
  '#4a5a6d', // slate blue
  '#1f2f2a', // deep pine
  '#7a6a55', // sand
  '#5f7b7a', // dusty teal
  '#c9d1e0', // pale steel
]
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function animationLabel(name, t) {
  if (name === 'idle') return t('animation.idle')
  if (name === 'action') return t('animation.action')
  return name
}

function normalizeHexColor(value) {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null
}

function hexToHsv(value) {
  const hex = normalizeHexColor(value) ?? '#000000'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0

  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToHex(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0

  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const toHex = (channel) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function formatOffset(value) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function ViewerSlider({ value, min, max, step, label, valueText, onChange }) {
  return (
    <Slider.Root
      className="viewer-slider"
      value={[value]}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onValueChange={(nextValues) => {
        const nextValue = nextValues[0]
        if (typeof nextValue === 'number') onChange(nextValue)
      }}
    >
      <Slider.Track className="viewer-slider__track">
        <Slider.Range className="viewer-slider__range" />
      </Slider.Track>
      <Slider.Thumb
        className="viewer-slider__thumb"
        aria-label={label}
        aria-valuetext={valueText}
      />
    </Slider.Root>
  )
}

function StepControl({
  label,
  onStep,
  canDecrease,
  canIncrease,
  children,
  t,
}) {
  return (
    <div className="step-control">
      <button
        type="button"
        className="step-button"
        aria-label={t('step.decreaseAria', { label })}
        disabled={!canDecrease}
        onClick={() => onStep(-1)}
      >
        −
      </button>
      {children}
      <button
        type="button"
        className="step-button"
        aria-label={t('step.increaseAria', { label })}
        disabled={!canIncrease}
        onClick={() => onStep(1)}
      >
        +
      </button>
    </div>
  )
}

function ModelSelect({ models, value, onChange, active, t }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const selected = models.find((model) => model.id === value)

  useEffect(() => {
    if (!active) setMenuOpen(false)
  }, [active])

  useEffect(() => {
    if (!menuOpen) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const normalizedQuery = query.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const filteredModels = normalizedQuery
    ? models.filter((model) => {
        const searchText = [
          model.id,
          model.label,
          ...(model.layers ?? []).flatMap((layer) => [
            layer.skeleton,
            layer.atlas,
            layer.texture,
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[\s_-]+/g, '')

        return searchText.includes(normalizedQuery)
      })
    : models

  return (
    <div className={`model-select${menuOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="model-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label={t('model.select')}
        disabled={models.length === 0}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span className="model-select__label">
          {selected?.label ??
            (models.length > 0 ? t('model.select') : t('model.notLoaded'))}
        </span>
        <span className="model-select__count">{models.length}</span>
        <span className="model-select__chevron" aria-hidden="true" />
      </button>

      {menuOpen && (
        <div className="model-select__menu">
          <input
            className="model-select__search"
            type="search"
            value={query}
            placeholder={t('model.searchPlaceholder')}
            aria-label={t('model.searchAria')}
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div
            className="model-select__list"
            role="listbox"
            aria-label={t('model.listAria')}
          >
            {filteredModels.length === 0 ? (
              <p className="model-select__empty">{t('model.empty')}</p>
            ) : (
              filteredModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={model.id === selected?.id}
                  className={`model-select__option${model.id === selected?.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(model.id)
                    setMenuOpen(false)
                  }}
                >
                  {model.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AnimationSelect({ animations, value, onChange, active, t }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!active) setMenuOpen(false)
  }, [active])

  useEffect(() => {
    if (!menuOpen) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const selected = animations.includes(value) ? value : (animations[0] ?? '')

  return (
    <div className={`animation-select${menuOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="animation-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        disabled={animations.length === 0}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span>
          {animations.length === 0
            ? t('animation.loading')
            : animationLabel(selected, t)}
        </span>
        <span className="animation-select__chevron" aria-hidden="true" />
      </button>

      {menuOpen && (
        <div
          className="animation-select__menu"
          role="listbox"
          aria-label={t('animation.listAria')}
        >
          {animations.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={name === selected}
              className={`animation-select__option${name === selected ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(name)
                setMenuOpen(false)
              }}
            >
              {animationLabel(name, t)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BackgroundColorField({ value, onChange, t }) {
  const [draft, setDraft] = useState(value)
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const lastEmittedRef = useRef(null)

  useEffect(() => {
    if (value === lastEmittedRef.current) return
    setDraft(value)
    setHsv(hexToHsv(value))
  }, [value])

  function emitColor(nextHsv) {
    const next = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v)
    setHsv(nextHsv)
    setDraft(next)
    lastEmittedRef.current = next
    onChange(next)
  }

  function commitColor() {
    const next = normalizeHexColor(draft)
    if (!next) {
      setDraft(value)
      setHsv(hexToHsv(value))
      return
    }

    setDraft(next)
    setHsv(hexToHsv(next))
    lastEmittedRef.current = next
    onChange(next)
  }

  function selectSwatch(color) {
    setDraft(color)
    setHsv(hexToHsv(color))
    lastEmittedRef.current = color
    onChange(color)
  }

  function updateAreaFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    emitColor({ h: hsv.h, s: x / rect.width, v: 1 - y / rect.height })
  }

  function updateHueFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const h = Math.min((x / rect.width) * 360, 359.999)
    emitColor({ h, s: hsv.s, v: hsv.v })
  }

  function beginPointerDrag(event, update) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    update(event)
  }

  function continuePointerDrag(event, update) {
    const hasCapture = event.currentTarget.hasPointerCapture?.(event.pointerId)
    if (!hasCapture && event.buttons !== 1) return
    update(event)
  }

  return (
    <div className="color-field">
      <div
        className="color-swatches"
        role="group"
        aria-label={t('background.presetsAria')}
      >
        {BACKGROUND_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch${color === value ? ' is-active' : ''}`}
            style={{ backgroundColor: color }}
            title={color}
            aria-label={t('background.swatchAria', { color })}
            aria-pressed={color === value}
            onClick={() => selectSwatch(color)}
          />
        ))}
      </div>

      <div className="color-picker">
        <div
          className="color-picker__area"
          style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
          role="slider"
          aria-label={t('background.saturationAria')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          onPointerDown={(event) => beginPointerDrag(event, updateAreaFromPointer)}
          onPointerMove={(event) => continuePointerDrag(event, updateAreaFromPointer)}
        >
          <span
            className="color-picker__thumb"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
            }}
          />
        </div>
        <div
          className="color-picker__hue"
          role="slider"
          aria-label={t('background.hueAria')}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={(event) => beginPointerDrag(event, updateHueFromPointer)}
          onPointerMove={(event) => continuePointerDrag(event, updateHueFromPointer)}
        >
          <span
            className="color-picker__hue-thumb"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>

      <div className="color-control">
        <span
          className="color-preview"
          style={{ backgroundColor: normalizeHexColor(draft) ?? value }}
          aria-hidden="true"
        />
        <input
          className="color-value"
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          aria-label={t('background.hexAria')}
          onChange={(event) => {
            const next = event.currentTarget.value
            setDraft(next)
            const normalized = normalizeHexColor(next)
            if (normalized) {
              setHsv(hexToHsv(normalized))
              lastEmittedRef.current = normalized
              onChange(normalized)
            }
          }}
          onBlur={commitColor}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitColor()
            }
          }}
        />
      </div>
    </div>
  )
}

export default function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  animations,
  currentAnimation,
  onAnimationChange,
  models,
  selectedModelId,
  onModelChange,
  debugOpen,
  onDebugChange,
  clock,
  onClockChange,
  spectrum,
  onSpectrumChange,
  albumArt,
  onAlbumArtChange,
  inWallpaperEngine,
  status,
  isError,
  modelId,
  recommendedView,
  onRecordView,
  onCopyPreset,
  language,
  onLanguageChange,
  t,
}) {
  // The drawer is split into tabs shown as a vertical menu on the left. This
  // keeps each pane short enough to avoid relying on scrolling, which is
  // unreliable inside Wallpaper Engine.
  const [activeTab, setActiveTab] = useState(() => loadDrawerTab())
  const [recordState, setRecordState] = useState('idle')
  const [presetCopyState, setPresetCopyState] = useState('idle')
  const [scaleInput, setScaleInput] = useState(() =>
    String(Math.round(settings.scale * 100)),
  )
  const [positionXInput, setPositionXInput] = useState(() =>
    String(Math.round(settings.positionX)),
  )
  const [positionYInput, setPositionYInput] = useState(() =>
    String(Math.round(settings.positionY)),
  )

  useEffect(() => {
    saveDrawerTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    setScaleInput(String(Math.round(settings.scale * 100)))
  }, [settings.scale])

  useEffect(() => {
    setPositionXInput(String(Math.round(settings.positionX)))
  }, [settings.positionX])

  useEffect(() => {
    setPositionYInput(String(Math.round(settings.positionY)))
  }, [settings.positionY])

  function setScalePercent(percent) {
    const nextPercent = Math.min(
      Math.max(Math.round(percent), MIN_SCALE * 100),
      MAX_SCALE * 100,
    )
    setScaleInput(String(nextPercent))
    onChange({ scale: nextPercent / 100 })
  }

  function commitScaleInput() {
    const trimmed = scaleInput.trim()
    if (trimmed === '') {
      setScaleInput(String(Math.round(settings.scale * 100)))
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setScaleInput(String(Math.round(settings.scale * 100)))
      return
    }

    setScalePercent(parsed)
  }

  function setPositionPercent(key, percent, setInput) {
    const next = Math.min(
      Math.max(Math.round(percent), -POSITION_LIMIT),
      POSITION_LIMIT,
    )
    setInput(String(next))
    onChange({ [key]: next })
  }

  function stepPosition(key, delta, setInput) {
    setPositionPercent(key, Math.round(settings[key]) + delta, setInput)
  }

  function commitPositionInput(key, value, setInput) {
    const trimmed = value.trim()
    if (trimmed === '') {
      setInput(String(Math.round(settings[key])))
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setInput(String(Math.round(settings[key])))
      return
    }

    setPositionPercent(key, parsed, setInput)
  }

  function resetView(next) {
    setScaleInput(String(Math.round(next.scale * 100)))
    setPositionXInput(String(next.positionX))
    setPositionYInput(String(next.positionY))
    onChange(next)
  }

  function recordCurrentView() {
    const recorded = onRecordView?.() ?? false
    setRecordState(recorded ? 'recorded' : 'error')
    window.setTimeout(() => setRecordState('idle'), 2000)
  }

  // Copies the complete current setup (view + clock + spectrum + album card) for
  // the selected model, ready to paste into model-presets.json. This is the step
  // that turns browser tuning into the packaged default.
  async function copyCurrentPreset() {
    const ok = (await onCopyPreset?.()) ?? false
    setPresetCopyState(ok ? 'copied' : 'error')
    window.setTimeout(() => setPresetCopyState('idle'), 2000)
  }

  const scalePercent = Math.round(settings.scale * 100)

  return (
    <aside
      id="settings-drawer"
      className={`playback-inspector${open ? ' is-open' : ''}`}
      inert={open ? undefined : ''}
      aria-hidden={!open}
      aria-label={t('drawer.title')}
    >
      <header className="inspector-header">
        <h2 className="inspector-title">{t('drawer.title')}</h2>
      </header>

      <div className="inspector-body">
        <nav className="inspector-nav" aria-label={t('drawer.tabsAria')}>
          {DRAWER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`inspector-nav__item${activeTab === tab ? ' is-active' : ''}`}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {t(`drawer.tab.${tab}`)}
            </button>
          ))}

          {/* Language and collapse sit at the foot of the menu column, sharing
              the same flat text treatment as the tabs. */}
          <div className="inspector-nav__spacer" aria-hidden="true" />

          <div
            className="inspector-nav__languages"
            role="group"
            aria-label={t('drawer.language')}
          >
            {LANGUAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspector-nav__lang${language === item.id ? ' is-active' : ''}`}
                aria-pressed={language === item.id}
                onClick={() => onLanguageChange(item.id)}
                title={item.label}
              >
                {item.short}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="inspector-nav__close"
            onClick={onClose}
            aria-label={t('drawer.collapse')}
            title={t('drawer.collapse')}
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
              {/* A right-facing chevron with a trailing edge: the panel
                  collapses back to the right side of the screen. */}
              <path d="M9 6l6 6-6 6" />
              <path d="M19 5v14" />
            </svg>
            <span>{t('drawer.collapse')}</span>
          </button>
        </nav>

        <div className="inspector-pane">
          {activeTab === 'model' && !inWallpaperEngine && (
            <section className="inspector-section">
          <span className="inspector-section__title">{t('drawer.model')}</span>
          <ModelSelect
            models={models}
            value={selectedModelId}
            onChange={onModelChange}
            active={open}
            t={t}
          />
          <div className="inspector-model-hints">
            <p className="inspector-hint">
              {t('drawer.modelHint', { count: models.length })}
            </p>
            <p className="inspector-hint">
              {t('drawer.heroNamesHint')}{' '}
              <a
                href="https://github.com/mikoberry/idleangels-model-viewer/blob/main/heroes_multilang.csv"
                target="_blank"
                rel="noreferrer"
              >
                {t('drawer.heroNamesSource')}
              </a>
            </p>
            <p className="inspector-hint">
              {t('drawer.modelDeployHint')}{' '}
              <a
                href="https://github.com/mikoberry/idleangels-model-viewer/tree/main/model-library"
                target="_blank"
                rel="noreferrer"
              >
                {t('drawer.modelSource')}
              </a>
            </p>
            <p className="inspector-hint">{t('drawer.modelUpdateHint')}</p>
          </div>
        </section>
      )}

      {activeTab === 'model' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.animation')}</span>
        <AnimationSelect
          animations={animations}
          value={currentAnimation}
          onChange={onAnimationChange}
          active={open}
          t={t}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.clickToAction}
            onChange={(event) => onChange({ clickToAction: event.currentTarget.checked })}
          />
          <span>{t('clickAction.label')}</span>
        </label>
        <p className="inspector-hint">{t('drawer.animationHint')}</p>
      </section>
      )}

      {activeTab === 'model' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.transform')}</span>

        <p className="inspector-note" aria-label={t('transform.noteLabel')}>
          {t('drawer.transformHint')}
        </p>

        <div className="reset-row">
          <button
            type="button"
            className="reset-button"
            title={t('reset.initialTitle')}
            onClick={() => resetView({ scale: 1, positionX: 0, positionY: 0 })}
          >
            {t('reset.initial')}
          </button>
          <button
            type="button"
            className="reset-button"
            title={t('reset.recommendedTitle', {
              scale: Math.round(recommendedView.scale * 100),
              x: recommendedView.positionX,
              y: recommendedView.positionY,
              bg: recommendedView.backgroundColor,
            })}
            onClick={() => resetView(recommendedView)}
          >
            {t('reset.recommended', {
              scale: Math.round(recommendedView.scale * 100),
              x: recommendedView.positionX,
              y: recommendedView.positionY,
            })}
          </button>
        </div>

        <button
          type="button"
          className={`copy-view-button record-view-button${recordState === 'error' ? ' is-error' : ''}`}
          disabled={!modelId}
          onClick={recordCurrentView}
        >
          {recordState === 'recorded'
            ? t('record.recorded')
            : recordState === 'error'
              ? t('record.error')
              : t('record.idle')}
        </button>

        <p className="inspector-hint">{t('drawer.recordHint')}</p>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">{t('field.scale')}</span>
            <StepControl
              label={t('field.scale')}
              onStep={(delta) => setScalePercent(scalePercent + delta)}
              canDecrease={scalePercent > MIN_SCALE * 100}
              canIncrease={scalePercent < MAX_SCALE * 100}
              t={t}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={MIN_SCALE * 100}
                  max={MAX_SCALE * 100}
                  step={1}
                  value={scaleInput}
                  aria-label={t('field.scalePercentAria')}
                  onChange={(event) => setScaleInput(event.currentTarget.value)}
                  onBlur={commitScaleInput}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitScaleInput()
                    }
                  }}
                />
                <span aria-hidden="true">%</span>
              </label>
            </StepControl>
          </div>
          <ViewerSlider
            value={settings.scale}
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            label={t('field.scaleSliderAria')}
            valueText={`${Math.round(settings.scale * 100)}%`}
            onChange={(scale) => onChange({ scale })}
          />
        </div>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">{t('field.positionX')}</span>
            <StepControl
              label={t('field.positionX')}
              onStep={(delta) => stepPosition('positionX', delta, setPositionXInput)}
              canDecrease={Math.round(settings.positionX) > -POSITION_LIMIT}
              canIncrease={Math.round(settings.positionX) < POSITION_LIMIT}
              t={t}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={-POSITION_LIMIT}
                  max={POSITION_LIMIT}
                  step={1}
                  value={positionXInput}
                  aria-label={t('field.positionXAria')}
                  onChange={(event) => setPositionXInput(event.currentTarget.value)}
                  onBlur={() =>
                    commitPositionInput('positionX', positionXInput, setPositionXInput)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitPositionInput('positionX', positionXInput, setPositionXInput)
                    }
                  }}
                />
                <span aria-hidden="true">%</span>
              </label>
            </StepControl>
          </div>
          <ViewerSlider
            value={settings.positionX}
            min={-POSITION_LIMIT}
            max={POSITION_LIMIT}
            step={1}
            label={t('field.positionX')}
            valueText={formatOffset(settings.positionX)}
            onChange={(positionX) => onChange({ positionX })}
          />
        </div>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">{t('field.positionY')}</span>
            <StepControl
              label={t('field.positionY')}
              onStep={(delta) => stepPosition('positionY', delta, setPositionYInput)}
              canDecrease={Math.round(settings.positionY) > -POSITION_LIMIT}
              canIncrease={Math.round(settings.positionY) < POSITION_LIMIT}
              t={t}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={-POSITION_LIMIT}
                  max={POSITION_LIMIT}
                  step={1}
                  value={positionYInput}
                  aria-label={t('field.positionYAria')}
                  onChange={(event) => setPositionYInput(event.currentTarget.value)}
                  onBlur={() =>
                    commitPositionInput('positionY', positionYInput, setPositionYInput)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitPositionInput('positionY', positionYInput, setPositionYInput)
                    }
                  }}
                />
                <span aria-hidden="true">%</span>
              </label>
            </StepControl>
          </div>
          <ViewerSlider
            value={settings.positionY}
            min={-POSITION_LIMIT}
            max={POSITION_LIMIT}
            step={1}
            label={t('field.positionY')}
            valueText={formatOffset(settings.positionY)}
            onChange={(positionY) => onChange({ positionY })}
          />
        </div>

        <p className="inspector-hint">{t('drawer.rangeHint')}</p>
      </section>
      )}

      {activeTab === 'model' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.background')}</span>
        <BackgroundColorField
          value={settings.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
          t={t}
        />
        <p className="inspector-hint">{t('drawer.backgroundHint')}</p>
      </section>
      )}

      {activeTab === 'clock' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.clock')}</span>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={clock.show}
            onChange={(event) => onClockChange({ show: event.currentTarget.checked })}
          />
          <span>{t('clock.show')}</span>
        </label>
        {clock.show && (
          <>
            <div className="clock-placement" role="group" aria-label={t('clock.placement')}>
              <span className="clock-placement__label">{t('clock.placement')}</span>
              <div className="clock-placement__options">
                {[
                  'minimal',
                  'cyberpunk',
                  'infobar',
                  'split',
                  'poster',
                  'card',
                  'bar',
                ].map((placement) => (
                  <button
                    key={placement}
                    type="button"
                    className={`clock-placement__option${clock.placement === placement ? ' is-active' : ''}`}
                    aria-pressed={clock.placement === placement}
                    onClick={() => onClockChange({ placement })}
                  >
                    {t(`clock.placement${placement.charAt(0).toUpperCase() + placement.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="clock-placement" role="group" aria-label={t('clock.theme')}>
              <span className="clock-placement__label">{t('clock.theme')}</span>
              <div className="clock-placement__options">
                {['dark', 'light'].map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`clock-placement__option${clock.theme === theme ? ' is-active' : ''}`}
                    aria-pressed={clock.theme === theme}
                    onClick={() => onClockChange({ theme })}
                  >
                    {t(`clock.theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="clock-placement" role="group" aria-label={t('clock.hourFormat')}>
              <span className="clock-placement__label">{t('clock.hourFormat')}</span>
              <div className="clock-placement__options">
                {[true, false].map((is24) => (
                  <button
                    key={String(is24)}
                    type="button"
                    className={`clock-placement__option${(clock.use24Hour !== false) === is24 ? ' is-active' : ''}`}
                    aria-pressed={(clock.use24Hour !== false) === is24}
                    onClick={() => onClockChange({ use24Hour: is24 })}
                  >
                    {is24 ? t('clock.hour24') : t('clock.hour12')}
                  </button>
                ))}
              </div>
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('clock.size')}</span>
                <StepControl
                  label={t('clock.size')}
                  onStep={(delta) => onClockChange({ size: clock.size + delta })}
                  canDecrease={clock.size > CLOCK_SIZE_MIN}
                  canIncrease={clock.size < CLOCK_SIZE_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_SIZE_MIN}
                      max={CLOCK_SIZE_MAX}
                      step={1}
                      value={Math.round(clock.size)}
                      aria-label={t('clock.sizeAria')}
                      onChange={(event) =>
                        onClockChange({ size: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={clock.size}
                min={CLOCK_SIZE_MIN}
                max={CLOCK_SIZE_MAX}
                step={1}
                label={t('clock.size')}
                valueText={`${Math.round(clock.size)}%`}
                onChange={(size) => onClockChange({ size })}
              />
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('clock.offsetX')}</span>
                <StepControl
                  label={t('clock.offsetX')}
                  onStep={(delta) => onClockChange({ offsetX: clock.offsetX + delta })}
                  canDecrease={Math.round(clock.offsetX) > CLOCK_OFFSET_MIN}
                  canIncrease={Math.round(clock.offsetX) < CLOCK_OFFSET_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_OFFSET_MIN}
                      max={CLOCK_OFFSET_MAX}
                      step={1}
                      value={Math.round(clock.offsetX)}
                      aria-label={t('clock.offsetXAria')}
                      onChange={(event) =>
                        onClockChange({ offsetX: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={clock.offsetX}
                min={CLOCK_OFFSET_MIN}
                max={CLOCK_OFFSET_MAX}
                step={1}
                label={t('clock.offsetX')}
                valueText={formatOffset(clock.offsetX)}
                onChange={(offsetX) => onClockChange({ offsetX })}
              />
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('clock.offsetY')}</span>
                <StepControl
                  label={t('clock.offsetY')}
                  onStep={(delta) => onClockChange({ offsetY: clock.offsetY + delta })}
                  canDecrease={Math.round(clock.offsetY) > CLOCK_OFFSET_MIN}
                  canIncrease={Math.round(clock.offsetY) < CLOCK_OFFSET_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_OFFSET_MIN}
                      max={CLOCK_OFFSET_MAX}
                      step={1}
                      value={Math.round(clock.offsetY)}
                      aria-label={t('clock.offsetYAria')}
                      onChange={(event) =>
                        onClockChange({ offsetY: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={clock.offsetY}
                min={CLOCK_OFFSET_MIN}
                max={CLOCK_OFFSET_MAX}
                step={1}
                label={t('clock.offsetY')}
                valueText={formatOffset(clock.offsetY)}
                onChange={(offsetY) => onClockChange({ offsetY })}
              />
            </div>

            <p className="inspector-hint">{t('clock.offsetHint')}</p>

            <div className="inspector-field inspector-field--split">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={clock.reactToBeat === true}
                  onChange={(event) =>
                    onClockChange({ reactToBeat: event.currentTarget.checked })
                  }
                />
                <span>{t('clock.reactToBeat')}</span>
              </label>
              <StepControl
                label={t('clock.beatIntensity')}
                onStep={(delta) => onClockChange({ beatIntensity: clock.beatIntensity + delta })}
                canDecrease={
                  clock.reactToBeat === true &&
                  clock.beatIntensity > CLOCK_BEAT_INTENSITY_MIN
                }
                canIncrease={
                  clock.reactToBeat === true &&
                  clock.beatIntensity < CLOCK_BEAT_INTENSITY_MAX
                }
                t={t}
              >
                <label className="scale-input">
                  <input
                    className="viewer-number"
                    type="number"
                    min={CLOCK_BEAT_INTENSITY_MIN}
                    max={CLOCK_BEAT_INTENSITY_MAX}
                    step={1}
                    value={Math.round(clock.beatIntensity)}
                    aria-label={t('clock.beatIntensityAria')}
                    disabled={clock.reactToBeat !== true}
                    onChange={(event) =>
                      onClockChange({ beatIntensity: Number(event.currentTarget.value) })
                    }
                  />
                  <span aria-hidden="true">%</span>
                </label>
              </StepControl>
            </div>
            <ViewerSlider
              value={clock.beatIntensity}
              min={CLOCK_BEAT_INTENSITY_MIN}
              max={CLOCK_BEAT_INTENSITY_MAX}
              step={1}
              label={t('clock.beatIntensity')}
              valueText={`${Math.round(clock.beatIntensity)}%`}
              onChange={(beatIntensity) => onClockChange({ beatIntensity })}
            />
            <p className="inspector-hint">{t('clock.reactToBeatHint')}</p>
          </>
        )}
      </section>
      )}

      {activeTab === 'spectrum' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.spectrum')}</span>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={spectrum.show === true}
            onChange={(event) => onSpectrumChange({ show: event.currentTarget.checked })}
          />
          <span>{t('spectrum.show')}</span>
        </label>
        {spectrum.show && (
          <>
            <div className="clock-placement" role="group" aria-label={t('spectrum.style')}>
              <span className="clock-placement__label">{t('spectrum.style')}</span>
              <div className="clock-placement__options">
                {[
                  ['bars', 'Bars'],
                  ['mirror', 'Mirror'],
                  ['curve', 'Curve'],
                  ['ring', 'Ring'],
                  ['ringwave', 'Ringwave'],
                  ['dots', 'Dots'],
                  ['ripples', 'Ripples'],
                  ['aurora', 'Aurora'],
                ].map(([value, key]) => (
                  <button
                    key={value}
                    type="button"
                    className={`clock-placement__option${(spectrum.style ?? 'bars') === value ? ' is-active' : ''}`}
                    aria-pressed={(spectrum.style ?? 'bars') === value}
                    onClick={() => onSpectrumChange({ style: value })}
                  >
                    {t(`spectrum.style${key}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="clock-placement" role="group" aria-label={t('spectrum.position')}>
              <span className="clock-placement__label">{t('spectrum.position')}</span>
              <div className="clock-placement__options">
                {['bottom', 'top'].map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={`clock-placement__option${spectrum.position === position ? ' is-active' : ''}`}
                    aria-pressed={spectrum.position === position}
                    onClick={() => onSpectrumChange({ position })}
                  >
                    {t(position === 'bottom' ? 'spectrum.positionBottom' : 'spectrum.positionTop')}
                  </button>
                ))}
              </div>
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('spectrum.height')}</span>
                <StepControl
                  label={t('spectrum.height')}
                  onStep={(delta) => onSpectrumChange({ height: spectrum.height + delta })}
                  canDecrease={spectrum.height > 8}
                  canIncrease={spectrum.height < 60}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={8}
                      max={60}
                      step={1}
                      value={Math.round(spectrum.height)}
                      aria-label={t('spectrum.heightAria')}
                      onChange={(event) =>
                        onSpectrumChange({ height: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={spectrum.height}
                min={8}
                max={60}
                step={1}
                label={t('spectrum.height')}
                valueText={`${Math.round(spectrum.height)}%`}
                onChange={(height) => onSpectrumChange({ height })}
              />
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('spectrum.offsetX')}</span>
                <StepControl
                  label={t('spectrum.offsetX')}
                  onStep={(delta) => onSpectrumChange({ offsetX: spectrum.offsetX + delta })}
                  canDecrease={Math.round(spectrum.offsetX) > CLOCK_OFFSET_MIN}
                  canIncrease={Math.round(spectrum.offsetX) < CLOCK_OFFSET_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_OFFSET_MIN}
                      max={CLOCK_OFFSET_MAX}
                      step={1}
                      value={Math.round(spectrum.offsetX)}
                      aria-label={t('spectrum.offsetXAria')}
                      onChange={(event) =>
                        onSpectrumChange({ offsetX: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={spectrum.offsetX}
                min={CLOCK_OFFSET_MIN}
                max={CLOCK_OFFSET_MAX}
                step={1}
                label={t('spectrum.offsetX')}
                valueText={formatOffset(spectrum.offsetX)}
                onChange={(offsetX) => onSpectrumChange({ offsetX })}
              />
            </div>

            <div className="inspector-field">
              <span className="inspector-field__label">{t('spectrum.color')}</span>
              <BackgroundColorField
                value={spectrum.color}
                onChange={(color) => onSpectrumChange({ color })}
                t={t}
              />
            </div>

            <p className="inspector-hint">{t('spectrum.hint')}</p>
          </>
        )}
      </section>
      )}

      {activeTab === 'spectrum' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.albumArt')}</span>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={albumArt.show === true}
            onChange={(event) => onAlbumArtChange({ show: event.currentTarget.checked })}
          />
          <span>{t('albumArt.label')}</span>
        </label>
        {albumArt.show && (
          <>
            <div className="clock-placement" role="group" aria-label={t('albumArt.style')}>
              <span className="clock-placement__label">{t('albumArt.style')}</span>
              <div className="clock-placement__options">
                {[
                  ['classic', 'Classic'],
                  ['glass', 'Glass'],
                  ['vinyl', 'Vinyl'],
                  ['minimal', 'Minimal'],
                  ['bar', 'Bar'],
                  ['wall', 'Wall'],
                ].map(([value, key]) => (
                  <button
                    key={value}
                    type="button"
                    className={`clock-placement__option${(albumArt.style ?? 'classic') === value ? ' is-active' : ''}`}
                    aria-pressed={(albumArt.style ?? 'classic') === value}
                    onClick={() => onAlbumArtChange({ style: value })}
                  >
                    {t(`albumArt.style${key}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="clock-placement" role="group" aria-label={t('albumArt.corner')}>
              <span className="clock-placement__label">{t('albumArt.corner')}</span>
              <div className="clock-placement__options">
                {['bottom-right', 'bottom-left', 'top-right', 'top-left'].map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    className={`clock-placement__option${albumArt.corner === corner ? ' is-active' : ''}`}
                    aria-pressed={albumArt.corner === corner}
                    onClick={() => onAlbumArtChange({ corner })}
                  >
                    {t(
                      `albumArt.corner${
                        corner === 'bottom-right'
                          ? 'BottomRight'
                          : corner === 'bottom-left'
                            ? 'BottomLeft'
                            : corner === 'top-right'
                              ? 'TopRight'
                              : 'TopLeft'
                      }`,
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('albumArt.size')}</span>
                <StepControl
                  label={t('albumArt.size')}
                  onStep={(delta) => onAlbumArtChange({ size: albumArt.size + delta })}
                  canDecrease={albumArt.size > 10}
                  canIncrease={albumArt.size < 40}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={10}
                      max={40}
                      step={1}
                      value={Math.round(albumArt.size)}
                      aria-label={t('albumArt.sizeAria')}
                      onChange={(event) =>
                        onAlbumArtChange({ size: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={albumArt.size}
                min={10}
                max={40}
                step={1}
                label={t('albumArt.size')}
                valueText={`${Math.round(albumArt.size)}%`}
                onChange={(size) => onAlbumArtChange({ size })}
              />
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('albumArt.offsetX')}</span>
                <StepControl
                  label={t('albumArt.offsetX')}
                  onStep={(delta) => onAlbumArtChange({ offsetX: albumArt.offsetX + delta })}
                  canDecrease={Math.round(albumArt.offsetX) > CLOCK_OFFSET_MIN}
                  canIncrease={Math.round(albumArt.offsetX) < CLOCK_OFFSET_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_OFFSET_MIN}
                      max={CLOCK_OFFSET_MAX}
                      step={1}
                      value={Math.round(albumArt.offsetX)}
                      aria-label={t('albumArt.offsetXAria')}
                      onChange={(event) =>
                        onAlbumArtChange({ offsetX: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={albumArt.offsetX}
                min={CLOCK_OFFSET_MIN}
                max={CLOCK_OFFSET_MAX}
                step={1}
                label={t('albumArt.offsetX')}
                valueText={formatOffset(albumArt.offsetX)}
                onChange={(offsetX) => onAlbumArtChange({ offsetX })}
              />
            </div>

            <div className="inspector-field">
              <div className="inspector-field inspector-field--split">
                <span className="inspector-field__label">{t('albumArt.offsetY')}</span>
                <StepControl
                  label={t('albumArt.offsetY')}
                  onStep={(delta) => onAlbumArtChange({ offsetY: albumArt.offsetY + delta })}
                  canDecrease={Math.round(albumArt.offsetY) > CLOCK_OFFSET_MIN}
                  canIncrease={Math.round(albumArt.offsetY) < CLOCK_OFFSET_MAX}
                  t={t}
                >
                  <label className="scale-input">
                    <input
                      className="viewer-number"
                      type="number"
                      min={CLOCK_OFFSET_MIN}
                      max={CLOCK_OFFSET_MAX}
                      step={1}
                      value={Math.round(albumArt.offsetY)}
                      aria-label={t('albumArt.offsetYAria')}
                      onChange={(event) =>
                        onAlbumArtChange({ offsetY: Number(event.currentTarget.value) })
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                </StepControl>
              </div>
              <ViewerSlider
                value={albumArt.offsetY}
                min={CLOCK_OFFSET_MIN}
                max={CLOCK_OFFSET_MAX}
                step={1}
                label={t('albumArt.offsetY')}
                valueText={formatOffset(albumArt.offsetY)}
                onChange={(offsetY) => onAlbumArtChange({ offsetY })}
              />
            </div>

            <p className="inspector-hint">{t('albumArt.idleHint')}</p>
          </>
        )}
      </section>
      )}

      {activeTab === 'other' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('preset.section')}</span>
        <button
          type="button"
          className={`copy-view-button${presetCopyState === 'error' ? ' is-error' : ''}`}
          disabled={!modelId}
          onClick={copyCurrentPreset}
        >
          {presetCopyState === 'copied'
            ? t('preset.copied')
            : presetCopyState === 'error'
              ? t('preset.error')
              : t('preset.copy')}
        </button>
        <p className="inspector-hint">{t('preset.hint')}</p>
      </section>
      )}

      {activeTab === 'other' && (
      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.debug')}</span>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={debugOpen}
            onChange={(event) => onDebugChange(event.currentTarget.checked)}
          />
          <span>{t('debug.show')}</span>
        </label>
        <p
          className={`inspector-hint${isError ? ' is-error' : ''}`}
          title={status}
        >
          {t('debug.currentStatus', { status })}
        </p>
      </section>
      )}
        </div>
      </div>
    </aside>
  )
}
