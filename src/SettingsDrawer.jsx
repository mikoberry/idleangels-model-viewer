import * as Slider from '@radix-ui/react-slider'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from './i18n.js'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const POSITION_LIMIT = 100
const BACKGROUND_PRESETS = [
  '#06070d',
  '#000000',
  '#111827',
  '#1e293b',
  '#3b1f45',
  '#f2f5ff',
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
  status,
  isError,
  modelId,
  recommendedView,
  recordedViews = {},
  onRecordView,
  language,
  onLanguageChange,
  t,
}) {
  const [copyState, setCopyState] = useState('idle')
  const [recordState, setRecordState] = useState('idle')
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

  async function copyAllViews() {
    const text = JSON.stringify(recordedViews, null, 2)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('copy failed')
      }

      setCopyState('copied')
    } catch {
      setCopyState('error')
    }

    window.setTimeout(() => setCopyState('idle'), 2000)
  }

  const scalePercent = Math.round(settings.scale * 100)
  const recordedCount = Object.keys(recordedViews).length

  return (
    <aside
      id="settings-drawer"
      className={`playback-inspector${open ? ' is-open' : ''}`}
      inert={open ? undefined : ''}
      aria-hidden={!open}
      aria-label={t('drawer.title')}
    >
      <header className="inspector-header">
        <div>
          <p className="inspector-eyebrow">{t('drawer.eyebrow')}</p>
          <h2 className="inspector-title">{t('drawer.title')}</h2>
        </div>
        <button
          type="button"
          className="viewer-button viewer-button--ghost"
          onClick={onClose}
        >
          {t('drawer.collapse')}
        </button>
      </header>

      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.language')}</span>
        <div
          className="language-options"
          role="group"
          aria-label={t('drawer.language')}
        >
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`language-option${language === item.id ? ' is-selected' : ''}`}
              aria-pressed={language === item.id}
              onClick={() => onLanguageChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

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

        <button
          type="button"
          className={`copy-view-button${copyState === 'error' ? ' is-error' : ''}`}
          disabled={recordedCount === 0}
          onClick={copyAllViews}
        >
          {copyState === 'copied'
            ? t('copy.copied', { count: recordedCount })
            : copyState === 'error'
              ? t('copy.error')
              : t('copy.idle', { count: recordedCount })}
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

      <section className="inspector-section">
        <span className="inspector-section__title">{t('drawer.background')}</span>
        <BackgroundColorField
          value={settings.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
          t={t}
        />
        <p className="inspector-hint">{t('drawer.backgroundHint')}</p>
      </section>

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
    </aside>
  )
}
