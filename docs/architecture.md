# 架构设计

本文档描述当前仓库**实际存在**的实现：React 18 + Vite 5 + JSX，多模型全屏 WebGL 查看器。资源细节见[Spine 3.8 与资源](spine-runtime-and-assets.md)，设置字段见[设置字段参考](settings-reference.md)。

## 总览

```text
index.html（<head> 内联脚本：音频 / 媒体 / 暂停桥接）
  └─ src/main.jsx
       └─ <App />
            ├─ fetch spine/models/manifest.json
            ├─ 默认选中 models[0]
            ├─ <canvas ref={canvasRef} />
            ├─ startSpineStage(canvas, { model, callbacks })
            ├─ <Spectrum /> / <AlbumArt /> / <Clock />  // 全屏浮层
            ├─ <SettingsDrawer />  // 四个标签：时间 / 频谱 / 模型 / 其它
            ├─ 眼睛按钮 / 提示气泡
            ├─ <main style={{ backgroundColor }} />
            └─ 左上角调试面板（由抽屉开关控制）
```

核心原则：

- `App` 加载模型清单，持有画布、当前模型、播放设置、当前动画和抽屉状态。Stage 随选中模型创建/重建，抽屉开关不会重建它。
- `spineStage.js` 是不依赖 React 的命令式 WebGL 层，按 manifest 的 `layers` 动态加载 1~N 个图层。
- `spine-webgl.js` 是 vendored 的 Spine 3.8.99 运行时，只通过 `export { spine }` 暴露命名空间。
- 设置分为两类：**播放设置**（缩放/位置/背景色/点击开关）和**当前模型选择**只存在于 React state，不持久化；**显示偏好**（时钟、频谱、专辑封面、语言、抽屉标签）和**按模型的视图记录**会写入 `localStorage`。当前版本没有 URL 状态、没有编辑/展示模式，刷新后默认选择清单第一个模型。

## 分层职责

### `src/main.jsx`

- 引入 `base.css`（设计变量与 reset）。组件样式由各组件自己引入同目录下的 CSS。
- 创建 React root，渲染 `<App />`。
- 没有使用 `React.StrictMode`。

### `src/App.jsx`

- 持有：
  - `canvasRef` / `stageRef`
  - `statusState` / `status` / `isError`
  - `isDrawerOpen`
  - `showEyeHint`
  - `debugOpen` / `debugInfo`
  - `animations` / `currentAnimation`
  - `models` / `selectedModelId` / `recordedViews`
  - `viewSettings`
  - `language` / `t`
  - `clock` / `spectrum` / `albumArt`（三个独立的持久化偏好 state）
  - `inWallpaperEngine`（环境检测，决定抽屉初始状态和模型选择器是否渲染）
- 挂载后通过 XHR 加载 `spine/models/manifest.json`，默认选中 `models[0]`。
- 在 `selectedModel` 变化时调用 `startSpineStage(canvas, { model, t, onStatus, onAnimationChange, isCancelled })`；`onStatus(key, vars, error)` 传状态 key，由 App 按当前语言渲染；切换模型会先 dispose 旧 Stage。
- 把 Stage 返回的 `animations` 填进下拉框，并在 Stage ready 后应用当前模型已记录的视图；没有记录时用 `recommendedView`，再没有则 `100 / 0 / 0` + 黑色。
- 把 `viewSettings.scale` / `positionX` / `positionY` 同步到 `stage.setView()`。
- 把 `backgroundColor` 写到 `<main>` 的内联样式。
- 把 `clickToAction` 和抽屉状态接到 canvas 的 `pointerup` 上。
- 管理眼睛提示和调试面板；调试面板在打开时收集环境、尺寸、WebGL、音频状态等 16 行信息。
- 为 `clock` / `spectrum` / `albumArt` 各自定义 `normalize*` 或夹取逻辑，并在 `useEffect` 中把每次变化写回各自的 `localStorage` key；`recordModelView` 只在用户点击“记录当前视图”时写 `model-views`。
- 渲染 `Spectrum` / `AlbumArt` / `Clock` 三个浮层，以及 `SettingsDrawer`；抽屉始终挂载，通过 `open` 控制动画和 `inert`。

