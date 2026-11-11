# 架构设计

本文档说明应用的分层、状态流、Spine 渲染生命周期和几个非直观实现。资源与运行时细节见[Spine 3.8 与资源管线](spine-runtime-and-assets.md)，设置字段见[设置字段参考](settings-reference.md)。

## 总览

```text
main.tsx
  └─ App
     ├─ useSpineStage ── SpineStage ── SpineLayer / SceneAnimationController
     ├─ SpineViewer（全屏 canvas + 加载/错误遮罩）
     ├─ PlaybackInspector（右侧设置抽屉）
     ├─ inspector-backdrop（编辑模式点击外部关闭）
     └─ mode-toggle（右下角眼睛按钮）
```

核心原则：

- `App` 持有模式、设置和 Stage Hook，因此切换设置抽屉不会销毁 canvas 或重新加载 Spine。
- `SpineStage` 是纯 TypeScript/WebGL 层，不依赖 React。
- `useSpineStage` 负责 React 生命周期、事件桥接和 UI 快照。
- 设置是单一数据源：UI 修改设置，设置 effect 再把结果推给 Stage。
- 资源只在启动时加载一次；模式切换只改变播放和界面状态。

## 分层职责

### `src/App.tsx`

- 持有 `mode`：`edit` / `show`。
- 持有 `PlaybackSettings`，从 `localStorage` 初始化。
- 持有 `useSpineStage()`，保证 Stage 与 canvas 在模式切换时保持挂载。
- 将设置变化同步到 Stage：
  - `speed` / `loopAction`
  - `scale` / `positionX` / `positionY`
  - `showBounds`
  - 展示模式下的默认动画、自动播放
- 将 `backgroundColor` 写入根元素 CSS 变量 `--page-bg`。
- 维护眼睛按钮近距离高亮状态。
- 管理 `Esc`、抽屉外点击和眼睛按钮的模式切换。

### `src/components/SpineViewer.tsx`

- 渲染全屏 `<canvas>`。
- 展示加载进度遮罩或错误遮罩。
- 展示模式且开启点击触发时，在画布 `pointerup` 调用 `triggerAction()`。
- 编辑模式下按需渲染 `DebugOverlay`。

### `src/components/PlaybackInspector.tsx`

- 始终挂载，通过 `.is-open` 控制滑入/滑出。
- 关闭时由 effect 设置 `inert`，防止隐藏面板被键盘或辅助技术访问。
- 缩放百分比使用本地输入状态，`Enter` 或失焦时提交，范围限制后写回设置。
- 所有其他设置直接通过 `onChange(patch)` 更新 `App`。

### `src/hooks/useSpineStage.ts`

- 在 canvas 挂载后创建 `SpineStage`。
- 把 Stage 事件转换为 React 状态：
  - 加载进度
  - 加载完成/错误
  - 当前动画、Action 开始/完成
  - FPS、zoom、视口尺寸
  - Spine 事件
- 暴露稳定 actions：播放、触发 Action、暂停、速度、循环、视图、边界、调试。
- 卸载时取消异步回调并销毁 Stage。

### `src/spine/`

- `SpineStage.ts`：WebGL 上下文、资源加载、渲染循环、相机、边界和调试绘制。
- `SpineLayer.ts`：单层骨架、动画状态、包围盒采样与绘制。
- `SceneAnimationController.ts`：`idle` / `action` 状态机。
- `assetLoader.ts`：AssetManager、二进制骨架和 atlas 读取。
- `camera.ts`：适配、屏幕/世界坐标转换。
- `manifest.ts`：图层配置和动画常量。
- `runtime/spine-webgl.js`：vendored Spine 3.8 运行时。

## 启动与加载流程

```text
React 挂载 canvas
  → useSpineStage 创建 SpineStage
  → 创建 WebGL 上下文和 SceneRenderer
  → SpineStage.load()
  → 为每个 layer 启动 AssetManager
  → 每 50ms 轮询加载进度
  → 读取 .skel 二进制 + atlas
  → 创建 SpineLayer
  → SceneAnimationController.init() 播放 idle
  → 采样各层 idle/action 包围盒
  → 计算场景 union bounds
  → resize + fitView
  → 启动 requestAnimationFrame
  → 触发 onReady
```

关键点：

- 两个图层并行加载，进度按所有 manager 的已加载/总数合并。
- 骨架通过 `spine.SkeletonBinary` 读取，不读取 JSON。
- 若包围盒采样失败，使用 `[-100, 100]` 的回退范围，避免相机无法初始化。
- `onReady` 在渲染循环启动后触发。

## 渲染循环

`SpineStage.frame()` 每帧执行：

1. 计算时间增量，最大限制为 `0.05s`，避免切后台后动画跳帧。
2. 若未暂停，按 `delta × speed` 更新所有 layer。
3. 清空画布为透明。
4. 依次绘制按 `zIndex` 排序的图层。
5. 可选绘制每层动画边界。
6. 可选绘制整体边界和骨架调试信息。
7. 每 500ms 向 UI 发送一次 FPS、视口和 camera zoom。

画布使用：

```ts
{
  alpha: true,
  premultipliedAlpha: true,
  antialias: true
}
```

