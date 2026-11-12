# 设置字段参考

当前设置模型位于 [src/App.jsx](../src/App.jsx) 的 `viewSettings` React state 中。`viewSettings` 本身不会自动持久化；点击“记录当前视图”后会按模型写入 `localStorage`。时钟 `clock`、频谱 `spectrum`、专辑封面 `albumArt` 是三个独立 state，各自持久化。本文档列出当前实际字段、默认值、范围、生效路径和扩展方式。

## 数据结构

```js
const [viewSettings, setViewSettings] = useState({
  scale: 1,
  positionX: 0,
  positionY: 0,
  backgroundColor: '#000000',
  clickToAction: true,
})
```

模型加载完成后，如果当前模型在 `model-presets.json` 里有推荐视图，会覆盖 `scale` / `positionX` / `positionY` / `backgroundColor`。

当前模型和动画是独立 state：

```js
const [models, setModels] = useState([])
const [selectedModelId, setSelectedModelId] = useState(null)
const [currentAnimation, setCurrentAnimation] = useState('idle')
```

`models` 来自 `public/spine/models/manifest.json`；页面加载后默认选中 `models[0]`。

## 字段

### `scale`

- 类型：`number`
- 默认：当前模型推荐值；没有推荐时 `1`（100%）
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
- 默认：当前模型推荐值；没有推荐时 `0`
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
- 默认：当前模型推荐值；没有推荐时 `0`
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
- 默认：当前模型推荐背景色；没有推荐时 `"#000000"`
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
- UI：设置抽屉语言按钮下方的“Spine 模型”搜索选择器（**仅在浏览器中显示，Wallpaper Engine 中整个模型区块被隐藏**）
- 切换行为：dispose 旧 Stage，按新模型重新加载资源；优先应用该模型已记录的视图，没有记录时使用推荐缩放/位置/背景色，再没有则回到 `100 / 0 / 0` + 黑色
- 持久化：模型选择本身不持久化；刷新后总是第一个模型
- 本地全模型包有 332 个可选模型，线上部署子集为 50 个

### 界面语言

- 类型：`'zh' | 'en' | 'ja' | 'ko'`
- 默认：浏览器语言；无法识别时回退 `en`
- UI：设置抽屉顶部的四个语言按钮
- 持久化：写入 `localStorage` 的 `spine-viewer:language:v1`
- 切换后立即更新界面文案、状态信息和 `<html lang>`

### 时钟显示 `clock`（独立 state）

时间与日期显示不是 `viewSettings` 的字段，而是 `src/App.jsx` 中独立的 `clock` state：

```js
const DEFAULT_CLOCK = {
  show: false,
  placement: 'card',
  offsetX: 10,
  offsetY: 50,
  size: 100,
  reactToBeat: false,
  beatIntensity: 100,
}
```

| 字段 | 类型 | 默认值 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `show` | `boolean` | `false` | — | 是否显示当前时间与日期 |
| `placement` | `'minimal' \| 'cyberpunk' \| 'infobar' \| 'split' \| 'poster' \| 'card' \| 'bar'` | `'minimal'` | — | 时钟布局风格：极简数字、赛博朋克霓虹、横向信息条、双行分层、大字海报、经典竖排、经典横排 |
| `theme` | `'dark' \| 'light'` | `'dark'` | — | 时钟色彩模式（深色 / 浅色） |
| `use24Hour` | `boolean` | `true` | — | 是否启用 24 小时制（为 `false` 时显示 12 小时制 AM/PM） |
| `offsetX` | `number` | `10` | `0`–`100` | 水平位置，窗口宽度的百分比，正值向右 |
| `offsetY` | `number` | `50` | `0`–`100` | 垂直位置，窗口高度的百分比，正值向上 |
| `size` | `number` | `100` | `40`–`200` | 字号百分比，`100` 为默认大小 |
| `reactToBeat` | `boolean` | `false` | — | 是否随音频低频律动（缩放 + 光晕） |
| `beatIntensity` | `number` | `100` | `0`–`1000` | 律动强度百分比，缩放律动的放大与光晕幅度；`0` 等于看不出反应 |

默认值对应**左边距 10%、垂直居中**（`bottom: 50%` 让卡片底边落在视口中线）。

