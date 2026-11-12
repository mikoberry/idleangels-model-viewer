[English](README.md) | **简体中文**

# IdleAngels 模型查看器

> 在线体验：<https://mikoberry.github.io/idleangels-model-viewer/>

> **AI 开发与免责声明**
>
> 本项目的代码、文档、界面文案及多语言翻译主要由 AI 辅助完成。AI 生成内容可能存在错误、遗漏或表达不准确的情况，相关内容不代表任何官方立场，也不构成专业建议。
>
> 本项目与 IdleAngels 游戏及其开发方、发行方无隶属或合作关系。项目内使用的角色模型、图片、Spine 资源等版权归原权利方所有，仅用于学习、研究和个人展示，不提供商业授权。如有侵权，请联系删除。
>
> 欢迎通过 Issue 指出错误或提交改进，翻译问题也欢迎指正。

基于 **Vite + React 18（JSX）** 的 Spine 3.8 全屏 WebGL 查看器，支持在多个模型之间切换。当前模型库已导入 **128 个** 同时具备 `angel`、`bg` 和 `action` 动画的模型；GitHub Pages 线上版使用其中 **51 个** 代表模型。

画布常驻全屏，右侧设置抽屉在浏览器和 Wallpaper Engine 中都默认打开。抽屉左侧是竖向标签菜单，分为**时间**、**频谱**、**模型**、**其它**四个标签；模型选择器**仅浏览器中显示**（Wallpaper Engine 中隐藏）；每次刷新默认选择清单中的第一个模型。当前版本没有编辑/展示模式，也没有 URL 模式；抽屉关闭时，点击画面可以触发一次 `action`。

## 在线版本

线上地址：

```text
https://mikoberry.github.io/idleangels-model-viewer/
```

线上版由 GitHub Pages 部署，构建时读取 [deploy-models.json](deploy-models.json)，只发布 51 个代表模型，约 294 MB。

可以：

- 按目录名、拼音首字母或模型文件名搜索并切换模型
- 调整缩放、位置和页面背景色
- 点击画面触发 `action`
- 点击“记录当前视图”把当前模型视图保存到当前浏览器
- 点击“复制全部视图”导出所有已记录模型，用于填写 `model-presets.json`
- 打开时间与日期时钟（可选随音频律动）、128 根柱子的音频频谱，以及正在播放的专辑封面卡片

未手动记录的画面调整在刷新后不会保留；已记录的模型视图会从浏览器 `localStorage` 恢复。时钟、频谱、专辑封面、界面语言和抽屉标签属于显示偏好，会自动保存。线上版和 Wallpaper Engine 版共用同一套代码，但 WE 使用完整本地模型库。

## 功能

- Spine 3.8.99 二进制骨架加载与 WebGL 渲染
- 多模型选择：按目录名、拼音首字母、全拼或模型文件名搜索，切换时重载 Stage
- `idle` / `action` 动画切换；`action` 播放一次后自动回到 `idle`
- 点击画面触发 `action`（抽屉关闭且开关开启时）
- 画面缩放（50%–500%，支持滑杆、输入框和 ±1% 步进）
- 水平/垂直位置偏移（-100%–100%）
- 页面背景色（预设色、取色器、`#RRGGBB` 输入）
- 每模型视图手动记录、全部复制为预设 JSON
- 时钟浮层：竖排/横排两种版式、跟随鼠标 3D 摆动、随音频低频律动（响应强度可调）
- 128 根柱子的音频频谱：可贴顶边或底边，高度、水平位置、颜色可调
- 专辑封面卡片：封面、曲名、艺术家、专辑名，内嵌小频谱，来自 Wallpaper Engine 媒体集成
- 界面支持中文、英文、日文、韩文；默认跟随浏览器语言，可在抽屉中切换
- 设置抽屉“其它”标签里的“显示调试信息”开关；勾选后左上角显示调试窗口
- 全屏响应式布局；移动端设置抽屉占满宽度，标签菜单改为顶部横排
- 单模型包 / 全模型包两种打包方式

