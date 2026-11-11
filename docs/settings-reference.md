# 设置字段参考

当前设置模型位于 [src/App.jsx](../src/App.jsx) 的 `viewSettings` React state 中，**没有持久化**。本文档列出当前实际字段、默认值、范围、生效路径和扩展方式。

## 数据结构

```js
const [viewSettings, setViewSettings] = useState({
  scale: 2.4,
  positionX: -30,
  positionY: -27,
  backgroundColor: '#06070d',
  clickToAction: true,
})
```

当前模型和动画是独立 state：

```js
const [models, setModels] = useState([])
const [selectedModelId, setSelectedModelId] = useState(null)
const [currentAnimation, setCurrentAnimation] = useState('idle')
```

`models` 来自 `public/spine/models/manifest.json`；页面加载后默认选中 `models[0]`。

眼睛提示是否看过使用单独的 `localStorage` key，与播放设置无关：

```text
spine-viewer:eye-hint:v1
```

## 字段

### `scale`

- 类型：`number`
- 默认：`2.4`，即 240%
- 范围：`0.5`–`5`，即 50%–500%
- UI：
  - 滑杆步进 `0.01`
  - 数字输入按整数百分比提交
  - ± 按钮每次 1%
- Stage 保护：`setView` 会再次限制到 `[0.5, 5]`
- 相机映射：

  ```text
  camera.zoom = baseZoom / scale
  ```

  因此 `scale` 越大，画面显示越大。

百分比换算：

```text
scale = percent / 100
percent = round(scale × 100)
```

### `positionX`

- 类型：`number`
- 默认：`-30`
- 范围：`-100`–`100`
- 单位：视口宽度的百分比
- App 传给 Stage 时除以 100：`positionX / 100`
- Stage 保护：`[-1, 1]`
- 方向：正值画面向右移动
- 相机公式：

  ```text
  camera.x = centerX - offsetX × canvasWidth × zoom
  ```

### `positionY`

- 类型：`number`
- 默认：`-27`
- 范围：`-100`–`100`
- 单位：视口高度的百分比
- App 传给 Stage 时除以 100：`positionY / 100`
- Stage 保护：`[-1, 1]`
- 方向：正值画面向下移动
- 相机公式：

  ```text
  camera.y = centerY + offsetY × canvasHeight × zoom
  ```

### `backgroundColor`

- 类型：`string`
- 默认：`"#06070d"`
- 格式：`#RRGGBB`（大小写不敏感，提交后转小写）
- 校验：`/^#[0-9a-f]{6}$/i`
- 用途：写到 `<main>` 的内联 `backgroundColor`
- 不参与 WebGL：canvas 清空为透明，颜色显示在透明区域和留白处
- 无效输入：失焦时恢复为当前 `value`

### `clickToAction`

- 类型：`boolean`
- 默认：`true`
- 用途：抽屉关闭时，点击 canvas 是否触发 `action`
- 生效条件：
  - 抽屉必须是关闭状态
  - 鼠标事件必须是左键；触摸/触控笔不受按键限制
- 关闭开关时，`App` 会主动 `play('idle')`
- 抽屉打开时，backdrop 覆盖 canvas，点击只会关闭抽屉

### 当前模型 `selectedModelId`

- 类型：`string`
- 初始值：`manifest.models[0].id`
- 可选值：当前打包清单里的模型 id（目录名）
- UI：设置抽屉顶部“Spine 模型”搜索选择器
- 切换行为：dispose 旧 Stage，按新模型重新加载资源；保留缩放、位置、背景色、点击开关
- 持久化：不持久化；刷新后总是第一个模型
- 当前全模型包有 128 个可选模型

### `currentAnimation`

- 类型：`string`
- 初始值：`"idle"`
- 可选值：Stage 返回的 `animations`；当前资源为 `idle`、`action`
- 选择 `idle`：循环播放
- 选择 `action`：调用 `triggerAction()`，播放一次后回到 `idle`
- UI 标签：
  - `idle` → “待机 · idle”
  - `action` → “动作 · action”
  - 其他动画名直接显示原名

## 默认值汇总

```js
{
  scale: 2.4,
  positionX: -30,
  positionY: -27,
  backgroundColor: '#06070d',
  clickToAction: true,
}
```

当前没有“恢复所有默认值”按钮。抽屉里只有两个**视图**复位按钮：

| 按钮 | 效果 |
| --- | --- |
| 初始 100 / 0 / 0 | `scale = 1`、`positionX = 0`、`positionY = 0` |
| 推荐 240 / -30 / -27 | `scale = 2.4`、`positionX = -30`、`positionY = -27` |

这两个按钮不会修改背景色或 `clickToAction`。

## 持久化

当前行为：

- `scale`、`positionX`、`positionY`、`backgroundColor`、`clickToAction`、`selectedModelId` 只存在于 React state。
- 刷新页面后播放设置恢复默认值，并重新选中清单第一个模型。
- 没有 `spine-viewer:playback:v1` 或其他播放设置存储 key。
- 没有 `sanitizeSettings` / 版本迁移逻辑。
- 唯一写入 `localStorage` 的是眼睛提示：

  ```text
  spine-viewer:eye-hint:v1
  ```

  读取/写入都包在 `try/catch` 中，失败时静默忽略。

如果后续要加持久化，建议：

1. 新增一个明确的 key，例如 `spine-viewer:playback:v1`。
2. 读取时只接受类型正确、范围合法的字段，其他字段回退默认值。
3. 写入时处理 `localStorage` 不可用或配额异常。
4. 如果字段语义发生不兼容变化，提升 key 版本或显式迁移。
5. 同步更新本文档和[使用指南](user-guide.md)。

## URL 状态

当前版本没有 URL 状态：

- 没有 `?mode=show`。
- 没有编辑/展示模式。
- 设置不写入 URL。
- 刷新后不保留任何播放设置。

## 设置如何到达 Stage

```text
SettingsDrawer 模型选择
  → App.handleModelChange(id)
  → App.selectedModelId
  → Stage effect 清理旧 Stage 并按新 model 重新加载
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
SettingsDrawer 动画选择
  → App.handleAnimationChange(name)
  → stage.play(name)
  → Stage onAnimationChange(name)
  → App.setCurrentAnimation(name)
```

```text
backgroundColor
  → <main style={{ backgroundColor }} />
```

```text
clickToAction
  → canvas pointerup 处理器
  → 抽屉关闭且开关为 true 时 stage.triggerAction()
```

## 新增设置检查清单

1. 在 `App.jsx` 的 `viewSettings` 初始值中加入字段。
2. 在 `SettingsDrawer.jsx` 中加入控件，并通过 `onChange({ field: value })` 回传。
3. 如果是 Stage 相关设置：
   - 在 `App.jsx` 中加同步 `useEffect`，或
   - 扩展 `spineStage.js` 返回的 API。
4. 做范围/类型校验；当前没有统一的 `sanitizeSettings`，需要手动保证。
5. 如果要做持久化，按上面的持久化建议实现，不要只写不读。
6. 更新本文件、[使用指南](user-guide.md) 和必要的架构说明。
7. 运行 `npm run build` 验证；需要部署到 WE 时直接运行 `npm run build:we`（它会重新构建并复制），然后在 Wallpaper Engine 中手动验证。
