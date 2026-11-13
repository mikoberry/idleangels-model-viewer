import * as Slider from '@radix-ui/react-slider'
import { useEffect, useRef, useState } from 'react'
import { ANCHORS } from 'wallkit/core'
import {
  SPECTRUM_CURVE_MAX,
  SPECTRUM_CURVE_MIN,
  SPECTRUM_INTENSITY_MAX,
  SPECTRUM_INTENSITY_MIN,
  SPECTRUM_SIZE_MAX,
  SPECTRUM_SIZE_MIN,
} from 'wallkit/components/spectrum'
import { LANGUAGES } from '../i18n.js'
import {
  CLOCK_BEAT_CURVE_MAX,
  CLOCK_BEAT_CURVE_MIN,
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_OFFSET_MAX,
  CLOCK_OFFSET_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
} from '../utils/clock.js'
import './SettingsDrawer.css'

const MIN_SCALE = 0.5

// The album card's size is a cover diameter in vh, which is the unit WallKit's
// `size` string uses, so the stored number and the rendered size are one value.
const ALBUM_ART_SIZE_MIN = 10
const ALBUM_ART_SIZE_MAX = 40
// Height of the edge-to-edge spectrum band, in vh. The upper bound covers a
// full-screen band on a wide wallpaper without letting the box exceed it.
const BAND_HEIGHT_MIN = 6
const BAND_HEIGHT_MAX = 60

// Tabs of the settings drawer, rendered as a vertical menu on its left edge.
// Each floating widget gets its own tab: the three are independent overlays with
// independent positions, so sharing a pane implied they shared a placement.
const DRAWER_TABS = ['clock', 'spectrum', 'albumArt', 'model', 'other']
// Those three tabs only mean something when the widgets can render: browsers
// cannot read system audio or the media session, so away from the engine the
// drawer used to hide them. The preview path in `utils/preview.js` mounts the
// widgets on synthetic data, and `widgetsAvailable` says so.
const WIDGET_TABS = ['clock', 'spectrum', 'albumArt']
const DRAWER_TAB_KEY = 'spine-viewer:drawer-tab:v1'

// The tabs available for the current environment, in menu order.
function availableTabs(widgetsAvailable) {
  return widgetsAvailable
    ? DRAWER_TABS
    : DRAWER_TABS.filter((tab) => !WIDGET_TABS.includes(tab))
}

// `display` was the single tab that used to hold both the clock and the
// spectrum; it now maps to the clock tab so an existing preference still opens
// a sensible pane after the split.
const LEGACY_TAB_ALIASES = { display: 'clock' }

function loadDrawerTab(widgetsAvailable) {
  const tabs = availableTabs(widgetsAvailable)
  try {
    const saved = window.localStorage.getItem(DRAWER_TAB_KEY)
    if (tabs.includes(saved)) return saved
    // A stored widget tab must not be restored when the widgets cannot render:
    // it would have no pane and leave the drawer blank.
    if (saved && LEGACY_TAB_ALIASES[saved] && tabs.includes(LEGACY_TAB_ALIASES[saved])) {
      return LEGACY_TAB_ALIASES[saved]
    }
  } catch {
    // Storage unavailable: fall back to the default tab.
  }
  return tabs[0]
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
// Pointer parallax amount, as a percentage of the viewport at the screen edge.
// Negative values reverse the drift, so the range is symmetric.
const PARALLAX_AMOUNT_MIN = -15
const PARALLAX_AMOUNT_MAX = 15
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

// Snaps a slider value to its step. A 0.1 step accumulates binary rounding error
// (3.2000000000000002), which would leak into the persisted settings and the
// displayed percentage. Rounding the result to a fixed number of decimals fixes
// the multiply-back step, which reintroduces the error on its own.
function roundToStep(value, step = 0.1) {
  if (!Number.isFinite(value)) return 0
  const snapped = Math.round(value / step) * step
  return Number(snapped.toFixed(2))
}

// Keeps the parallax amount inside the slider range and snapped to its step.
// Typing into the number field can produce anything (blank, out of range), so
// every entry point funnels through here.
function clampParallax(value, fallback = 3) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return roundToStep(Math.min(Math.max(number, PARALLAX_AMOUNT_MIN), PARALLAX_AMOUNT_MAX))
}