### `src/components/SettingsDrawer.jsx`

- 受控组件：所有值来自 `settings` / `currentAnimation` / `animations` / `models` / `clock` / `spectrum` / `albumArt`，修改通过 `onChange(patch)` / `onAnimationChange(name)` / `onModelChange(id)` / `onClockChange` / `onSpectrumChange` / `onAlbumArtChange` / `onLanguageChange` / `onDebugChange` 回传；文案通过 `t` 获取。
- 抽屉通过 `.is-open` 滑入；关闭时 `inert`，并通过 `aria-hidden` 对辅助技术隐藏。
- **左侧竖向标签分区**：`.inspector-body` 内含 `.inspector-nav`（标签菜单）与 `.inspector-pane`（当前标签内容）。四个标签：
  - `clock` 时间：时间与日期的显示开关、版式、大小、位置、随音频律动
  - `spectrum` 频谱：音频频谱与专辑封面（两者都是音频可视化，放在同一标签）
  - `model` 模型：模型选择、Spine 动画、画面变换、背景
  - `other` 其它：调试
- 语言按钮和“收起”按钮固定在 `.inspector-nav` 底部，不属于任何标签。
- 标签选择持久化在 `localStorage` 的 `spine-viewer:drawer-tab:v1`；已废弃的 `display` 值在读取时映射为 `clock`（旧的“显示”标签被拆成 `clock` + `spectrum`）。
- **抽屉本身不滚动**（`overflow: hidden`），只有 `.inspector-pane` 滚动。分标签是为让每个标签内容更短，避免依赖在 Wallpaper Engine 中不可靠的滚动操作。
- 窄屏（`max-width: 640px`）时标签菜单改为顶部横向排列。
- 包含：
  - 中文 / English / 日本語 / 한국어 语言按钮
  - 可搜索的 Spine 模型选择器（`inWallpaperEngine` 为 true 时整块不渲染）
  - Spine 动画下拉框
  - “点击画面触发 action”开关
  - 缩放滑杆、数字输入、±1% 步进
  - 水平/垂直位置滑杆、数字输入、±1% 步进
  - 初始、推荐、记录当前视图、复制全部视图按钮
  - 背景色预设、取色器、十六进制输入
  - 时钟：显示开关、版式、大小、位置、随音频律动 + 响应强度
  - 频谱：显示开关、位置、高度、水平位置、颜色
  - 专辑封面：显示开关、角落、大小、水平/垂直位置
- 没有速度、暂停、循环、自动播放、包围盒等控件。
- 颜色输入（背景色与频谱颜色）共用 `BackgroundColorField`：预设色块、HSV 色域、色相条、`#RRGGBB` 输入框。

### `src/components/Clock.jsx`