- 位置以**左下角**为原点。**所有小组件统一使用 `0%`–`100%` 的位置范围**：`0%` 贴锚定边，`100%` 贴对边，取值不会把组件推到屏幕外。Spine 模型的画面位置（`positionX` / `positionY`）使用自己的 `-100`–`100` 范围，与此无关。
- 范围常量定义在 [src/utils/clock.js](../src/utils/clock.js)：`CLOCK_OFFSET_MIN`、`CLOCK_OFFSET_MAX`、`CLOCK_SIZE_MIN`、`CLOCK_SIZE_MAX`，抽屉和 `App.jsx` 共用，避免控件与校验范围不一致。
- 所有字段在**加载时和每次更新时**都经过 `normalizeClock()` 校验并夹取范围，非法值回退到默认值。
- 持久化：写入 `localStorage` 的 `spine-viewer:clock:v1`（只存这七个字段）。
- 与其它播放设置不同，`clock` **会持久化**，因为它属于显示偏好而非按模型记录的视图。
- 时间每秒刷新一次；秒数不变时不触发 React 重渲染。
- 时钟**没有背景**：无边框、无底色、无卡片阴影，只有文字和一层柔和投影保证在亮色画面上可读。
- 时钟浮层设置了 `pointer-events: none`，不会拦截画布的点击触发 `action`。
- **跟随鼠标摆动**：浮层按鼠标相对**视口中心**的位置做 3D 倾斜（`perspective(900px) rotateX/rotateY`，最大 14°）。鼠标指向右上角区域时，右上角向观察者翘起、左下角向屏幕内侧下沉；指向其它方向同理。
  - 角度按视口尺寸归一化，所以鼠标在整个屏幕上移动时倾斜**线性变化**，不会一出卡片就跳到极限。
  - 倾斜值用 rAF 循环 + 指数缓动（`smoothStep`）追随目标，帧率无关且平滑，收尾时自动吸附。
  - 指针移出窗口后回到平放。
  - 计算逻辑是 `computeClockTilt()` 与 `smoothStep()`。
  - 组件不再使用 CSS `transition`，避免每次指针移动都重启过渡造成卡顿。
- 系统开启「减少动态效果」（`prefers-reduced-motion: reduce`）时，倾斜关闭。
- Wallpaper Engine 中壁纸被暂停/恢复时，通过共享的暂停桥接（`wallpaperPause.js`）或 `visibilitychange` 立即刷新显示。
- 时间格式固定为 24 小时制；日期与周几跟随界面语言（中文/英文/日文/韩文）。

## 音频频谱 `spectrum`（独立 state）

频谱柱状图有自己的 state，与时钟的 `reactToBeat` 相互独立：

```js
const DEFAULT_SPECTRUM = {
  show: false,
  position: 'bottom',
  height: 22,
  offsetX: 0,
  color: DEFAULT_SPECTRUM_COLOR, // '#a8c4ff'
}
```

| 字段 | 类型 | 默认值 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `show` | `boolean` | `false` | — | 是否显示频谱 |
| `position` | `'bottom' \| 'top'` | `'bottom'` | — | 贴屏幕哪一边 |
| `height` | `number` | `22` | `8`–`60` | 占用屏幕高度的百分比 |
| `offsetX` | `number` | `0` | `0`–`100` | 水平位置，窗口宽度的百分比，正值向右 |
| `color` | `string` | `#a8c4ff` | `#RRGGBB` | 柱子颜色；由 `spectrumGradientStops()` 生成上下两道渐变 |

- 持久化：`localStorage` 的 `spine-viewer:spectrum:v1`。
- 共 **128 根柱子**，与 Wallpaper Engine 的 128 个频段一一对应：左声道占 0–63，右声道镜像占 64–127，低频在两端。
- 用 **Canvas 2D** 绘制（128 个 DOM 节点在 60fps 下开销过大），每帧一次绘制。
- 只绘制柱子，没有峰值标记。
- 浮层 `pointer-events: none`，不拦截画布点击。
- 数据来源见下节「音频数据来源」。

## 专辑封面 `albumArt`（独立 state）

从 Wallpaper Engine 的媒体集成读取封面与曲目信息，卡片锚定在屏幕四角之一：

```js
const DEFAULT_ALBUM_ART = {
  show: false,
  corner: 'bottom-right',
  size: 18,
  offsetX: 0,
  offsetY: 0,
}
```

| 字段 | 类型 | 默认值 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| `show` | `boolean` | `false` | — | 是否显示专辑封面卡片 |
| `corner` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | — | 锚定的角落 |
| `size` | `number` | `18` | `10`–`40` | 卡片高度，占视口高度的百分比（卡片宽度为该值的 3.6 倍） |
| `offsetX` | `number` | `0` | `0`–`100` | 从所选角落向内的水平偏移 |
| `offsetY` | `number` | `0` | `0`–`100` | 从所选角落向内的垂直偏移 |