因此页面背景色由 CSS 显示，canvas 本身清空为透明。

## 相机与视图变换

`SpineStage.fitView()` 的执行顺序：

1. 使用场景包围盒计算适配 zoom，并保留 6% padding。
2. 除以用户缩放：`camera.zoom = baseZoom / scale`。
3. 以场景中心为基准应用位置偏移。

代码中的偏移方向：

```text
camera.x = centerX - offsetX × canvasWidth × zoom
camera.y = centerY + offsetY × canvasHeight × zoom
```

因此：

- 水平偏移为正时，画面向右移动。
- 垂直偏移为正时，画面向下移动。
- 缩放和偏移会叠加，放大后可能裁切画面。

窗口尺寸变化时使用 `ResizeObserver`，按设备像素比重新设置画布尺寸，DPR 上限为 `2`，随后重新适配视图。

## 包围盒

加载完成后，每个 layer 会：

- 找出自己拥有的 `idle` / `action` 动画。
- 对每个动画采样 10 个时间点。
- 求该层所有采样结果的 union bounds。
- 把所有层的 bounds 再求一次 union，得到场景 bounds。

用途：

- 相机初始适配
- 调试叠层的整体 bounds
- “显示动画边界”的逐层包围盒

逐层边界使用固定颜色区分 `bg` 和 `angel`；调试模式还会调用 Spine 自带的骨架调试绘制。

## 动画状态机

`SceneAnimationController` 维护：

- 当前动画
- 是否正在播放 Action
- 暂停状态
- 速度
- 循环 Action 开关
- 每次触发的 token
- 等待完成的 layer 集合

### 初始化

`init()` 显式播放 `idle`，并设置为循环。不能依赖骨架默认动画，因为 `action` 在骨架中可能排在前面。

### 触发 Action

`triggerAction()`：

- 增加 token，使旧的完成回调失效。
- 对每个拥有 `action` 的 layer 播放 Action。
- 如果该层当前已经在播放 Action，则混合时间为 0，实现立即重播。
- 给每个 Action entry 挂接 `complete` 监听。
- 等待所有相关 layer 完成。

### 完成与循环

Spine 3.8 在每次循环回绕时也会触发 `complete`。因此：

```ts
if (this.loopAction) return
```

必须在 `handleActionComplete` 中保留。否则循环中的 Action 会在第一次回绕时错误回到 `idle`。

未开启循环时，所有相关 layer 完成后统一回到 `idle`；开启循环时保持 Action，不触发回到 idle 的完成事件。

## 设置与状态流

```text
localStorage
  → loadPlaybackSettings()
  → App.settings
  → savePlaybackSettings()（每次变更）
  → 设置 effects
  → SpineStageActions
  → SpineStage / SceneAnimationController
```

模式流：

```text
URL ?mode=show
  → readModeFromLocation()
  → App.mode
  → 展示/编辑 UI
  → writeModeToLocation()（replaceState）
```

模式切换 effect 在 Stage ready 后执行：

- 进入展示模式：应用速度/循环、播放默认动画、按 `autoplay` 设置暂停。
- 回到编辑模式：取消暂停。

## 页面背景色

`backgroundColor` 不经过 WebGL，而是：

1. `App` 把颜色写入 `document.documentElement` 的 `--page-bg`。
2. `:root`、`body` 使用该 CSS 变量作为背景。
3. `.spine-viewer` 和 canvas 保持透明。

这样颜色会出现在 canvas 透明区域、图层透明部分和缩放后的留白处，并且不会给模型叠加色调。

## 交互与层级

| 层级 | z-index | 说明 |
| --- | --- | --- |
| canvas / 加载遮罩 | 默认 | 全屏画面 |
| `inspector-backdrop` | 15 | 编辑模式下透明点击遮罩 |
| `playback-inspector` | 20 | 右侧设置抽屉 |
| `mode-toggle` | 30 | 眼睛按钮 |

点击遮罩会把模式切到 `show`，效果与点击眼睛按钮一致。抽屉本身在遮罩之上，所以面板内部点击不会误触。

眼睛按钮通过全局 `pointermove` 计算与按钮中心的距离，进入约 `96px` 半径后添加 `is-near`，由 CSS 提升透明度。计算使用 `requestAnimationFrame` 节流，避免每次移动都同步布局。

## 关键约束与取舍

- **固定 Spine 3.8**：数据和导出格式决定运行时版本，升级 4.x 不是替换文件即可完成。
- **vendored runtime**：避免 npm 依赖漂移，同时保留 ESM 包装。
- **资源生成**：`public/spine` 不作为源文件维护，统一由脚本从模型目录生成。
- **无全局状态库**：当前状态规模小，`App` + Hook + props 足够，避免额外抽象。
- **无测试/lint 套件**：以严格 TypeScript 构建和 headless 浏览器验证兜底。
- **沉浸式 UI**：不引入页头、页脚或卡片边框；设置以抽屉形式按需出现。
- **命中测试工具未接入 UI**：`hitTest.ts` 和 `SpineStage.hitTestWorld()` 已提供基础能力，当前点击交互直接触发 Action，不做精确命中。