- 显示当前时间与日期的浮层组件，`visible` 为 `false` 时不渲染。
- 每秒刷新一次；`visible` 关闭时不创建定时器。
- 监听 `visibilitychange` 和可选的 `wallpaperPropertyListener.setPaused`，壁纸或标签页恢复可见时立即刷新。
- 位置和字号由 `offsetX` / `offsetY` / `size` 控制，默认左边 10%、垂直居中；两种版式：`card`（竖排）与 `bar`（横排）。
- 三层结构：`.clock-anchor` 只管定位（`left` / `bottom` 百分比），`.clock-tilt` 只管 3D 变换，`.clock-card` / `.clock-bar` 只管排版；三者互不覆盖。
- 字号通过内联 CSS 变量 `--clock-scale`（`size / 100`）缩放 `--clock-time-size` 等基础字号。
- 视觉上无背景、无边框、无卡片阴影，只有 `text-shadow` 保证可读性。
- **倾斜分两步**：`window` 的 `pointermove` 只更新目标角（`computeClockTilt()` 按**视口**尺寸归一化）；一个 rAF 循环用 `smoothStep()` 把渲染值指数缓动到目标，每帧只在角度实际变化时才 `setState`。
- 不使用 CSS `transition`：目标值在指针移动时持续变化，CSS 过渡会被反复重启而产生卡顿，所以缓动完全由 rAF 接管。
- 按视口而非卡片尺寸归一化是关键：按卡片尺寸时，指针一离开卡片就撞上 `clamp` 上限，表现为"过临界点瞬间跳到极限"。
- 指针离开窗口（`pointerleave`）时目标归零；`prefers-reduced-motion: reduce` 下强制平放。
- 浮层设置 `pointer-events: none`，不拦截画布点击，所以开着时钟也能触发 `action`。
- **音频律动**：`reactToBeat` 打开时，同一个 rAF 循环读取音频低频并叠加 `scale` 与 `--clock-beat-glow` 变量；`beatIntensity`（0–500%）缩放这两项效果的幅度，0% 等于看不出反应。不额外起定时器。

### `src/components/Spectrum.jsx`

- 128 根柱子的音频频谱浮层，贴在屏幕底边或顶边，高度由 `height`（vh 百分比）控制。
- 用 **Canvas 2D** 绘制而不是 128 个 DOM 节点：`requestAnimationFrame` 中一次 `fillRect` 循环完成整帧。
- 每帧顺序：读音频目标 → `smoothAudioLevel()` 缓动实际高度 → 绘制带渐变的柱子。没有峰值标记。
- 画布 backing store 用 CSS 像素（与 WebGL canvas 一致，不乘 `devicePixelRatio`）。
- `pointer-events: none`，不拦截画布点击；`aria-hidden`，对辅助技术隐藏。
- `position: 'top'` 通过 `transform: scaleY(-1)` 翻转，避免再写一套绘制逻辑。

### `src/components/AlbumArt.jsx`

- 显示 Wallpaper Engine 媒体信息里的专辑封面、曲名、艺术家和专辑名；`visible` 为 `false` 时不渲染。
- 每秒轮询一次 `getWallpaperMedia()`（`index.html` 的内联脚本只写全局变量，没有可订阅的事件），`visible` 关闭时不创建定时器。
- 卡片锚定在四角之一（`corner`），大小由 `size`（vh 百分比）换算成 `--album-size`，卡片宽度是 `--album-size` 的 3.6 倍、高度正好等于 `--album-size`；水平和垂直位置测量方向都是从所选角落向内，范围同样是 `0%`–`100%`。
- 三种状态（环境不支持 / 暂无播放 / 正在播放）都通过同一个 `shell()` 渲染，卡片尺寸和版式不随数据到达而跳动。
- 封面包在 `.album-art__disc` 里做圆形遮罩，每 24 秒转一圈；`is-paused` 时设置 `animation-play-state: paused`，`prefers-reduced-motion` 下完全关闭旋转。
- 卡片为 `pointer-events: none`，不拦截画布点击。

### `src/components/MiniSpectrum.jsx`

- 与 `Spectrum.jsx` 相同的柱状渲染，但没有定位逻辑：填满父容器给定的盒子。
- `readBars` 语义与 `Spectrum.jsx` 一致——引擎内用真实帧，浏览器里用模拟数据，引擎存在但没有帧时画静音（绝不伪造柱形）。
- `AlbumArt.jsx` 用它作为卡片的背景图层；颜色跟随 `spectrum.color`。

### `src/utils/wallpaperMedia.js`

