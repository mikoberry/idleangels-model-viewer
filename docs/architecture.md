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
            ├─ <ControlOverlays />  // 引擎数据 → WallKit 的 Clock / Spectrum / AlbumArt
            ├─ <SettingsDrawer />  // 标签：WE 中为时间 / 频谱 / 模型 / 其它，浏览器中只有模型 / 其它
            ├─ 眼睛按钮
            ├─ <main style={{ backgroundColor }} />
            └─ 左上角调试面板（由抽屉开关控制）
```

核心原则：

- `App` 加载模型清单，持有画布、当前模型、播放设置、当前动画和抽屉状态。Stage 随选中模型创建/重建，抽屉开关不会重建它。
- **控件层由外部库 WallKit 渲染**（`wallkit/components/clock` 等）。本仓库只保留应用层：`App` 持有设置、`ControlOverlays` 采集引擎数据，两者都不渲染控件的视觉。
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
  - `debugOpen` / `debugInfo`
  - `animations` / `currentAnimation`
  - `models` / `selectedModelId` / `recordedViews`
  - `viewSettings`
  - `language` / `t`
  - `clock` / `spectrum` / `albumArt`（三个独立的持久化偏好 state）
  - `inWallpaperEngine`（环境检测，决定模型选择器是否渲染、浮层是否挂载和抽屉默认状态：浏览器默认打开，WE 默认收起）
- 挂载后通过 XHR 加载 `spine/models/manifest.json`，默认选中 `models[0]`。
- 在 `selectedModel` 变化时调用 `startSpineStage(canvas, { model, t, onStatus, onAnimationChange, isCancelled })`；`onStatus(key, vars, error)` 传状态 key，由 App 按当前语言渲染；切换模型会先 dispose 旧 Stage。
- 把 Stage 返回的 `animations` 填进下拉框，并在 Stage ready 后应用当前模型已记录的视图；没有记录时用 `recommendedView`，再没有则 `100 / 0 / 0` + 黑色。
- 把 `viewSettings.scale` / `positionX` / `positionY` 同步到 `stage.setView()`。
- 把 `backgroundColor` 写到 `<main>` 的内联样式。
- 把 `clickToAction` 和抽屉状态接到 canvas 的 `pointerup` 上。
- 管理调试面板；调试面板在打开时收集环境、尺寸、WebGL、音频状态等 16 行信息。
- 为 `clock` / `spectrum` / `albumArt` 各自定义 `normalize*` 或夹取逻辑，并在 `useEffect` 中把每次变化写回各自的 `localStorage` key；`recordModelView` 只在用户点击“记录当前视图”时写 `model-views`。
- 渲染 `Spectrum` / `AlbumArt` / `Clock` 三个浮层（**仅 Wallpaper Engine 中挂载**：浏览器里整段用 `inWallpaperEngine &&` 跳过，所以模型预设里的 `clock.show` / `spectrum.show` / `albumArt.show` 在浏览器中也不会让它们出现），以及 `SettingsDrawer`；抽屉始终挂载，通过 `open` 控制动画和 `inert`。

### `src/components/SettingsDrawer.jsx`

- 受控组件：所有值来自 `settings` / `currentAnimation` / `animations` / `models` / `clock` / `spectrum` / `albumArt`，修改通过 `onChange(patch)` / `onAnimationChange(name)` / `onModelChange(id)` / `onClockChange` / `onSpectrumChange` / `onAlbumArtChange` / `onLanguageChange` / `onDebugChange` 回传；文案通过 `t` 获取。
- 抽屉通过 `.is-open` 滑入；关闭时 `inert`，并通过 `aria-hidden` 对辅助技术隐藏。
- **左侧竖向标签分区**：`.inspector-body` 内含 `.inspector-nav`（标签菜单）与 `.inspector-pane`（当前标签内容）。四个标签（`clock` 和 `spectrum` 仅在 Wallpaper Engine 中可用）：
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
  - 频谱：显示开关、样式、水平位置、垂直位置、缩放、颜色
  - 专辑封面：显示开关、角落、大小、水平/垂直位置
- 没有速度、暂停、循环、自动播放、包围盒等控件。
- 颜色输入（背景色与频谱颜色）共用 `BackgroundColorField`：预设色块、HSV 色域、色相条、`#RRGGBB` 输入框。

### `src/components/ControlOverlays.jsx`