function ViewerSlider({ value, min, max, step, label, valueText, disabled, onChange }) {
  return (
    <Slider.Root
      className="viewer-slider"
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
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
  // Most controls step by 1; the parallax slider uses a fractional step.
  step = 1,
  t,
}) {
  return (
    <div className="step-control">
      <button
        type="button"
        className="step-button"
        aria-label={t('step.decreaseAria', { label })}
        disabled={!canDecrease}
        onClick={() => onStep(-step)}
      >
        −
      </button>
      {children}
      <button
        type="button"
        className="step-button"
        aria-label={t('step.increaseAria', { label })}
        disabled={!canIncrease}
        onClick={() => onStep(step)}
      >
        +
      </button>
    </div>
  )
}

// One numeric setting: a value field with -/+ buttons above a slider. Every
// number in the widget panes goes through this, so a bound, a unit and a step
// live in one place instead of being repeated per control.
function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  unit = '',
  signed = false,
  disabled = false,
  hint,
  onChange,
  t,
}) {
  const display = Number(value).toFixed(decimals)
  const valueText = signed ? formatOffset(value) : `${display}${unit}`
  const round = (next) => Number(next.toFixed(decimals))

  return (
    <div className={`inspector-field${disabled ? ' is-disabled' : ''}`}>
      <div className="inspector-field inspector-field--split">
        <span className="inspector-field__label">{label}</span>
        <StepControl
          label={label}
          onStep={(delta) => onChange(round(value + delta))}
          canDecrease={!disabled && value > min}
          canIncrease={!disabled && value < max}
          step={step}
          t={t}
        >
          <label className="scale-input">
            <input
              className="viewer-number"
              type="number"
              min={min}
              max={max}
              step={step}
              value={display}
              aria-label={label}
              disabled={disabled}
              onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
            {unit && <span aria-hidden="true">{unit}</span>}
          </label>
        </StepControl>
      </div>
      <ViewerSlider
        value={value}
        min={min}
        max={max}
        step={step}
        label={label}
        valueText={valueText}
        disabled={disabled}
        onChange={onChange}
      />
      {hint && <p className="inspector-hint">{hint}</p>}
    </div>
  )
}

