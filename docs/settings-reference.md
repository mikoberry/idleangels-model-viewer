# 设置字段参考

设置模型位于 `src/settings.ts`，通过 `spine-viewer:playback:v1` 持久化。本文档是字段、默认值、校验和扩展流程的参考；面向使用的说明见[使用指南](user-guide.md)。

## 数据结构

```ts
interface PlaybackSettings {
  defaultAnimation: string
  speed: number
  loopAction: boolean
  autoplay: boolean
  clickToAction: boolean
  scale: number
  positionX: number
  positionY: number
  showBounds: boolean
  backgroundColor: string
}
```

## 字段

### `defaultAnimation`

- 类型：`string`
- 默认：`DEFAULT_ANIMATION`，当前为 `"idle"`
- 有效值：当前骨架中存在的动画名；UI 提供 `idle`、`action`
- 存储校验：非空字符串
- 用途：进入展示模式时播放的动画

如果保存的动画在当前骨架中不存在，加载完成后会自动选择第一个可用动画。切换该设置会立即播放对应动画。

### `speed`

- 类型：`number`
- 默认：`1`
- UI 范围：`0.25`–`2`
- UI 步进：`0.25`
- 存储校验：有限数字，限制到 `0.25`–`2`
- Runtime 保护：`SceneAnimationController` 接受 `0.1`–`3`

正常 UI 不会产生范围外的值；runtime 的较宽范围只作为内部保护。

### `loopAction`

- 类型：`boolean`
- 默认：`false`
- 存储校验：必须是布尔值
- 用途：Action 播放结束后是否保持循环

开启时，`action` 在每次循环回绕后继续播放，不回到 `idle`。该值会同步到当前 Action entry 的 `loop` 属性。

### `autoplay`

- 类型：`boolean`
- 默认：`true`
- 存储校验：必须是布尔值
- 用途：进入展示模式时是否自动播放

进入展示模式时：

```text
autoplay = true  → setPaused(false)
autoplay = false → setPaused(true)
```

编辑模式会恢复为非暂停状态。

### `clickToAction`

- 类型：`boolean`
- 默认：`true`
- 存储校验：必须是布尔值
- 用途：展示模式下点击画布是否触发 `action`

关闭后，画布点击不会触发 Action；眼睛按钮和 `Esc` 仍可切换模式。

### `scale`

- 类型：`number`
- 默认：`1`
- 范围：`0.5`–`5`
- 对应百分比：`50%`–`500%`
- 滑杆步进：`0.01`，即 1%
- 手动输入：整数百分比，提交时限制到 `50`–`500`
- 存储校验：有限数字，限制到 `0.5`–`5`

换算关系：

```text
scale = percent / 100
percent = round(scale × 100)
```

相机 zoom 使用：

```text
camera.zoom = baseZoom / scale
```

### `positionX`

- 类型：`number`
- 默认：`0`
- 范围：`-100`–`100`
- 单位：视口宽度的百分比
- 存储校验：有限数字，限制到 `-100`–`100`
- 方向：正值画面向右移动

### `positionY`

- 类型：`number`
- 默认：`0`
- 范围：`-100`–`100`
- 单位：视口高度的百分比
- 存储校验：有限数字，限制到 `-100`–`100`
- 方向：正值画面向下移动

### `showBounds`

- 类型：`boolean`
- 默认：`false`
- 存储校验：必须是布尔值
- 用途：显示 `bg` / `angel` 的逐层动画包围盒

包围盒基于 `idle` 和 `action` 的采样结果，不随当前帧变化。

### `backgroundColor`

- 类型：`string`
- 默认：`"#06070d"`
- 格式：`#RRGGBB`
- 存储校验：`/^#[0-9a-f]{6}$/i`，保存为小写
- 用途：页面背景色

该颜色应用为根元素 CSS 变量 `--page-bg`，不参与 WebGL 渲染，也不改变模型纹理。

## 默认值

```ts
const DEFAULT_PLAYBACK_SETTINGS = {
  defaultAnimation: 'idle',
  speed: 1,
  loopAction: false,
  autoplay: true,
  clickToAction: true,
  scale: 1,
  positionX: 0,
  positionY: 0,
  showBounds: false,
  backgroundColor: '#06070d',
}
```

“恢复默认”会把这些值整体写回设置，并触发持久化；当前模式不变。

## 持久化

- Key：`spine-viewer:playback:v1`
- 写入：每次设置变化后由 `App` 的 effect 调用 `savePlaybackSettings`
- 读取：应用启动时同步调用 `loadPlaybackSettings`
- 环境：访问 `localStorage` 和 `window` 前均有可用性判断
- 异常：读取、解析或写入失败时静默回退/忽略，不阻塞应用

### 读取规则

```text
无存储
  → 默认值

JSON 解析失败
  → 默认值

解析成功
  → 默认值 + sanitize 后的字段
```

`sanitizeSettings` 只接受类型正确且通过范围限制的字段。缺失或非法的字段保留默认值。

### 版本策略

当前没有迁移逻辑，key 直接使用 `v1`。如果字段结构发生不兼容变化：

- 提升 key 版本，例如 `spine-viewer:playback:v2`；或
- 在读取时显式迁移旧数据

不要在不处理旧数据的情况下改变字段含义。

## URL 状态

模式是唯一写入 URL 的状态：

```text
?mode=show  → 展示模式
无该参数    → 编辑模式
```

`writeModeToLocation` 使用 `history.replaceState`，不会新增浏览历史记录。

设置不写入 URL。分享链接不会携带缩放、位置或背景色。

## 设置如何到达 Stage

```text
PlaybackInspector.onChange(patch)
  → App.setSettings
  → 保存到 localStorage
  → effect 同步 speed / loop / view / bounds
  → Stage actions
```

具体 effect：

- `speed` → `actions.setSpeed`
- `loopAction` → `actions.setLoopAction`
- `scale` / `positionX` / `positionY` → `actions.setView`
- `showBounds` → `actions.setShowBounds`
- `backgroundColor` → `--page-bg`
- `mode` → 播放默认动画、应用 autoplay、切换暂停状态

## 新增设置检查清单

1. 在 `PlaybackSettings` 中添加字段。
2. 在 `DEFAULT_PLAYBACK_SETTINGS` 中添加默认值。
3. 在 `sanitizeSettings` 中校验类型和范围。
4. 在 `PlaybackInspector` 中添加控件，并保证 `onChange` patch 正确。
5. 在 `App` 中添加同步到 Stage 或 CSS 的 effect。
6. 如需持久化之外的 URL 行为，明确是否需要更新 URL 策略。
7. 更新使用指南和本参考文档。
8. 运行 `npm run build`。
