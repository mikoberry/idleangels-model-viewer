# Wallpaper Engine 能力参考

本文档记录 Wallpaper Engine（WE）网页壁纸提供的**全部接口与能力**，以及本项目当前的使用情况。全部内容来自 WE 官方文档，并标注了与本项目相关的注意事项。

当前状态：**已实现音频、媒体信息与暂停三部分；其余能力仅记录**。每个能力在下方表格和对应章节中单独标注。

## 目录

- [能力总览](#能力总览)
- [1. 用户属性 User Properties](#1-用户属性-user-properties)
- [2. 属性显示条件 Display Conditions](#2-属性显示条件-display-conditions)
- [3. 属性多语言翻译](#3-属性多语言翻译)
- [4. 媒体集成 Media Integration](#4-媒体集成-media-integration)
- [5. RGB 硬件](#5-rgb-硬件)
- [6. 运行时 API](#6-运行时-api)
- [7. 本项目优先级建议](#7-本项目优先级建议)
- [常见陷阱](#常见陷阱)

## 能力总览

| 能力 | 入口 | 本项目状态 |
| --- | --- | --- |
| 音频频谱 | `wallpaperRegisterAudioListener` | ✅ 已用于频谱、时钟律动与封面小频谱 |
| 暂停/恢复 | `wallpaperPropertyListener.setPaused` | ✅ 已用于暂停渲染循环与刷新时钟 |
| 帧率上限 | `applyGeneralProperties({fps})` | ❌ 未使用 |
| 用户属性 | `applyUserProperties` | ❌ 未使用 |
| 属性显示条件 | `project.json` 中的条件表达式 | ❌ 未使用 |
| 属性翻译 | `project.json` 的 `general.localization` | ❌ 未使用 |
| 媒体信息 | `wallpaperRegisterMedia*Listener` | ✅ 已用于专辑封面卡片 |
| RGB 硬件 | `window.wpPlugins.led` | ❌ 未使用 |
| iCUE 扩展 | `window.cue.*` | ❌ 未使用 |
| 插件加载通知 | `wallpaperPluginListener.onPluginLoaded` | ❌ 未使用 |

## 1. 用户属性 User Properties

用户属性显示在 WE「已安装」面板右侧，用户**不需要打开壁纸内的 UI** 就能调整。这是与页面内部控件（本项目当前的设置抽屉）互补的另一套配置入口。

### 创建方式

在 WE 编辑器中：`Edit → Change Project settings → Add Property`。属性会写入 `project.json` 的 `general.properties`。

属性 key 只能包含英文字符和数字。**如果标题是中文或含特殊字符，务必手动设置一个可读的 key。**

### 七种属性类型

| 类型 | key | 返回值 | 本项目适用场景 |
| --- | --- | --- | --- |
| 颜色 | `color` | `"1.0 0.1 0.25"`（空格分隔浮点） | 背景色 |
| 滑杆 | `slider` | 数字；可开 Fraction 与 Precision | 时钟大小、频谱高度、缩放 |
| 复选框 | `bool` | `true` / `false` | 显示时钟、显示频谱、点击触发 |
| 下拉框 | `combo` | `.value` 与 `.text` | 时钟版式、频谱位置、语言 |
| 文本框 | `textinput` | 字符串 | 时钟格式模板 |
| 文件 | `file` | 路径，需拼 `file:///` | 不适用 |
| 目录 | `directory` | 目录路径，`ondemand` 或 `fetchall` 模式 | 不适用 |

### 读取方式

```js
window.wallpaperPropertyListener = {
  applyUserProperties(properties) {
    if (properties.showclock) {
      // properties.showclock.value
    }
  },
}
```

要点：

- **必须在事件外部全局初始化** `window.wallpaperPropertyListener`，否则会漏掉加载时的属性事件。
- 事件**只包含值发生变化的属性**，每个属性都要单独 `if` 判断。
- 壁纸加载时会**完整触发一次**，所以该回调也是初始值的来源。

### 颜色值转换

颜色属性返回 `"1.0 0.1 0.25"`，转成 CSS 需要：

```js
const customColor = properties.customcolor.value.split(' ').map((c) => Math.ceil(c * 255))
const css = `rgb(${customColor})`
```

### 与本项目的关系

本项目当前的设置（`viewSettings` 与 `clock` / `spectrum` state）都只存在于页面内抽屉中。若接入用户属性，需要在 `applyUserProperties` 回调里把值写入对应的 React state，形成双向同步。

**注意**：WE 中的滑杆拖动可能失效（这与本项目 `drawer.transformHint` 提示的现象一致）。用户属性使用 WE 原生控件，不受该问题影响，这是它相对页面内控件的实际优势。

## 2. 属性显示条件 Display Conditions

给属性配置一个 JavaScript 兼容的 `if` 条件表达式，只有条件成立时该属性才对用户可见。用于在属性较多时避免面板混乱。

典型场景（正是本项目的场景）：

```js
showclock.value == true
```

这样「12/24 小时制」这类选项只在时钟启用时才显示。

本项目的对应场景：

- 未勾选「显示时钟」时隐藏时钟大小、位置选项
- 未勾选「显示频谱」时隐藏频谱高度、位置选项

## 3. 属性多语言翻译

在 `project.json` 的 `general` 下新增 `localization` 对象，键是语言简写（如 `en-us`、`de-de`、`zh-chs`），值为「token → 译文」。

```json
{
  "general": {
    "properties": {
      "showclock": {
        "text": "ui_showclock",
        "type": "bool",
        "value": true,
        "order": 100
      }
    },
    "localization": {
      "en-us": { "ui_showclock": "Show clock" },
      "zh-chs": { "ui_showclock": "显示时钟" }
    }
  }
}
```

关键规则：

- 属性标签与选项标签**必须以 `ui_` 开头**，否则 WE 不识别为可翻译 token。
- WE 按用户在 **General 设置中选择的语言**加载翻译，与本项目页面内的四语言切换（`spine-viewer:language:v1`）**是两套独立机制**。
- 修改后需要在「已安装」里重新应用壁纸，有时需重启 WE 界面。

## 4. 媒体集成 Media Integration

读取系统正在播放的媒体信息。需要用户在 WE 设置中开启媒体集成；支持任何向 Windows 全局媒体会话提供信息的应用（Spotify、Tidal 等）。

### 监听器一览

| 监听器 | 提供的数据 |
| --- | --- |
| `wallpaperRegisterMediaStatusListener` | `enabled`：用户是否开启了媒体集成 |
| `wallpaperRegisterMediaPropertiesListener` | `title`、`artist`、`subTitle`、`albumTitle`、`albumArtist`、`genres`、`contentType` |
| `wallpaperRegisterMediaThumbnailListener` | `thumbnail`（Base64 PNG 封面）、`primaryColor`、`secondaryColor`、`tertiaryColor`、`textColor`、`highContrastColor` |
| `wallpaperRegisterMediaPlaybackListener` | `state`：`PLAYBACK_PLAYING` / `PLAYBACK_PAUSED` / `PLAYBACK_STOPPED` |
| `wallpaperRegisterMediaTimelineListener` | `position`、`duration`（秒）；**并非所有播放器支持** |

### 注册方式

```js
function wallpaperMediaThumbnailListener(event) {
  // event.thumbnail 可直接赋给 img.src
  // event.primaryColor / textColor 是现成的配色
}
window.wallpaperRegisterMediaThumbnailListener(wallpaperMediaThumbnailListener)
```

与音频监听器一样，**应在 `body` 末尾或同等早期时机注册，不要放在 `window.onload`**。

### 本项目实现

- 四个监听器（status / thumbnail / properties / playback）都在 [index.html](../index.html) 的内联脚本中注册，写入统一的全局对象 `window.__weMedia`。
- [src/utils/wallpaperMedia.js](../src/utils/wallpaperMedia.js) 只读该对象；`src/components/AlbumArt.jsx` 每秒轮询一次。
- 播放状态常量取自 `window.wallpaperMediaIntegration`，对象缺失时保持“未知”，不能猜成 `stopped`。
- 目前只用了 `thumbnail`、`title`、`artist`、`albumTitle`、`playback`，**没有**用 `primaryColor` / `textColor` 驱动背景色（见下方优先级建议）。
- `timeline` 监听器未使用。

### 本项目可用的方向

`primaryColor` / `textColor` 是现成的取色结果，可以直接驱动页面背景色，让壁纸跟随当前歌曲的封面色调变化，不需要自己实现取色算法。

注意：不是所有播放器都提供 timeline，代码必须在从未收到该事件时也能正常工作。

## 5. RGB 硬件

通过 WE 的 LED 插件同步控制支持的 RGB 设备（键盘、鼠标、内存条等）。

### 初始化与检测

```js
window.wallpaperPluginListener = {
  onPluginLoaded(name, version) {
    if (name === 'led') {
      // 通用 LED 插件已加载
    }
    if (name === 'cue') {
      // Corsair iCUE 专用插件已加载
    }
  },
}
```

**在任何 RGB 调用前必须先确认插件已加载**，否则相关逻辑应跳过。

### 发送颜色数据

```js
window.wpPlugins.led.setAllDevicesByImageData(encodedImageData, width, height)
```

第一个参数是**拼接的 RGB 字符串**（每像素 3 字节，无 alpha）。官方推荐先画到 canvas 再编码：

```js
function getEncodedCanvasImageData(canvas) {
  const context = canvas.getContext('2d')
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const colorArray = []
  for (let d = 0; d < imageData.data.length; d += 4) {
    const write = (d / 4) * 3
    colorArray[write] = imageData.data[d]
    colorArray[write + 1] = imageData.data[d + 1]
    colorArray[write + 2] = imageData.data[d + 2]
  }
  return String.fromCharCode.apply(null, colorArray)
}
```

**性能要点**：

- 参考画布建议 **100×20 像素**，大幅降低编码开销。
- 应先把任意画布降采样到小画布再编码。
- 无音频时建议保留某种待机动画，否则部分硬件会熄灭。

### Corsair iCUE 扩展（`window.cue`）

仅限 iCUE 兼容硬件，多数场景不需要。可用函数：

| 函数 | 作用 |
| --- | --- |
| `getProtocolDetails(cb)` | iCUE SDK 版本与状态 |
| `getDeviceCount(cb)` | 已识别设备数量 |
| `getDeviceInfo(index, cb)` | 单个设备的型号、LED 数量、布局 |
| `getLedPositionsByDeviceIndex(...)` | LED 位置（毫米坐标） |
| `setLedsColorsAsync(array)` | 按 LED 分别设色 |
| `setAllLedsColorsAsync(deviceIndexOrArray, color)` | 设备所有 LED 设为同一颜色 |
| `setLedColorsByImageData(deviceIndexOrArray, data, w, h)` | 按位图设色，需指定设备 |

### 测试

可使用 Razer Chroma 模拟器（需 Razer Synapse 3 + Chroma Connect + Razer 模拟器）或 iCUE 模拟设备，无需真实硬件。

## 6. 运行时 API

| API | 说明 | 本项目状态 |
| --- | --- | --- |
| `wallpaperRegisterAudioListener(cb)` | 约 30 次/秒推送 128 长度数组 | ✅ 已用 |
| `applyGeneralProperties({ fps })` | 用户设置的 FPS 上限 | ❌ 未用 |
| `setPaused(isPaused)` | 壁纸暂停/恢复；WE 本身会冻结渲染进程，此回调用于需要额外处理的场景 | ✅ 已用（经由 `wallpaperPause.js`） |
| `wallpaperPluginListener.onPluginLoaded` | 插件加载通知（RGB） | ❌ 未用 |
| `wallpaperPropertyListener` | 用户属性与通用属性回调 | ⚠️ 仅用 `setPaused`，未用 `applyUserProperties` / `applyGeneralProperties` |
| `wallpaperRegisterMedia*Listener` | 媒体信息（封面、曲名、播放状态） | ✅ 已用 |
| CEF devtools port | WE 设置 → General 中填写端口，浏览器访问调试 | 调试用 |

`applyGeneralProperties` 的典型用法：

```js
const settings = { fps: 0 }
window.wallpaperPropertyListener = {
  applyGeneralProperties(properties) {
    if (properties.fps) settings.fps = properties.fps
  },
}
```

然后在渲染循环里按 `1 / fps` 做帧间隔节流。官方推荐这种节流方式优于给壁纸单独设帧率上限。

## 7. 本项目优先级建议

按投入产出比排序，供后续开发参考：

### 优先级 1：用户属性 + 显示条件 + 属性翻译

**收益**：用户直接在 WE 面板调整，无需打开页面抽屉；使用原生控件，避开 WE 滑杆拖拽失效的问题。

**代价**：需要在 `applyUserProperties` 与现有 React state（`viewSettings`、`clock`、`spectrum`）之间做双向同步。

**注意**：这与本项目「设置只存在于 React state」的现有约定有冲突，接入前需要先明确哪些项应该迁到用户属性、哪些保留在页面内。

### 优先级 2：媒体集成取色

**收益**：背景色随专辑封面自动变化。`primaryColor` / `textColor` 是现成值。

**代价**：小。媒体监听器、桥接模块和封面卡片已经就绪，只需把配色接到背景色；仍需处理用户未开启媒体集成、播放器不提供信息等降级路径（`getWallpaperMedia()` 已返回 `null`）。

### 优先级 3：FPS 限制

**收益**：降低桌面壁纸的持续耗电。当前 rAF 无限制运行（暂停时已跳过整帧，但播放时仍按显示器刷新率跑）。

**代价**：很小，在 `src/spineStage.js` 的渲染循环里加帧间隔判断。

### 优先级 4：RGB 硬件

**收益**：与频谱数据联动，视觉统一。

**代价**：需要硬件或模拟器验证；需要处理插件未加载的情况。

## 常见陷阱

### `supportsaudioprocessing` 的位置

该字段必须位于 `project.json` 的 **`general` 对象内部**：

```json
{ "general": { "supportsaudioprocessing": true } }
```

**写在顶层会被静默忽略**，症状是音频监听器注册成功但回调永远不触发（回调次数为 0）。同时 `type` 字段是**大写的 `"Web"`**。

这是本项目实际踩过的坑，详见 [AGENTS.md](../AGENTS.md)。

### 监听器注册时机

音频、媒体相关监听器**不能**放在 `window.onload` 或类似事件中，官方明确说明这不可靠。推荐放在 `body` 末尾，或使用本项目采用的方式：在 `index.html` 的 `<head>` 中用内联经典脚本注册，早于 Vite 的延迟模块脚本。

### 音频无声时的排查

若音频可视化不动，先检查 WE 设置 → General → Media 的 **audio recording device** 是否正确，以及 WE 在 Windows 音量合成器中是否被静音（Windows 不区分播放与录制音量）。

### 属性值只包含变化项

`applyUserProperties` 只推送**值发生变化的属性**。不要假设每次回调都包含全部属性；初始值依赖加载时的那一次完整触发。

### 媒体集成需用户开启

媒体集成功能默认可能未开启，必须处理 `wallpaperRegisterMediaStatusListener` 报告 `enabled: false` 的情况。

## 参考文档

- [Web Wallpaper Reference Guide](https://docs.wallpaperengine.io/en/web/overview.html)
- [User Properties](https://docs.wallpaperengine.io/en/web/customization/properties.html)
- [Display Conditions](https://docs.wallpaperengine.io/en/web/customization/displaycondition.html)
- [Property Translation](https://docs.wallpaperengine.io/en/web/customization/localization.html)
- [Audio Visualization](https://docs.wallpaperengine.io/en/web/audio/visualizer.html)
- [Media Integration](https://docs.wallpaperengine.io/en/web/audio/media.html)
- [FPS Limiter](https://docs.wallpaperengine.io/en/web/performance/fps.html)
- [RGB Hardware Support](https://docs.wallpaperengine.io/en/web/api/rgb.html)
- [Corsair iCUE Functions](https://docs.wallpaperengine.io/en/web/api/icue.html)
- [Web Wallpaper Debugging](https://docs.wallpaperengine.io/en/web/debug/debug.html)
- [创建网页壁纸](https://docs.wallpaperengine.io/en/web/first/gettingstarted.html)