当前版本**不包含**：全局播放设置自动持久化（缩放/位置/背景色/点击开关）、模型选择持久化、编辑/展示模式、`?mode=show`、播放速度、暂停、循环 Action、自动播放、动画包围盒显示、帧率上限、WE 用户属性、全屏加载/错误遮罩。未手动记录的设置只在当前页面会话有效；刷新后会恢复第一个模型及其已记录视图（如果有）。

## 快速开始

要求：Node.js 18+。当前在 Node.js 20.18.1、npm 10.8.2 下验证。

```bash
npm install
npm run dev
```

默认打开：

```text
http://localhost:5173/
```

如果 5173 被占用，Vite 会自动选择下一个可用端口，以终端输出为准。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，默认 `5173`；不会同步资源 |
| `npm run dev:all` | 准备全部 128 个模型后启动开发服务器；已经准备好时会跳过复制 |
| `npm run build` | 只执行 `vite build`，输出到 `dist/`，不复制到 WE 目录 |
| `npm run build:we` | 先执行 `npm run build`，再复制 `dist/` 到 WE 目标目录 |
| `npm run models:import` | 扫描源模型目录，把合格模型导入 `model-library/` |
| `npm run models:use -- <id>[,<id>...]` | 把一个或多个模型准备到 `public/spine/models/`，供 dev 使用 |
| `npm run package:model -- <id>` | 单模型：准备资源 + 构建 + 复制到 WE |
| `npm run package:all` | 全模型：准备全部合格模型 + 构建 + 复制到 WE |
| `npm run preview` | 预览 `dist/`，默认端口 `4173`；端口受限时用 `--port` 指定 |

### 构建与部署

只构建：

```bash
npm run build
```

构建并部署到 WE 前，把本机路径写入仓库根目录的 `local.config.json`：

```json
{
  "modelSourceDir": "<模型源目录>",
  "weTargetDir": "<WE 项目目录>"
}
```

`local.config.json` 已被 `.gitignore` 忽略，不会提交。也可以复制 [local.config.example.json](local.config.example.json) 后修改。

然后执行：

```powershell
npm run build:we
```

也可以临时用环境变量覆盖配置：

```powershell
$env:WE_TARGET_DIR = '<你的 WE 项目目录>'
npm run build:we
```

`build:we` 的顺序：

1. `vite build` 把产物写入仓库内的 `dist/`。
2. `node scripts/copy-to-we.mjs` 把 `dist/` 的内容复制到 `weTargetDir` 或 `WE_TARGET_DIR` 指定的目录。

复制脚本会先在 staging 目录准备新产物，然后删除旧目标目录并整体替换，保证不残留上一版文件。目标目录是生成目录，不要在里面放手工文件。

如果只想重试复制（例如刚才 WE 占用了文件，但 `dist/` 已经构建好），执行：

```bash
node scripts/copy-to-we.mjs
```

- `dist/` 已在 `.gitignore` 中忽略。
- 如果 Wallpaper Engine 正在占用目标文件，复制可能失败；先关闭/停止该壁纸再执行 `build:we` 或重试复制。
- `npm run preview` 只读取 `dist/`，不会触发复制。

## 模型库与打包

源目录共有 377 个目录、约 1.27 GB。当前按“**有 `action` + 有 `angel` + 有 `bg` + 单套资源**”筛选，导入了 **128 个模型**。NPC、只有 `angel` 的模型、缺 PNG 的模型和特殊结构目录暂不处理。

```text
model-library/                 # 源模型库，跟踪提交
model-presets.json             # 每个模型的推荐缩放/位置/背景，跟踪提交
local.config.example.json      # 本机路径配置模板，跟踪提交
local.config.json              # 实际本机路径，git 忽略
public/spine/models/           # 按包生成的模型，git 忽略
  manifest.json
deploy-models.json             # GitHub Pages / Vercel 部署子集
vercel.json                    # Vercel 构建配置
.github/workflows/             # GitHub Pages Actions
```

流程：