- 媒体监听器同样在 `index.html` 的内联经典脚本中注册，结果写进单个全局对象 `window.__weMedia`（缩略图、曲名、艺术家、专辑名、配色、播放状态、是否启用媒体集成）。
- 本模块只读该全局对象，无副作用，导出 `isWallpaperMediaAvailable()`、`getWallpaperMedia()`、`isWallpaperMediaEnabled()`。
- 封面**不按时间过期**：引擎只在换曲时推送，所以用播放状态决定是否清空——只有明确的 `stopped` 才返回 `null`；`playback` 未知（`null`）按“播放中”处理，因为部分播放器根本不发播放状态事件。
- 播放状态数字常量来自 `window.wallpaperMediaIntegration`，缺失时保持 `null`（未知），不能猜成 `stopped`，否则封面会永久消失。

### `src/utils/wallpaperAudio.js`

- 在 `index.html` 的 `<head>` 中由内联经典脚本注册（早于 Vite 的 module 脚本），把 128 长度数组和到达时间戳写到 `window.__weAudioFrame` / `window.__weAudioAt`。
- `src/utils/wallpaperAudio.js` 只读取这两个全局值，无副作用，导出 `isWallpaperAudioAvailable()` 与 `getWallpaperAudioFrame(staleMs = 1500)`；超过 1.5 秒未更新的帧视为过期并返回 `null`，让消费端回到静止而不是冻结在最后一帧。
- 官方文档明确：**不能**在 `window.onload` 或类似事件里注册，否则会漏事件。
- `public/project.json` 的 `general.supportsaudioprocessing` 必须嵌在 `general` 内，写在顶层会被引擎忽略。

### `src/utils/wallpaperPause.js`

- 统一暂停状态桥接。内联脚本在 `index.html` 中记录 `window.__wePaused`，并在状态变化时派发 `we-pause-change` DOM 事件。
- 导出 `isWallpaperPaused()`、`onWallpaperPauseChange(listener)` 和事件名常量 `PAUSE_EVENT_NAME`；订阅会立即收到当前状态，之后每次变化再触发。
- **不要**在组件里给 `wallpaperPropertyListener.setPaused` 重新赋值，那会覆盖启动时注册的回调。
- `spineStage.js`、`Spectrum.jsx`、`MiniSpectrum.jsx` 在暂停时跳过整帧绘制（保留 rAF 以便立即恢复）；`Clock.jsx` 在恢复时立即刷新时间。

### `src/utils/audio.js`

- 纯函数模块：`summarizeWallpaperAudio`、`extractSpectrumBars`、`syntheticSpectrum`、`syntheticAudioLevel`、`smoothAudioLevel`、`spectrumGradientStops`，以及 `AUDIO_BANDS` / `SPECTRUM_BARS` / `DEFAULT_SPECTRUM_COLOR` 常量。
- `spectrumGradientStops(hex)` 把 `#rrggbb` 转成柱子的两个渐变端点（顶部 0.95、底部 0.45 透明度）；输入不合法时返回 `null`，调用方回退到默认色，避免画不出柱子。
- `extractSpectrumBars(frame)` 把左右各 64 个频段映射成 128 根柱子（右声道镜像），经过 `denoise()`：低于 `NOISE_FLOOR = 0.06` 的采样归零并重新缩放，消除引擎静音时的整片微颤；长度不足或非数组返回 `null`。
- `syntheticSpectrum(t)` 生成确定性的模拟频谱，供浏览器预览；负时间返回全 0。
- `smoothAudioLevel(current, target, dt)` 指数缓动，attack 60/s、release 6/s，帧率无关。

### `src/utils/clock.js`

