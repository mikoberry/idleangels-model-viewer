import * as Slider from '@radix-ui/react-slider'
import { useEffect, useRef, useState } from 'react'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const POSITION_LIMIT = 100
const ANIMATION_LABELS = {
  idle: '待机 · idle',
  action: '动作 · action',
}
const BACKGROUND_PRESETS = [
  '#06070d',
  '#000000',
  '#111827',
  '#1e293b',
  '#3b1f45',
  '#f2f5ff',
]
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function animationLabel(name) {
  return ANIMATION_LABELS[name] ?? name
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

function StepControl({ label, onStep, canDecrease, canIncrease, children }) {
  return (
    <div className="step-control">
      <button
        type="button"
        className="step-button"
        aria-label={`${label}减少 1%`}
        disabled={!canDecrease}
        onClick={() => onStep(-1)}
      >
        −
      </button>
      {children}
      <button
        type="button"
        className="step-button"
        aria-label={`${label}增加 1%`}
        disabled={!canIncrease}
        onClick={() => onStep(1)}
      >
        +
      </button>
    </div>
  )
}

function ModelSelect({ models, value, onChange, active }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const selected = models.find((model) => model.id === value)

  useEffect(() => {
    if (!active) setMenuOpen(false)
  }, [active])

  useEffect(() => {
    if (!menuOpen) {
      setQuery('')
      return undefined
    }

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

  const normalizedQuery = query.trim().toLowerCase()
  const filteredModels = normalizedQuery
    ? models.filter((model) => model.label.toLowerCase().includes(normalizedQuery))
    : models

  return (
    <div className={`model-select${menuOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="model-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="选择模型"
        disabled={models.length === 0}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span className="model-select__label">
          {selected?.label ?? (models.length > 0 ? '选择模型' : '模型未加载')}
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
            placeholder="搜索模型目录…"
            aria-label="搜索模型"
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className="model-select__list" role="listbox" aria-label="模型列表">
            {filteredModels.length === 0 ? (
              <p className="model-select__empty">没有匹配的模型</p>
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

function AnimationSelect({ animations, value, onChange, active }) {
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
        <span>{animations.length === 0 ? '正在加载动画…' : animationLabel(selected)}</span>
        <span className="animation-select__chevron" aria-hidden="true" />
      </button>

      {menuOpen && (
        <div className="animation-select__menu" role="listbox" aria-label="Spine 动画">
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
              {animationLabel(name)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BackgroundColorField({ value, onChange }) {
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
      <div className="color-swatches" role="group" aria-label="背景色预设">
        {BACKGROUND_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch${color === value ? ' is-active' : ''}`}
            style={{ backgroundColor: color }}
            title={color}
            aria-label={`背景色 ${color}`}
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
          aria-label="背景色饱和度与亮度"
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
          aria-label="背景色色相"
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
          aria-label="背景色十六进制值"
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
}) {
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

  const scalePercent = Math.round(settings.scale * 100)

  return (
    <aside
      id="settings-drawer"
      className={`playback-inspector${open ? ' is-open' : ''}`}
      inert={open ? undefined : ''}
      aria-hidden={!open}
      aria-label="播放设置"
    >
      <header className="inspector-header">
        <div>
          <p className="inspector-eyebrow">Playback</p>
          <h2 className="inspector-title">播放设置</h2>
        </div>
        <button
          type="button"
          className="viewer-button viewer-button--ghost"
          onClick={onClose}
        >
          收起
        </button>
      </header>

      <section className="inspector-section">
        <span className="inspector-field__label">Spine 模型</span>
        <ModelSelect
          models={models}
          value={selectedModelId}
          onChange={onModelChange}
          active={open}
        />
        <p className="inspector-hint">
          当前包内 {models.length} 个模型；刷新后默认第一个。
        </p>
      </section>

      <section className="inspector-section">
        <span className="inspector-field__label">Spine 动画</span>
        <AnimationSelect
          animations={animations}
          value={currentAnimation}
          onChange={onAnimationChange}
          active={open}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.clickToAction}
            onChange={(event) => onChange({ clickToAction: event.currentTarget.checked })}
          />
          <span>点击画面触发 action</span>
        </label>
        <p className="inspector-hint">
          选择后立即播放；action 播放一次后回到 idle。取消勾选后点击画面不会触发 action。
        </p>
      </section>

      <section className="inspector-section">
        <span className="inspector-field__label">画面变换</span>

        <p className="inspector-note">
          Wallpaper Engine 中滑块拖动可能失效，请直接点击轨道对应位置进行设置。
        </p>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">缩放</span>
            <StepControl
              label="缩放"
              onStep={(delta) => setScalePercent(scalePercent + delta)}
              canDecrease={scalePercent > MIN_SCALE * 100}
              canIncrease={scalePercent < MAX_SCALE * 100}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={MIN_SCALE * 100}
                  max={MAX_SCALE * 100}
                  step={1}
                  value={scaleInput}
                  aria-label="缩放百分比"
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
            label="动画缩放"
            valueText={`${Math.round(settings.scale * 100)}%`}
            onChange={(scale) => onChange({ scale })}
          />
        </div>

        <div className="reset-row">
          <button
            type="button"
            className="reset-button"
            title="100% · X 0% · Y 0%"
            onClick={() => resetView({ scale: 1, positionX: 0, positionY: 0 })}
          >
            初始 100 / 0 / 0
          </button>
          <button
            type="button"
            className="reset-button"
            title="240% · X -30% · Y -27%"
            onClick={() => resetView({ scale: 2.4, positionX: -30, positionY: -27 })}
          >
            推荐 240 / -30 / -27
          </button>
        </div>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">水平位置</span>
            <StepControl
              label="水平位置"
              onStep={(delta) => stepPosition('positionX', delta, setPositionXInput)}
              canDecrease={Math.round(settings.positionX) > -POSITION_LIMIT}
              canIncrease={Math.round(settings.positionX) < POSITION_LIMIT}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={-POSITION_LIMIT}
                  max={POSITION_LIMIT}
                  step={1}
                  value={positionXInput}
                  aria-label="水平位置百分比"
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
            label="水平位置"
            valueText={formatOffset(settings.positionX)}
            onChange={(positionX) => onChange({ positionX })}
          />
        </div>

        <div className="inspector-field">
          <div className="inspector-field inspector-field--split">
            <span className="inspector-field__label">垂直位置</span>
            <StepControl
              label="垂直位置"
              onStep={(delta) => stepPosition('positionY', delta, setPositionYInput)}
              canDecrease={Math.round(settings.positionY) > -POSITION_LIMIT}
              canIncrease={Math.round(settings.positionY) < POSITION_LIMIT}
            >
              <label className="scale-input">
                <input
                  className="viewer-number"
                  type="number"
                  min={-POSITION_LIMIT}
                  max={POSITION_LIMIT}
                  step={1}
                  value={positionYInput}
                  aria-label="垂直位置百分比"
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
            label="垂直位置"
            valueText={formatOffset(settings.positionY)}
            onChange={(positionY) => onChange({ positionY })}
          />
        </div>

        <p className="inspector-hint">
          缩放范围 50%–500%，位置范围 -100%–100%。
        </p>
      </section>

      <section className="inspector-section">
        <span className="inspector-field__label">页面背景色</span>
        <BackgroundColorField
          value={settings.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />
        <p className="inspector-hint">
          显示在透明区域和缩放后的留白处；可直接输入 #RRGGBB。
        </p>
      </section>
    </aside>
  )
}
