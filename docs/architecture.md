# 架构设计

本文档描述当前仓库**实际存在**的实现：React 18 + Vite 5 + JSX，多模型全屏 WebGL 查看器。资源细节见[Spine 3.8 与资源](spine-runtime-and-assets.md)，设置字段见[设置字段参考](settings-reference.md)。

## 总览

```text
index.html
  └─ src/main.jsx
       └─ <App />
            ├─ fetch spine/models/manifest.json
            ├─ 默认选中 models[0]
            ├─ <canvas ref={canvasRef} />
            ├─ startSpineStage(canvas, { model, callbacks })
            ├─ <SettingsDrawer />  // 模型选择 + 播放设置
            ├─ 眼睛按钮 / 提示气泡
            ├─ <main style={{ backgroundColor }} />
            └─ 左上角调试面板（由抽屉开关控制）
```

核心原则：

- `App` 加载模型清单，持有画布、当前模型、播放设置、当前动画和抽屉状态。Stage 随选中模型创建/重建，抽屉开关不会重建它。
- `spineStage.js` 是不依赖 React 的命令式 WebGL 层，按 manifest 的 `layers` 动态加载 1~N 个图层。
- `spine-webgl.js` 是 vendored 的 Spine 3.8.99 运行时，只通过 `export { spine }` 暴露命名空间。
- 设置和当前模型只存在于 React state。当前版本没有持久化、没有 URL 状态、没有编辑/展示模式，刷新后默认选择清单第一个模型。

## 分层职责

### `src/main.jsx`

- 引入 `styles.css`。
- 创建 React root，渲染 `<App />`。
- 没有使用 `React.StrictMode`。

### `src/App.jsx`

- 持有：
  - `canvasRef` / `stageRef`
  - `status` / `isError`
  - `isDrawerOpen`
  - `showEyeHint`
  - `debugOpen` / `debugInfo`
  - `animations` / `currentAnimation`
  - `models` / `selectedModelId`
  - `viewSettings`
- 挂载后 fetch `spine/models/manifest.json`，默认选中 `models[0]`。
- 在 `selectedModel` 变化时调用 `startSpineStage(canvas, { model, onStatus, onAnimationChange, isCancelled })`；切换模型会先 dispose 旧 Stage。
- 把 Stage 返回的 `animations` 填进下拉框，并在 Stage ready 后应用当前模型已记录的视图；没有记录时用 `recommendedView`，再没有则 `100 / 0 / 0` + 黑色。
- 把 `viewSettings.scale` / `positionX` / `positionY` 同步到 `stage.setView()`。
- 把 `backgroundColor` 写到 `<main>` 的内联样式。
- 把 `clickToAction` 和抽屉状态接到 canvas 的 `pointerup` 上。
- 管理眼睛提示和调试面板。
- 渲染 `SettingsDrawer`；抽屉始终挂载，通过 `open` 控制动画和 `inert`。

### `src/SettingsDrawer.jsx`

- 受控组件：所有值来自 `settings` / `currentAnimation` / `animations` / `models`，修改通过 `onChange(patch)` / `onAnimationChange(name)` / `onModelChange(id)` 回传。
- 抽屉通过 `.is-open` 滑入；关闭时 `inert`，并通过 `aria-hidden` 对辅助技术隐藏。
- 包含：
  - 可搜索的 Spine 模型选择器
  - Spine 动画下拉框
  - “点击画面触发 action”开关
  - 缩放滑杆、数字输入、±1% 步进
  - 水平/垂直位置滑杆、数字输入、±1% 步进
  - 两个视图复位按钮
  - 背景色预设、取色器、十六进制输入
- 没有速度、暂停、循环、自动播放、包围盒等控件。

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

### `src/styles.css`

- 全屏布局：`html` / `body` / `#root` / `.viewer` 高度 100%，body 不滚动。
- 右侧抽屉、透明 backdrop、眼睛按钮、提示气泡、调试面板、移动端断点。
- 视觉上保持无页头、页脚和卡片边框。

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

当前**没有**：

- `localStorage` 播放设置持久化
- URL 模式（`?mode=show`）
- 编辑/展示模式
- 速度、暂停、循环、自动播放、包围盒设置

眼睛提示单独使用：

```text
localStorage key: spine-viewer:eye-hint:v1
```

## 交互与层级

| 元素 | z-index | 说明 |
| --- | --- | --- |
| canvas | 默认 | 全屏画面 |
| `.debug-hud` | 4 | 左上角调试面板（可开关） |
| `.inspector-backdrop` | 15 | 抽屉打开时的透明点击层 |
| `.playback-inspector` | 20 | 右侧设置抽屉 |
| `.viewer__settings-button` | 30 | 右下角眼睛按钮 |
| `.eye-hint` | 31 | 首次提示气泡 |

行为：

- 点击眼睛按钮切换抽屉。
- 抽屉打开时点击 backdrop 关闭抽屉。
- 抽屉关闭时点击 canvas 触发 `action`（如果开关开启）。
- 抽屉打开时 canvas 被 backdrop 覆盖，点击只会关闭抽屉，不会触发 `action`。
- 没有 `Esc` 快捷键。
- 调试面板由设置抽屉里的“显示调试信息”开关控制；勾选后显示并更新，窗口 resize 时刷新。

## 已知限制与取舍

- **无持久化**：播放设置和当前模型刷新即重置；模型默认选清单第一项。
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
- [src/SettingsDrawer.jsx](../src/SettingsDrawer.jsx)
- [src/spineStage.js](../src/spineStage.js)
- [src/spine-webgl.js](../src/spine-webgl.js)
- [src/styles.css](../src/styles.css)
- [vite.config.js](../vite.config.js)
- [scripts/import-models.mjs](../scripts/import-models.mjs)
- [scripts/prepare-models.mjs](../scripts/prepare-models.mjs)
- [scripts/package-models.mjs](../scripts/package-models.mjs)
- [scripts/copy-to-we.mjs](../scripts/copy-to-we.mjs)