- 纯函数模块，不依赖 React：`formatClockTime`、`formatClockDateParts`、`formatClockZone`、`computeClockTilt`、`smoothStep`、`weekdayKey`。
- 同时导出时钟布局范围常量 `CLOCK_OFFSET_MIN`（`0`）、`CLOCK_OFFSET_MAX`（`100`）、`CLOCK_SIZE_MIN`、`CLOCK_SIZE_MAX`，由 `App.jsx` 和 `SettingsDrawer.jsx` 共用，避免控件范围与校验范围不一致。这两个位置常量同样用于频谱的水平位置，使所有小组件的位置范围统一。
- `formatClockDateParts` 始终返回**具体年月日**（如 `2026年11月12日`）和周几 key；不返回"今天/昨天/明天"这类相对词，否则会把真实日期隐藏掉。
- 时间固定 24 小时制；日期顺序按界面语言通过 `Intl.DateTimeFormat` 格式化。
- `computeClockTilt(point, bounds, { maxTilt })` 把指针相对 **`bounds` 中心**（传入视口）的偏移归一化到 `[-1, 1]`，再乘 `maxTilt`（默认 14°）。指针在视口内时角度随位置线性变化；参数缺失或尺寸为 0 时返回 `{ rotateX: 0, rotateY: 0 }`。
- `smoothStep(current, target, deltaSeconds, speed = 8)` 用 `1 - e^(-speed·dt)` 做帧率无关的指数缓动；差值小于 `0.01` 时直接吸附到目标。`deltaSeconds` 非正或 `current` 非有限值时返回安全值。

### `src/i18n.js`

- 提供 `zh` / `en` / `ja` / `ko` 四套扁平 key 文案。
- `detectLanguage()` 优先读取 `spine-viewer:language:v1`，否则按浏览器语言回退英文。
- `getTranslator(language)` 返回 `t(key, vars)`，负责插值；App 把 `t` 传给抽屉和 Stage。
- 页面 `<html lang>` 和 `document.title` 由 App 在语言变化时更新。

### `src/spineStage.js`

- 创建 WebGL 上下文和 `SceneRenderer`。
- 按 `model.layers` 为每层创建一个 `AssetManager`，加载对应的 `.skel` 和 `.atlas`。
- 读取二进制骨架，创建 `Skeleton`、`AnimationStateData`、`AnimationState`。
- 显式播放 `idle`。
- 计算加载时姿态的包围盒，初始化相机。
- 监听 window resize，维护 viewport 和相机。
- 运行 `requestAnimationFrame` 渲染循环。
- 实现 `triggerAction()` / `play()` 的状态机。
- 返回 `{ setView, triggerAction, play, animations, dispose }`。

### `src/spine-webgl.js`

- 总量约 10,840 行、422 KB 的编译产物。
- 包含 Spine 核心（`SkeletonBinary`、`Skeleton`、`AnimationState` 等）和 WebGL 层（`ManagedWebGLRenderingContext`、`SceneRenderer`、`AssetManager` 等）。
- 末尾 `export { spine }`。
- 不包含任何本项目的业务逻辑，也不依赖 React。

### 样式文件

样式按组件拆分，每个组件在自己文件里引入同目录的 CSS：

- `src/base.css`：设计变量（字号、间距、颜色、圆角）、reset、`.viewer` 外壳与全屏 canvas。
- `src/App.css`：调试面板、眼睛按钮、提示气泡。
- `src/components/Clock.css`：时钟浮层，含锚点、七个布局与主题配色。
- `src/components/SettingsDrawer.css`：右侧抽屉、标签菜单、表单控件与窄屏断点。
- `src/components/Spectrum.css`、`MiniSpectrum.css`、`AlbumArt.css`：音频频谱与专辑封面卡片。

全屏布局：`html` / `body` / `#root` / `.viewer` 高度 100%，body 不滚动。视觉上保持无页头、页脚和卡片边框。

## 启动与加载流程

```text
React 挂载 <canvas>
  → App fetch spine/models/manifest.json
  → 默认选中 models[0]
  → startSpineStage(canvas, { model })
  → 创建 ManagedWebGLRenderingContext
  → 创建 SceneRenderer，camera 初始归零
  → 按 model.layers 创建 AssetManager（bg / angel）并加载资源
  → 每 50ms 轮询 isLoadingComplete / hasErrors
  → 用 SkeletonBinary + AtlasAttachmentLoader 读取骨架
  → 创建 Skeleton / AnimationStateData / AnimationState
  → 设置混合时间，显式播放 idle
  → 计算所有图层当前姿态的 union bounds
  → resize + fitView
  → 启动 requestAnimationFrame
  → 返回 Stage API
  → App 保存 stage、填动画列表、应用初始 view
  → 用户切换模型时：dispose 旧 Stage → 用新 model 重新执行以上流程
```