```bash
# 首次或源模型更新后，重新扫描并导入合格模型
# 源目录读取 local.config.json 的 modelSourceDir；也可用 MODEL_SOURCE_DIR 覆盖
npm run models:import

# 开发时准备一个或多个模型
npm run models:use -- spine_hhbsd_bdmy,spine_abl0

# 准备全部模型并启动 dev（已准备好时会跳过复制）
npm run dev:all

# 只准备部署子集（当前 deploy-models.json 中 51 个模型）
node scripts/prepare-models.mjs --file deploy-models.json

# 打包单个模型到 WE
npm run package:model -- spine_hhbsd_bdmy

# 打包全部 128 个模型到 WE
npm run package:all
```

说明：

- `model-library/models.json` 是源库清单；`public/spine/models/manifest.json` 是当前包的实际清单。
- `model-presets.json` 存每个模型的推荐缩放、位置和可选背景色；没有配置时回退到 `100 / 0 / 0` 和黑色背景。
- 准备模型时会按 PNG 实际尺寸重写 atlas 元数据，避免贴图错位。
- 调整好画面后点击“记录当前视图”，该模型视图会写入 `localStorage`；画面变换区域的“复制全部视图”只复制已记录模型，可直接粘贴到 `model-presets.json`。
- 每次刷新或切换模型时，有推荐就用推荐，没有就回到初始视图；模型选择不持久化。
- 全模型包约 731 MB，`dist` 和 WE 目标目录都会很大；构建/复制前确认磁盘空间，并先停止使用目标目录的壁纸。
- [deploy-models.json](deploy-models.json) 是部署子集；当前按“每个角色名挑一个、优先 bdmy > np > cshs > mr”选了 51 个模型，约 294 MB。
- [vercel.json](vercel.json) 在 Vercel 构建时用该子集准备模型，再执行 `vite build`。全量 128 个模型约 730 MB，不适合直接作为 Vercel 构建内容。

### GitHub Pages

[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) 会在推送 `main` 或手动触发时：

1. `npm ci`
2. `node scripts/prepare-models.mjs --file deploy-models.json`
3. `npm run build`
4. 上传 `dist` 并部署到 GitHub Pages

使用前在仓库：

```text
Settings → Pages → Build and deployment → Source
```

选择 **GitHub Actions**。

站点地址：

```text
https://mikoberry.github.io/idleangels-model-viewer/
```

GitHub Pages 限制：发布站点不超过 1 GB，软带宽 100 GB/月，部署超过 10 分钟会超时。当前部署子集约 294 MB，低于 1 GB。

线上版包含 Cloudflare Web Analytics，仅统计页面加载的聚合访问量，不写 Cookie；模型切换不会被当作新的页面浏览。

## 设置项

画面设置保存在 `src/App.jsx` 的 `viewSettings` React state 中；全局播放设置不会自动持久化，点击“记录当前视图”后会按模型写入 `localStorage`。时钟、频谱、专辑封面是各自独立的 state，会自动持久化。

| 设置 | 默认值 | 范围 / 说明 |
| --- | --- | --- |
| `scale` | 当前模型推荐，缺省 `1`（100%） | `0.5`–`5`，即 50%–500% |
| `positionX` | 当前模型推荐，缺省 `0` | `-100`–`100`，单位是视口宽度的百分比 |
| `positionY` | 当前模型推荐，缺省 `0` | `-100`–`100`，单位是视口高度的百分比 |
| `backgroundColor` | 当前模型推荐，缺省 `#000000` | `#RRGGBB`，只影响页面 CSS 背景 |
| `clickToAction` | `true` | 抽屉关闭时点击 canvas 是否触发 `action` |

另外：

- 当前模型由 `manifest.json` 的第一项初始化；切换模型会应用该模型的推荐视图，刷新后回到第一个。
- 当前动画是独立 state，初始为 `idle`；可选值来自 Stage 返回的 `animations`。
- 以下 key 会自动持久化，刷新后恢复：

  | key | 内容 |
  | --- | --- |
  | `spine-viewer:model-views:v1` | 按模型记录的自定义视图 |
  | `spine-viewer:clock:v1` | 时钟显示偏好 |
  | `spine-viewer:spectrum:v1` | 频谱显示偏好 |
  | `spine-viewer:album-art:v1` | 专辑封面显示偏好 |
  | `spine-viewer:language:v1` | 界面语言 |
  | `spine-viewer:drawer-tab:v1` | 抽屉上次打开的标签 |