- 持久化：`localStorage` 的 `spine-viewer:album-art:v1`。
- 非引擎环境或播放器不提供媒体信息时，卡片显示对应的提示文案，而不是空白。
- 卡片内的小频谱颜色跟随 `spectrum.color`。
- 数据来源：[src/utils/wallpaperMedia.js](../src/utils/wallpaperMedia.js) 读取 `index.html` 内联脚本写入的 `window.__weMedia`；`AlbumArt.jsx` 每秒轮询一次。
- 需要用户在 WE 设置中开启**媒体集成**，否则不会有任何数据。

## 音频数据来源（频谱 / 时钟律动 / 封面小频谱共用一个来源）

三处可视化都用同一套读取逻辑，**判定依据是引擎 API 是否存在**，而不是"有没有收到帧"：

- **Wallpaper Engine 中**（`window.wallpaperRegisterAudioListener` 存在）：只使用真实音频。没收到帧或数据过期时**静音**，绝不回退到模拟数据。
- **浏览器中**（API 不存在）：无法读取系统音频，使用 `syntheticSpectrum()` / `syntheticAudioLevel()` 生成的确定性模拟数据。

其它要点：

- 监听器在 [index.html](../index.html) 的 `<head>` 中由内联经典脚本注册（早于 Vite 的延迟模块脚本），把 128 长度数组和到达时间戳写到 `window.__weAudioFrame` / `window.__weAudioAt`。[src/utils/wallpaperAudio.js](../src/utils/wallpaperAudio.js) 只读这两个全局值，无副作用。**不要**改到模块顶层或 `useEffect` / `window.onload` 里注册。
- 帧超过 **1.5 秒**没有更新视为过期（`getWallpaperAudioFrame(staleMs)`），柱状图回到静止，而不是冻结在最后一次响亮的画面上。
- 静音阈值 `NOISE_FLOOR = 0.06`：低于该值的采样视为静音并归零，避免引擎残留底噪让 128 根柱子持续微颤。高于阈值的值会重新缩放，不产生可见跳变。
- 调试面板的「音频数据」一行只显示三态：`非 WE 环境` / `已注册，等待音频数据` / `接收中`。
- 数值处理在 [src/utils/audio.js](../src/utils/audio.js)：`extractSpectrumBars()` 把同一帧拆成 128 根柱子的高度（右声道镜像）并做去噪；`syntheticSpectrum()` 生成浏览器预览用的模拟频谱。全部夹取到 `0–1`（WE 偶尔会超过 1）；`smoothAudioLevel()` 做帧率无关的非对称缓动（attack 60/s、release 6/s）。
- 律动与倾斜共用同一个 rAF 循环，只写 CSS 变量和 transform，不额外触发重排。
- `public/project.json` 的音频开关必须写在 **`general` 对象内部**，不是顶层：

  ```json
  { "general": { "supportsaudioprocessing": true } }
  ```

  Wallpaper Engine 的原生结构还包含 `general.properties.schemecolor`，`type` 是 `"Web"`（大写）。写在顶层（`"supportsaudioprocessing": true` 平级于 `file`）会被引擎忽略——表现为注册成功但回调恒为 0 次。
- 若音频仍不工作，先在 WE 设置 → General → Media 中确认 **audio recording device** 选对，并确认 WE 在 Windows 音量合成器中没有被静音——引擎在录不到声音时不会推送任何音频帧。

## 音频响应 `reactToBeat`

- 打开后时钟随音频**低频（bass）**律动：最大放大 12%，并叠加一层随强度增长的光晕。
- `beatIntensity` 同时缩放这两项：`0%` 时内部仍跟随音频但看不出变化，`500%` 为最大响应。
- 数据来源与频谱相同，见上节。

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

## 推荐视图 `recommendedView`

模型 manifest 里可以带：

```json
"recommendedView": {
  "scale": 2.4,
  "positionX": -30,
  "positionY": -27,
  "backgroundColor": "#06070d"
}
```

- `scale` / `positionX` / `positionY`：推荐取景
- `backgroundColor`：可选；没有时使用黑色 `#000000`
- 数据来源：仓库根目录的 `model-presets.json`
- `scripts/prepare-models.mjs` 会把它合并进当前包的 manifest
- 在“画面变换”区域点击“记录当前视图”，才会把该模型写入 `localStorage`；点击“复制全部视图”只复制已记录模型，可直接粘贴到 `model-presets.json`

## 默认值汇总

```js
// 有推荐
{ ...model.recommendedView }

// 没有推荐
{
  scale: 1,
  positionX: 0,
  positionY: 0,
  backgroundColor: '#000000',
}
```