关键点：

- 每个图层并行加载；任意 manager 报错都会让 `waitForLoad` reject。
- 模型清单默认选择第一项；模型选择不持久化。
- 加载轮询没有超时，网络卡住时可能一直等待。
- 骨架通过 `spine.SkeletonBinary` 读取，不读取 JSON。
- `idle` 必须显式播放，因为 `action` 在骨架动画列表中排第一。
- 初始包围盒只基于加载时的当前姿态，不做多帧采样。

## 渲染循环

每帧（[src/spineStage.js](../src/spineStage.js)）：

1. `delta = clamp((now - lastTime) / 1000, 0, 0.05)`，避免切后台后跳帧。
2. 对每个图层执行 `state.update(delta)`、`state.apply(skeleton)`、`skeleton.updateWorldTransform()`。
3. `gl.clearColor(0, 0, 0, 0)`，清空为透明。
4. `renderer.begin()`。
5. 按 manifest 的图层顺序（通常是 `bg`、`angel`）调用 `renderer.drawSkeleton(skeleton, true)`。
6. `renderer.end()`。
7. 请求下一帧。

画布上下文：

```js
{
  alpha: true,
  premultipliedAlpha: true,
  antialias: true,
}
```

因此页面背景色由 `<main>` 的 CSS 背景显示，WebGL 只负责透明图层。

## 相机与视图变换

`fitView()` 的逻辑：

```text
padding = 0.06
worldWidth  = bounds.maxX - bounds.minX
worldHeight = bounds.maxY - bounds.minY
availableWidth  = canvas.width  * (1 - padding * 2)
availableHeight = canvas.height * (1 - padding * 2)
baseZoom = max(worldWidth / availableWidth, worldHeight / availableHeight)
zoom = baseZoom / viewScale
camera.x = centerX - viewOffsetX * canvasWidth * zoom
camera.y = centerY + viewOffsetY * canvasHeight * zoom
```

`OrthoCamera` 的投影范围与 `zoom` 成正比，所以 `viewScale` 越大，`camera.zoom` 越小，画面显示越大。

方向：

- `positionX` 为正时，画面向右移动。
- `positionY` 为正时，画面向下移动。
- 缩放和偏移叠加，放大后可能裁切画面，这是预期行为。

`setView(scale, offsetX, offsetY)` 会在 Stage 侧再次限制：

```text
scale   ∈ [0.5, 5]
offsetX ∈ [-1, 1]
offsetY ∈ [-1, 1]
```

`App` 传入的是 `positionX / 100`、`positionY / 100`。

### 尺寸与 DPR

- 只监听 `window.resize`，没有 `ResizeObserver`。
- `canvas.width = round(cssWidth)`，`canvas.height = round(cssHeight)`。
- 没有乘 `devicePixelRatio`；高 DPI 屏幕上会被浏览器放大，可能偏软。
- `resize()` 会同步 `gl.viewport`、`camera.setViewport`，然后重新 `fitView()`。

## 包围盒

加载完成后：

```text
offset/size = skeleton.getBounds()
→ 对 bg / angel 求并集
→ 作为 fitView 的世界范围
```

注意：

- 只计算加载时姿态（`idle` 第 0 帧），不是 `idle` / `action` 的多帧采样。
- 没有逐层包围盒绘制，也没有调试包围盒开关。
- 如果后续替换模型导致动作范围明显大于初始姿态，可能需要重新评估取景。

## 动画状态机

### 初始化

- 每个拥有 `idle` 的图层都设置为 `idle` 循环。
- 混合时间：
  - `defaultMix = 0.2`
  - `action → action = 0`
  - `idle → action = 0.1`
  - `action → idle = 0.2`

### 触发 Action

`triggerAction()`：