- 页面没有 URL 状态，刷新后播放设置恢复默认值并选择第一个模型。

字段细节见[设置字段参考](docs/settings-reference.md)。

## 项目结构

```text
.
├─ index.html                # <head> 内联 WE 桥接脚本（音频 / 媒体 / 暂停）
├─ vite.config.js
├─ package.json
├─ heroes_multilang.csv      # 角色名多语言对照（抽屉里的链接指向它）
├─ model-library/            # 源模型库，跟踪提交
│  ├─ models.json
│  ├─ import-report.json
│  └─ spine_*/
├─ public/
│  ├─ project.json
│  └─ spine/models/          # 按包生成，git 忽略
│     ├─ manifest.json
│     └─ spine_*/
├─ scripts/
│  ├─ import-models.mjs      # 扫描源库并导入合格模型
│  ├─ prepare-models.mjs     # 重写 atlas 并生成当前包
│  ├─ package-models.mjs     # 单模型/全模型打包
│  ├─ copy-to-we.mjs         # 复制 dist 到 WE
│  ├─ dev-all.mjs            # 准备全部模型后启动 Vite
│  ├─ local-config.mjs       # 读取 local.config.json / 环境变量
│  └─ model-utils.mjs
├─ src/
│  ├─ main.jsx               # React 入口
│  ├─ App.jsx                # 状态、canvas、Stage 启动、模型清单
│  ├─ App.css                # 调试面板、眼睛按钮
│  ├─ base.css               # 设计变量、reset、viewer 外壳
│  ├─ components/
│  │  ├─ SettingsDrawer.jsx  # 四标签设置抽屉 + 模型选择
│  │  ├─ SettingsDrawer.css
│  │  ├─ Clock.jsx           # 时间与日期浮层
│  │  ├─ Clock.css
│  │  ├─ Spectrum.jsx        # 贴边音频频谱
│  │  ├─ Spectrum.css
│  │  ├─ MiniSpectrum.jsx    # 封面卡片内嵌的小频谱
│  │  ├─ MiniSpectrum.css
│  │  ├─ AlbumArt.jsx        # 专辑封面卡片
│  │  └─ AlbumArt.css
│  ├─ utils/                 # 非 React 模块（纯函数 / WE 桥接）
│  │  ├─ audio.js            # 音频帧解析、频谱提取、合成数据
│  │  ├─ clock.js            # 时钟格式化与倾斜计算
│  │  ├─ wallpaperAudio.js   # WE 音频帧读取
│  │  ├─ wallpaperMedia.js   # WE 媒体信息读取
│  │  └─ wallpaperPause.js   # WE 暂停状态
│  ├─ i18n.js                # 中文 / 英文 / 日文 / 韩文文案
│  ├─ spineStage.js          # WebGL / 资源 / 动画 / 相机 / 渲染循环
│  └─ spine-webgl.js         # vendored Spine 3.8.99 运行时
├─ dist/                     # 构建产物，git 忽略
├─ docs/
├─ AGENTS.md
└─ README.md
```

React 组件放在 `src/components/`；非 React 模块（纯函数、WE 桥接）放在 `src/utils/`；`src/` 根目录保留入口、应用状态、i18n、Spine 运行时与样式。没有 `hooks/` 目录，也没有 `tsconfig.json`。当前模型格式要求 `angel` + `bg`，每个图层各一套 `.skel` / `.atlas` / `.png`。

## 数据流