- 把引擎数据喂给 WallKit 的三个浮层（`Clock` / `Spectrum` / `AlbumArt`），只存在于 Wallpaper Engine 分支（`App` 用 `inWallpaperEngine &&` 挂载）。
- 持有：`now`（1 秒 ticker）、`beat`（音频低频，rAF 缓动）、`track`（媒体信息，1 秒轮询）、`paused`（暂停桥接）。
- **bars 用一块固定的 `Float32Array`**：音频帧在 rAF 里原地写入，直接作为 `bars` prop 传给两个频谱控件。WallKit 在内部把 prop 存进 ref、在自己的绘制循环里逐帧读取，所以原地改写就能更新画面，不需要每帧触发 React 重渲染。
- 时钟的 `now` 由这里驱动（WallKit 的 Clock 不持有定时器）；暂停时停止 ticker，恢复时立即刷新一次。`visibilitychange` 同样处理。
- `labels` 用 `useMemo` 挂在 `now` / `language` 上：日期格式化走 `Intl`，不能跟着每秒 60 次律动重渲染一起重算。
- 暂停时整个音频循环停止（`paused` 同时传给 `Spectrum` / `AlbumArt`，让它们 cancel rAF）。

### 控件视觉：WallKit（外部仓库）

`Clock` / `Spectrum` / `MiniSpectrum` / `AlbumArt` 的视觉、CSS 与绘制循环都在 [WallKit](https://github.com/mikoberry/wallkit)，通过 `wallkit/components/*` 子路径导入，不在本仓库内。

- WallKit 是**纯展示库**：只认 props，不读 `window.wallpaper*`、不轮询媒体、不持有数据定时器、不含 i18n。
- 本仓库负责它需要的一切输入：音频帧（`extractSpectrumBars`）、媒体信息（`getWallpaperMedia`）、暂停标志、文案（`i18n.js` 的 `labels`）。
- 两边的字段并不完全对应，换算集中在 [src/utils/controlOverlay.js](../src/utils/controlOverlay.js)：频谱的 `offsetX/offsetY`（本地是盒子中心）→ 左下锚点，`size`（20–500，100 = 30vw × 15vh 基准盒）；专辑卡片的 `size`（本地是 vh 百分比）→ WallKit 百分比（100 = 18vh 封面）。
- **专辑卡片不再支持四角锚定**：WallKit 统一左下锚点，`corner` 字段已从设置中移除，`offsetX` 默认 64 让卡片落在右下角附近。
- 控件层自带 `--wallkit-*` 主题变量，本仓库没有覆盖它们。

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
- `spineStage.js` 在暂停时跳过整帧绘制（保留 rAF 以便立即恢复）；`ControlOverlays.jsx` 停止音频循环与时钟 ticker，并把 `paused` 传给 WallKit 的 `Spectrum` / `AlbumArt`（它们会 cancel rAF）；时钟在恢复时立即刷新时间。

### `src/utils/audio.js`

- 纯函数模块：`summarizeWallpaperAudio`、`extractSpectrumBars`、`syntheticSpectrum`、`syntheticAudioLevel`、`smoothAudioLevel`、`spectrumGradientStops`，以及 `AUDIO_BANDS` / `SPECTRUM_BARS` / `DEFAULT_SPECTRUM_COLOR` 常量。
- `spectrumGradientStops(hex)` 把 `#rrggbb` 转成柱子的两个渐变端点（顶部 0.95、底部 0.45 透明度）；输入不合法时返回 `null`，调用方回退到默认色，避免画不出柱子。
- `extractSpectrumBars(frame)` 把左右各 64 个频段映射成 128 根柱子（右声道镜像），经过 `denoise()`：低于 `NOISE_FLOOR = 0.06` 的采样归零并重新缩放，消除引擎静音时的整片微颤；长度不足或非数组返回 `null`。
- `syntheticSpectrum(t)` / `syntheticAudioLevel(t)` 是确定性的模拟数据，**目前只作为纯函数保留**：浏览器不挂载三个浮层，所以没有任何界面在用它们，不要再接回控件（WallKit 明确拒绝假数据兜底）。
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
- `src/App.css`：调试面板、眼睛按钮。
- `src/components/SettingsDrawer.css`：右侧抽屉、标签菜单、表单控件与窄屏断点。
- 三个浮层的样式在 WallKit 仓库内，由各组件自己 import，本仓库不覆盖。

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

`triggerAction()` 走 `startAction(false)`，`play('action')` 走 `startAction(true)`：

1. `startAction(force)`：如果 `actionInFlight` 为真且 `force` 为假，直接返回。点击画面是非强制调用，所以 `action` 播放期间快速连点会被忽略，要等回到 `idle` 才能再次触发；下拉框选择 `action` 是强制调用，仍会从头重播。
2. `actionToken += 1`，使旧回调失效。
3. 清空 `pendingActionLayers`。
4. 对每个拥有 `action` 的图层：
   - `state.setAnimation(0, 'action', false)`；
   - 如果当前已经是 `action`，设置 `entry.mixDuration = 0` 立即重播；
   - 挂 `complete` 监听；
   - 把图层 id 加入 pending 集合。
5. 有图层启动成功时，置 `actionInFlight = true`，并把当前动画更新为 `action`。

### 完成

`complete` 回调：

1. token 不匹配就忽略。
2. 从 pending 集合删除该图层。
3. pending 为空时调用 `returnToIdle()`：
   - 置 `actionInFlight = false`，重新允许点击触发；
   - 对拥有 `idle` 的图层设置 `idle` 循环；
   - 当前动画更新为 `idle`。

### 播放其他动画

`play(name)`：

- `action` 转给 `startAction(true)`，强制重播，不受“播放中忽略”的拦截。
- 其他动画：token 递增、清 pending、**`actionInFlight = false`**，再对拥有该动画的图层设置循环播放。这一步必须清除标记：token 递增后 `action` 的 `complete` 回调会被忽略，否则标记会永久停在 `true`，之后的点击全部失效。
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
  → ControlOverlays 重新渲染，换算成 WallKit 的 props
  → useEffect 写入各自的 localStorage key
```

```text
WallKit 的 props 换算（src/utils/controlOverlay.js）
  spectrum  { size, offsetX(中心), offsetY(中心) } → { size, offsetX(左下), offsetY(左下) }
  albumArt  { size(vh 百分比) }                    → { size(WallKit 百分比) }
  clock     { now, language, t }                   → { labels: { locale, weekday, dateWithWeekday, aria } }
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
| `.wallkit-spectrum__anchor` | 3 | 浮动的音频频谱 |
| `.wallkit-clock__anchor` / `.wallkit-album-art` | 5 | 时钟与专辑封面浮层 |
| `.viewer__settings-button` | 12 | 右下角眼睛按钮 |
| `.inspector-backdrop` | 15 | 抽屉打开时的透明点击层 |
| `.playback-inspector` | 20 | 右侧设置抽屉 |

行为：

- 点击眼睛按钮切换抽屉。
- 抽屉打开时点击 backdrop 关闭抽屉。
- 抽屉关闭时点击 canvas 触发 `action`（如果开关开启）。
- 抽屉打开时 canvas 被 backdrop 覆盖，点击只会关闭抽屉，不会触发 `action`。
- 没有 `Esc` 快捷键。
- 调试面板由设置抽屉里的“显示调试信息”开关控制；勾选后显示并更新，窗口 resize 时刷新。

## 已知限制与取舍

- **部分持久化**：时钟、频谱、专辑封面、语言、抽屉标签、按模型的视图记录都已持久化；而播放设置（缩放/位置/背景色/点击开关）和当前模型只存在于 React state，刷新即重置，模型默认选清单第一项。
- **只处理部分模型**：当前导入 332 / 377 个模型（有 `angel` + 有 `action` + 单套资源，`bg` 可选）；NPC、兽娘 `spine_sn*`、缺资源、多套资源等暂不处理。
- **全模型包较大**：约 1.2 GB，构建/复制耗时。
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
- [src/components/ControlOverlays.jsx](../src/components/ControlOverlays.jsx)
- [src/utils/controlOverlay.js](../src/utils/controlOverlay.js)
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
- [src/components/SettingsDrawer.css](../src/components/SettingsDrawer.css)
- [vite.config.js](../vite.config.js)
- [scripts/import-models.mjs](../scripts/import-models.mjs)
- [scripts/prepare-models.mjs](../scripts/prepare-models.mjs)
- [scripts/package-models.mjs](../scripts/package-models.mjs)
- [scripts/copy-to-we.mjs](../scripts/copy-to-we.mjs)