1. `actionToken += 1`，使旧回调失效。
2. 清空 `pendingActionLayers`。
3. 对每个拥有 `action` 的图层：
   - `state.setAnimation(0, 'action', false)`；
   - 如果当前已经是 `action`，设置 `entry.mixDuration = 0` 立即重播；
   - 挂 `complete` 监听；
   - 把图层 id 加入 pending 集合。
4. 有图层启动成功时，把当前动画更新为 `action`。

### 完成

`complete` 回调：

1. token 不匹配就忽略。
2. 从 pending 集合删除该图层。
3. pending 为空时调用 `returnToIdle()`：
   - 对拥有 `idle` 的图层设置 `idle` 循环；
   - 当前动画更新为 `idle`。

### 播放其他动画

`play(name)`：

- `action` 转给 `triggerAction()`。
- 其他动画：token 递增、清 pending、对拥有该动画的图层设置循环播放。
- 当前筛选的模型都有 `idle` / `action`；`availableAnimations` 会合并所有图层的动画名并去重。

### 循环 Action 的注意事项

当前 `action` 是 `loop: false`，所以不需要 `loopAction` 保护。

如果以后实现循环 Action，必须注意：Spine 3.8 在每次循环回绕时也会触发 `complete`；应在完成回调里先判断循环状态，再决定是否回到 `idle`。

## 设置与状态流

```text
SettingsDrawer 模型选择
  → App.handleModelChange(id)
  → App.selectedModelId
  → stage effect cleanup：dispose 旧 Stage
  → startSpineStage(canvas, { model: 新模型 })
  → 新 Stage ready 后应用该模型已记录的视图（无记录则 recommendedView，再无则 100/0/0 + 黑色）
```

```text
SettingsDrawer.onChange(patch)
  → App.setViewSettings(prev => ({ ...prev, ...patch }))
  → React 重新渲染
  → useEffect([scale, positionX, positionY])
  → stage.setView(scale, positionX / 100, positionY / 100)
  → fitView()
```

```text
backgroundColor
  → <main style={{ backgroundColor }} />
  → canvas 透明区域显示该颜色
```

```text
clickToAction
  → canvas pointerup 处理器
  → 如果抽屉关闭且开关为 true
  → stage.triggerAction()
```

```text
SettingsDrawer 动画选择
  → App.handleAnimationChange(name)
  → stage.play(name)
  → Stage 回调 onAnimationChange(name)
  → App.currentAnimation
```

```text
时钟 / 频谱 / 专辑封面 / 语言 / 抽屉标签
  → 各自的 state 更新
  → 对应浮层组件重新渲染（不经过 Stage）
  → useEffect 写入各自的 localStorage key
```

```text
backgroundColor
  → <main style={{ backgroundColor }} />
  → canvas 透明区域显示该颜色
```

当前**没有**：

- `localStorage` 播放设置持久化（`scale` / `positionX` / `positionY` / `backgroundColor` / `clickToAction`）
- URL 模式（`?mode=show`）
- 编辑/展示模式
- 速度、暂停、循环、自动播放、包围盒设置

```text
localStorage keys:
spine-viewer:eye-hint:v1        # 眼睛提示是否已关闭
spine-viewer:model-views:v1     # 按模型记录的视图
spine-viewer:language:v1        # 界面语言
spine-viewer:clock:v1           # 时钟显示偏好
spine-viewer:spectrum:v1        # 频谱显示偏好
spine-viewer:album-art:v1       # 专辑封面显示偏好
spine-viewer:drawer-tab:v1      # 抽屉上次打开的标签
```

## 交互与层级

| 元素 | z-index | 说明 |
| --- | --- | --- |
| canvas | 默认 | 全屏画面 |
| `.debug-hud` | 4 | 左上角调试面板（可开关） |
| `.spectrum` | 3 | 贴边音频频谱 |
| `.clock-anchor` / `.album-art` | 5 | 时钟与专辑封面浮层 |
| `.viewer__settings-button` | 12 | 右下角眼睛按钮 |
| `.inspector-backdrop` | 15 | 抽屉打开时的透明点击层 |
| `.playback-inspector` | 20 | 右侧设置抽屉 |
| `.eye-hint` | 31 | 首次提示气泡 |