```text
index.html（<head> 内联脚本：音频 / 媒体 / 暂停）
  └─ main.jsx
       └─ <App />
            ├─ fetch spine/models/manifest.json
            ├─ 默认选中 manifest.models[0]，用户可在抽屉里搜索/切换
            ├─ <canvas ref>
            │    └─ startSpineStage(canvas, { model, onStatus, onAnimationChange, isCancelled })
            │         ├─ spine.webgl.ManagedWebGLRenderingContext + SceneRenderer
            │         ├─ 按 model.layers 创建 AssetManager（bg + angel，可选）
            │         ├─ SkeletonBinary + AtlasAttachmentLoader → Skeleton / AnimationState
            │         ├─ fitView() → camera
            │         └─ requestAnimationFrame → drawSkeleton × layers
            ├─ viewSettings ── effect ──> stage.setView(scale, x / 100, y / 100)
            ├─ backgroundColor ──> <main style>
            ├─ clickToAction ──> canvas pointerup ──> stage.triggerAction()
            ├─ clock / spectrum / albumArt ──> 浮层组件 + localStorage
            └─ <SettingsDrawer> ── 四标签：模型选择 / onChange / play ──> App / Stage
```

更完整的说明见[架构设计](docs/architecture.md)。

## 关键约束

- `.skel` 是 Spine **3.8.99** 二进制；必须使用 [src/spine-webgl.js](src/spine-webgl.js) 中的 3.8 运行时，不能替换为 Spine 4.x 或 npm 上的运行时。
- `model-library/` 是源库，跟踪提交；`public/spine/models/` 是按包生成物，不进 Git。不要手改生成资源。
- 只处理 `angel` + `bg`、每层一套资源、`angel` 有 `idle` / `action` 的模型；当前 128 个。
- 两个图层都使用 `premultipliedAlpha: true`。
- `action` 在骨架中排在前面，`idle` 必须在启动时显式播放；`action` 非循环，完成后统一回到 `idle`。如果以后加循环 Action，必须补上 Spine 3.8 的 `complete` 保护。
- 播放设置（缩放/位置/背景色/点击开关）和当前模型只存在于 React state，不写入 `localStorage`，也不写入 URL；时钟、频谱、专辑封面、语言、抽屉标签等显示偏好会写入 `localStorage`。
- `npm run build` 只构建到 `dist/`；`npm run build:we` 再通过 `scripts/copy-to-we.mjs` 复制并替换 WE 目标目录。

## 已知限制

- 当前只导入 128 / 377 个模型；只有 `angel`、没有 `action`、NPC、缺 PNG 或特殊结构的模型暂未处理。
- 全模型包约 731 MB，`dist` 和 WE 目标目录都会很大，复制时间较长。
- 模型选择与播放设置不持久化，刷新后总是第一个模型、默认画面。
- 高 DPI 屏幕上 canvas 按 CSS 像素渲染，没有乘 `devicePixelRatio`，画面可能偏软。
- 资源加载没有超时；网络或文件服务卡住时，页面可能一直停在加载状态。
- 加载和错误状态显示在调试窗口和抽屉的状态行里，没有全屏遮罩。
- 没有帧率上限；壁纸暂停时会跳过整帧渲染，但播放时仍按显示器刷新率运行。
- `npm run build` 没有类型检查；逻辑错误不会被构建发现。
- 复制步骤会清空 WE 目标目录；目标被 Wallpaper Engine 占用时可能失败。

## 文档

- [使用指南](docs/user-guide.md)
- [架构设计](docs/architecture.md)
- [Spine 3.8 与资源](docs/spine-runtime-and-assets.md)
- [开发与验证](docs/development.md)
- [设置字段参考](docs/settings-reference.md)
- [Wallpaper Engine 能力参考](docs/wallpaper-engine.md)

## 验证

```bash
npm run build                    # 只构建当前 public 内容
npm run package:model -- <id>     # 单模型构建并部署
npm run package:all              # 全模型构建并部署
```

`npm run build` 必须通过；部署时 `package:model` / `package:all` 的构建和复制都必须成功。之后在 Wallpaper Engine 中手动验证模型选择、两个图层、动画、点击 Action、缩放/位置/背景色、时钟/频谱/专辑封面三个浮层，以及刷新后的默认行为。项目没有自动化测试；不要在未明确要求时引入 Playwright。