抽屉里的视图按钮：

| 按钮 | 效果 |
| --- | --- |
| 初始 100 / 0 / 0 | `scale = 1`、`positionX = 0`、`positionY = 0` |
| 推荐 … | 应用当前模型的 `recommendedView`，包含背景色 |
| 记录当前视图 | 把当前模型 + 当前缩放/位置/背景色写入 localStorage |
| 复制全部视图 | 只复制所有已记录模型的 JSON |

“初始”只改缩放和位置；“推荐”会同时应用推荐背景色。

## 持久化

当前行为：

- **不持久化**：`scale`、`positionX`、`positionY`、`backgroundColor`、`clickToAction`、`selectedModelId` 只存在于 React state。
- 刷新页面后会重新选中清单第一个模型；未记录的字段恢复默认值，已记录模型视图会从 `localStorage` 恢复。
- **持久化**的 key 一览：

| key | 内容 | 写入时机 |
| --- | --- | --- |
| `spine-viewer:model-views:v1` | 按模型记录的自定义视图 | 点击“记录当前视图”时 |
| `spine-viewer:language:v1` | 界面语言 | 语言变化时 |
| `spine-viewer:clock:v1` | `clock` 的七个字段 | `clock` 变化时 |
| `spine-viewer:spectrum:v1` | `spectrum` 的五个字段 | `spectrum` 变化时 |
| `spine-viewer:album-art:v1` | `albumArt` 的五个字段 | `albumArt` 变化时 |
| `spine-viewer:drawer-tab:v1` | 抽屉上次打开的标签 | 切换标签时 |

- 没有 `spine-viewer:playback:v1` 或其他全局播放设置存储 key，也没有统一的 `sanitizeSettings`；每个模块各自做校验（`normalizeClock`、`clampNumber`、`normalizeHexColor`）。
- 所有 `localStorage` 读写都包在 `try/catch` 中，失败时静默忽略（语言 / 抽屉标签 / 各浮层偏好），或回退默认值（时钟 / 频谱 / 专辑封面）。

如果后续要加持久化，建议：

1. 新增一个明确的 key，例如 `spine-viewer:playback:v1`。
2. 读取时只接受类型正确、范围合法的字段，其他字段回退默认值。
3. 写入时处理 `localStorage` 不可用或配额异常。
4. 如果字段语义发生不兼容变化，提升 key 版本或显式迁移；已有先例：抽屉的 `display` 标签读取时映射为 `clock`。
5. 同步更新本文档和[使用指南](user-guide.md)。

## URL 状态

当前版本没有 URL 状态：

- 没有 `?mode=show`。
- 没有编辑/展示模式。
- 设置不写入 URL。
- 刷新后不保留播放设置（但时钟 / 频谱 / 专辑封面 / 语言 / 抽屉标签等显示偏好会恢复）。

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

```text
clock / spectrum / albumArt
  → SettingsDrawer 的 onClockChange / onSpectrumChange / onAlbumArtChange(patch)
  → App 的 update* 函数（夹取范围、校验颜色）
  → 对应浮层组件重新渲染
  → useEffect 写入各自的 localStorage key
```

## 新增设置检查清单

1. 在 `App.jsx` 的 `viewSettings` 初始值中加入字段；如果是独立的显示偏好，按 `clock` / `spectrum` / `albumArt` 的模式新增一个 state + `load*` / `save*` + 夹取函数。
2. 在 `SettingsDrawer.jsx` 中加入控件，并通过 `onChange({ field: value })` 回传；控件放到对应的标签（`clock` / `spectrum` / `model` / `other`）里。注意 `clock` 和 `spectrum` 只在 Wallpaper Engine 中渲染（`availableTabs()` 与 `inWallpaperEngine &&` 双重判断），放在这两个标签里的控件浏览器中看不到。
3. 如果需要 i18n 文案，在 `src/i18n.js` 的四套语言表里同时加 key。
4. 如果是 Stage 相关设置：
   - 在 `App.jsx` 中加同步 `useEffect`，或
   - 扩展 `spineStage.js` 返回的 API。
5. 做范围/类型校验；当前没有统一的 `sanitizeSettings`，需要手动保证。
6. 如果要做持久化，按上面的持久化建议实现，不要只写不读。
7. 更新本文件、[使用指南](user-guide.md) 和必要的架构说明。
8. 运行 `npm run build` 验证；需要部署到 WE 时直接运行 `npm run build:we`（它会重新构建并复制），然后在 Wallpaper Engine 中手动验证。