// "top-left" -> "topLeft", so the CSS-style anchor names map onto i18n keys.
function anchorKey(anchor) {
  return anchor.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

// An anchor is two independent axes: the vertical one decides which edge the
// offset is measured from, the horizontal one the same for the other axis.
function anchorAxes(anchor) {
  const [vertical, horizontal] = anchor.includes('-') ? anchor.split('-') : ['center', 'center']
  return { vertical, horizontal }
}

// Shared placement block: the 3x3 anchor picker plus one offset per axis.
//
// Every widget renders its own instance against its own stored numbers — the
// clock, spectrum and album card are independent overlays, so this is a shared
// control, not a shared position. The offset labels follow the chosen anchor,
// because "10%" means a different edge on each of the nine points.
function WidgetPosition({ anchor, offsetX, offsetY, onChange, t }) {
  const { vertical, horizontal } = anchorAxes(anchor)
  const labelX = t(
    `position.x${horizontal === 'left' ? 'FromLeft' : horizontal === 'right' ? 'FromRight' : 'FromCenter'}`,
  )
  const labelY = t(
    `position.y${vertical === 'top' ? 'FromTop' : vertical === 'bottom' ? 'FromBottom' : 'FromCenter'}`,
  )

  return (
    <>
      <div className="anchor-grid" role="group" aria-label={t('position.anchor')}>
        <span className="inspector-field__label">{t('position.anchor')}</span>
        <div className="anchor-grid__cells">
          {ANCHORS.map((value) => (
            <button
              key={value}
              type="button"
              className={`anchor-grid__cell${anchor === value ? ' is-active' : ''}`}
              aria-label={t(`anchor.${anchorKey(value)}`)}
              aria-pressed={anchor === value}
              title={t(`anchor.${anchorKey(value)}`)}
              onClick={() => onChange({ anchor: value })}
            />
          ))}
        </div>
      </div>
      <NumericField
        label={labelX}
        value={offsetX}
        min={CLOCK_OFFSET_MIN}
        max={CLOCK_OFFSET_MAX}
        signed
        onChange={(next) => onChange({ offsetX: next })}
        t={t}
      />
      <NumericField
        label={labelY}
        value={offsetY}
        min={CLOCK_OFFSET_MIN}
        max={CLOCK_OFFSET_MAX}
        signed
        onChange={(next) => onChange({ offsetY: next })}
        t={t}
      />
      <p className="inspector-hint">{t('position.hint')}</p>
    </>
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
  widgetsAvailable,
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
  const tabs = availableTabs(widgetsAvailable)
  // `availableTabs` returns a fresh array each render; key the reset effect on
  // the joined names so it only reacts to the environment actually changing.
  const tabKey = tabs.join('|')
  const [activeTab, setActiveTab] = useState(() => loadDrawerTab(widgetsAvailable))
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

  // Keep the active tab valid for this environment. Normally the initial state
  // already picks an available tab, but a stale engine-only value (from storage
  // or an environment flip) would render an empty pane, so fall back here too.
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab(tabs[0])
  }, [activeTab, tabKey])

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
          {tabs.map((tab) => (
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

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.parallax !== false}
            onChange={(event) => onChange({ parallax: event.currentTarget.checked })}
          />
          <span>{t('parallax.label')}</span>
        </label>
        {settings.parallax !== false && (
          <div className="inspector-field">
            <div className="inspector-field inspector-field--split">
              <span className="inspector-field__label">{t('parallax.amount')}</span>
              <StepControl
                label={t('parallax.amount')}
                step={0.1}
                onStep={(delta) =>
                  onChange({
                    parallaxAmount: clampParallax((settings.parallaxAmount ?? 3) + delta),
                  })
                }
                canDecrease={roundToStep(settings.parallaxAmount ?? 3) > PARALLAX_AMOUNT_MIN}
                canIncrease={roundToStep(settings.parallaxAmount ?? 3) < PARALLAX_AMOUNT_MAX}
                t={t}
              >
                <label className="scale-input">
                  <input
                    className="viewer-number"
                    type="number"
                    min={PARALLAX_AMOUNT_MIN}
                    max={PARALLAX_AMOUNT_MAX}
                    step={0.1}
                    value={roundToStep(settings.parallaxAmount ?? 3).toFixed(1)}
                    aria-label={t('parallax.amountAria')}
                    onChange={(event) =>
                      onChange({ parallaxAmount: clampParallax(Number(event.currentTarget.value)) })
                    }
                  />
                  <span aria-hidden="true">%</span>
                </label>
              </StepControl>
            </div>
            <ViewerSlider
              min={PARALLAX_AMOUNT_MIN}
              max={PARALLAX_AMOUNT_MAX}
              step={0.1}
              value={roundToStep(settings.parallaxAmount ?? 3)}
              onChange={(parallaxAmount) => onChange({ parallaxAmount: roundToStep(parallaxAmount) })}
              label={t('parallax.amount')}
              valueText={`${roundToStep(settings.parallaxAmount ?? 3).toFixed(1)}%`}
            />
          </div>
        )}
        <p className="inspector-hint">{t('parallax.hint')}</p>
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
                  'ring',
                  'segments',
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

            <NumericField
              label={t('clock.size')}
              value={clock.size}
              min={CLOCK_SIZE_MIN}
              max={CLOCK_SIZE_MAX}
              unit="%"
              onChange={(size) => onClockChange({ size })}
              t={t}
            />

            <WidgetPosition
              anchor={clock.anchor}
              offsetX={clock.offsetX}
              offsetY={clock.offsetY}
              onChange={onClockChange}
              t={t}
            />

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
            <NumericField
              label={t('clock.beatIntensity')}
              value={clock.beatIntensity}
              min={CLOCK_BEAT_INTENSITY_MIN}
              max={CLOCK_BEAT_INTENSITY_MAX}
              unit="%"
              disabled={clock.reactToBeat !== true}
              onChange={(beatIntensity) => onClockChange({ beatIntensity })}
              t={t}
            />
            <NumericField
              label={t('clock.beatCurve')}
              value={clock.beatCurve}
              min={CLOCK_BEAT_CURVE_MIN}
              max={CLOCK_BEAT_CURVE_MAX}
              step={0.02}
              decimals={2}
              disabled={clock.reactToBeat !== true}
              hint={t('clock.beatCurveHint')}
              onChange={(beatCurve) => onClockChange({ beatCurve })}
              t={t}
            />

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={clock.tilt !== false}
                onChange={(event) => onClockChange({ tilt: event.currentTarget.checked })}
              />
              <span>{t('clock.tilt')}</span>
            </label>
            <p className="inspector-hint">{t('clock.tiltHint')}</p>
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
                  ['pill', 'Pill'],
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

            <NumericField
              label={t('spectrum.size')}
              value={spectrum.size}
              min={SPECTRUM_SIZE_MIN}
              max={SPECTRUM_SIZE_MAX}
              unit="%"
              onChange={(size) => onSpectrumChange({ size })}
              t={t}
            />

            <WidgetPosition
              anchor={spectrum.anchor}
              offsetX={spectrum.offsetX}
              offsetY={spectrum.offsetY}
              onChange={onSpectrumChange}
              t={t}
            />

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={spectrum.edgeToEdge === true}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  // A full-width band that still believes it is "the spectrum,
                  // centred" would hang half off the screen, so switching the
                  // mode on from the centre default parks it on the bottom edge.
                  if (checked && spectrum.anchor === 'center') {
                    onSpectrumChange({
                      edgeToEdge: true,
                      anchor: 'bottom-center',
                      offsetX: 0,
                      offsetY: 0,
                    })
                    return
                  }
                  onSpectrumChange({ edgeToEdge: checked })
                }}
              />
              <span>{t('spectrum.edgeToEdge')}</span>
            </label>
            {spectrum.edgeToEdge === true && (
              <NumericField
                label={t('spectrum.bandHeight')}
                value={spectrum.bandHeight}
                min={BAND_HEIGHT_MIN}
                max={BAND_HEIGHT_MAX}
                unit="vh"
                onChange={(bandHeight) => onSpectrumChange({ bandHeight })}
                t={t}
              />
            )}
            <p className="inspector-hint">{t('spectrum.edgeToEdgeHint')}</p>

            <div className="inspector-field">
              <span className="inspector-field__label">{t('spectrum.color')}</span>
              <BackgroundColorField
                value={spectrum.color}
                onChange={(color) => onSpectrumChange({ color })}
                t={t}
              />
            </div>

            <NumericField
              label={t('spectrum.intensity')}
              value={spectrum.intensity}
              min={SPECTRUM_INTENSITY_MIN}
              max={SPECTRUM_INTENSITY_MAX}
              unit="%"
              hint={t('spectrum.intensityHint')}
              onChange={(intensity) => onSpectrumChange({ intensity })}
              t={t}
            />
            <NumericField
              label={t('spectrum.curve')}
              value={spectrum.curve}
              min={SPECTRUM_CURVE_MIN}
              max={SPECTRUM_CURVE_MAX}
              step={0.02}
              decimals={2}
              onChange={(curve) => onSpectrumChange({ curve })}
              t={t}
            />

            <p className="inspector-hint">{t('spectrum.hint')}</p>
          </>
        )}
      </section>
      )}

      {activeTab === 'albumArt' && (
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

            <NumericField
              label={t('albumArt.size')}
              value={albumArt.size}
              min={ALBUM_ART_SIZE_MIN}
              max={ALBUM_ART_SIZE_MAX}
              unit="vh"
              onChange={(size) => onAlbumArtChange({ size })}
              t={t}
            />

            <WidgetPosition
              anchor={albumArt.anchor}
              offsetX={albumArt.offsetX}
              offsetY={albumArt.offsetY}
              onChange={onAlbumArtChange}
              t={t}
            />

            <div className="clock-placement" role="group" aria-label={t('albumArt.theme')}>
              <span className="clock-placement__label">{t('albumArt.theme')}</span>
              <div className="clock-placement__options">
                {['light', 'dark'].map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`clock-placement__option${albumArt.theme === theme ? ' is-active' : ''}`}
                    aria-pressed={albumArt.theme === theme}
                    onClick={() => onAlbumArtChange({ theme })}
                  >
                    {t(`albumArt.theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={albumArt.colorFollow !== false}
                onChange={(event) =>
                  onAlbumArtChange({ colorFollow: event.currentTarget.checked })
                }
              />
              <span>{t('albumArt.colorFollow')}</span>
            </label>
            {albumArt.colorFollow === false && (
              <div className="inspector-field">
                <span className="inspector-field__label">{t('albumArt.color')}</span>
                <BackgroundColorField
                  value={albumArt.color}
                  onChange={(color) => onAlbumArtChange({ color })}
                  t={t}
                />
              </div>
            )}

            {/* The browser preview shows a made-up track, so the "play music in
                your system" note would only describe something it ignores. */}
            {inWallpaperEngine && (
              <p className="inspector-hint">{t('albumArt.idleHint')}</p>
            )}
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