行为：

- 点击眼睛按钮切换抽屉。
- 抽屉打开时点击 backdrop 关闭抽屉。
- 抽屉关闭时点击 canvas 触发 `action`（如果开关开启）。
- 抽屉打开时 canvas 被 backdrop 覆盖，点击只会关闭抽屉，不会触发 `action`。
- 没有 `Esc` 快捷键。
- 调试面板由设置抽屉里的“显示调试信息”开关控制；勾选后显示并更新，窗口 resize 时刷新。

## 已知限制与取舍

- **部分持久化**：时钟、频谱、专辑封面、语言、抽屉标签、按模型的视图记录都已持久化；而播放设置（缩放/位置/背景色/点击开关）和当前模型只存在于 React state，刷新即重置，模型默认选清单第一项。
- **只处理部分模型**：当前只导入 128 / 377 个“有 action + angel + bg”的模型；NPC、单层、缺资源等暂不处理。
- **全模型包较大**：约 731 MB，构建/复制耗时。
- **无模式**：没有编辑/展示模式，也没有 URL 状态。
- **无播放控制**：只有动画切换和点击 Action，没有速度/暂停/循环/自动播放。
- **无包围盒调试**：没有逐层 bounds 绘制。
- **高 DPI 偏软**：canvas 未按 DPR 放大。
- **加载无超时**：`waitForLoad` 每 50ms 轮询，没有超时。
- **错误提示弱**：错误显示在抽屉状态行和调试面板里，没有全屏错误遮罩。
- **构建与部署**：`npm run build` 只写 `dist/`；`npm run build:we` 再调用 `scripts/copy-to-we.mjs` 替换 WE 目标目录；`dist/` 被 git 忽略。
- **无类型检查**：纯 JS，`vite build` 不会做类型检查。
- **沉浸式 UI**：不引入页头、页脚或卡片边框；设置以抽屉形式按需出现。

## 相关文件

- [src/App.jsx](../src/App.jsx)
- [src/components/SettingsDrawer.jsx](../src/components/SettingsDrawer.jsx)
- [src/components/Clock.jsx](../src/components/Clock.jsx)
- [src/components/Spectrum.jsx](../src/components/Spectrum.jsx)
- [src/components/MiniSpectrum.jsx](../src/components/MiniSpectrum.jsx)
- [src/components/AlbumArt.jsx](../src/components/AlbumArt.jsx)
- [src/utils/clock.js](../src/utils/clock.js)
- [src/utils/audio.js](../src/utils/audio.js)
- [src/utils/wallpaperAudio.js](../src/utils/wallpaperAudio.js)
- [src/utils/wallpaperMedia.js](../src/utils/wallpaperMedia.js)
- [src/utils/wallpaperPause.js](../src/utils/wallpaperPause.js)
- [index.html](../index.html)
- [src/spineStage.js](../src/spineStage.js)
- [src/spine-webgl.js](../src/spine-webgl.js)
- [src/base.css](../src/base.css)
- [src/App.css](../src/App.css)
- [src/components/Clock.css](../src/components/Clock.css)
- [src/components/SettingsDrawer.css](../src/components/SettingsDrawer.css)
- [src/components/Spectrum.css](../src/components/Spectrum.css)
- [src/components/MiniSpectrum.css](../src/components/MiniSpectrum.css)
- [src/components/AlbumArt.css](../src/components/AlbumArt.css)
- [vite.config.js](../vite.config.js)
- [scripts/import-models.mjs](../scripts/import-models.mjs)
- [scripts/prepare-models.mjs](../scripts/prepare-models.mjs)
- [scripts/package-models.mjs](../scripts/package-models.mjs)
- [scripts/copy-to-we.mjs](../scripts/copy-to-we.mjs)
