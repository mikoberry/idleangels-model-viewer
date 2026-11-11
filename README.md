# Spine 3.8 WebGL Viewer

基于 **Vite + React 18（JSX）** 的 Spine 3.8 全屏 WebGL 查看器，当前场景为 `spine_hhbsd_bdmy`，包含 `bg` 与 `angel` 两个图层。

画布常驻全屏，右侧设置抽屉按需打开。当前版本没有编辑/展示模式，也没有 URL 模式；抽屉关闭时，点击画面可以触发一次 `action`。

## 功能

- Spine 3.8.99 二进制骨架加载与 WebGL 渲染
- `idle` / `action` 动画切换；`action` 播放一次后自动回到 `idle`
- 点击画面触发 `action`（抽屉关闭且开关开启时）
- 画面缩放（50%–500%，支持滑杆、输入框和 ±1% 步进）
- 水平/垂直位置偏移（-100%–100%）
- 页面背景色（预设色、取色器、`#RRGGBB` 输入）
- 首次打开的眼睛按钮提示
- 左上角 `log` 调试信息面板
- 全屏响应式布局；移动端设置抽屉占满宽度

当前版本**不包含**：播放设置持久化、编辑/展示模式、`?mode=show`、播放速度、暂停、循环 Action、自动播放、动画包围盒显示、全屏加载/错误遮罩。设置只在当前页面会话中有效，刷新后会恢复默认值。

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
| `npm run build` | 只执行 `vite build`，输出到 `dist/`，不复制到 WE 目录 |
| `npm run build:we` | 先执行 `npm run build`，再复制 `dist/` 到 WE 目标目录 |
| `npm run preview` | 预览 `dist/`，默认端口 `4173`；端口受限时用 `--port` 指定 |

### 构建与部署

只构建：

```bash
npm run build
```

构建并部署到 WE：

```bash
npm run build:we
```

`build:we` 的顺序：

1. `vite build` 把产物写入仓库内的 `dist/`。
2. `node scripts/copy-to-we.mjs` 把 `dist/` 的内容复制到：

```text
F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/spine-react-test
```

复制脚本会先在 staging 目录准备新产物，然后删除旧目标目录并整体替换，保证不残留上一版文件。目标目录是生成目录，不要在里面放手工文件。

如果只想重试复制（例如刚才 WE 占用了文件，但 `dist/` 已经构建好），执行：

```bash
node scripts/copy-to-we.mjs
```

- `dist/` 已在 `.gitignore` 中忽略。
- 目标路径可以用环境变量 `WE_TARGET_DIR` 覆盖。例如在 PowerShell 中：

  ```powershell
  $env:WE_TARGET_DIR = 'F:/path/to/another-we-project'
  npm run build:we
  ```

- 如果 Wallpaper Engine 正在占用目标文件，复制可能失败；先关闭/停止该壁纸再执行 `build:we` 或重试复制。
- `npm run preview` 只读取 `dist/`，不会触发复制。

## 设置项

设置保存在 `src/App.jsx` 的 `viewSettings` React state 中，**不会持久化**。

| 设置 | 默认值 | 范围 / 说明 |
| --- | --- | --- |
| `scale` | `2.4`（240%） | `0.5`–`5`，即 50%–500% |
| `positionX` | `-30` | `-100`–`100`，单位是视口宽度的百分比 |
| `positionY` | `-27` | `-100`–`100`，单位是视口高度的百分比 |
| `backgroundColor` | `#06070d` | `#RRGGBB`，只影响页面 CSS 背景 |
| `clickToAction` | `true` | 抽屉关闭时点击 canvas 是否触发 `action` |

另外：

- 当前动画是独立 state，初始为 `idle`；可选值来自 Stage 返回的 `animations`。
- 眼睛提示是否看过保存在 `localStorage` 的 `spine-viewer:eye-hint:v1`，与播放设置无关。
- 页面没有 URL 状态，刷新后恢复上述默认值。

字段细节见[设置字段参考](docs/settings-reference.md)。

## 项目结构

```text
.
├─ index.html
├─ vite.config.js
├─ package.json
├─ public/
│  ├─ project.json
│  └─ spine/spine_hhbsd_bdmy/
│     ├─ bg/    bosaidongqiujin.{skel,atlas,png}
│     └─ angel/ bosaidongqiujin.{skel,atlas,png}
├─ scripts/
│  └─ copy-to-we.mjs         # 构建后复制 dist 到 WE 项目目录
├─ src/
│  ├─ main.jsx              # React 入口
│  ├─ App.jsx               # 状态、canvas、Stage 启动、调试面板
│  ├─ SettingsDrawer.jsx    # 右侧设置抽屉
│  ├─ spineStage.js         # WebGL / 资源 / 动画 / 相机 / 渲染循环
│  ├─ spine-webgl.js        # vendored Spine 3.8.99 运行时
│  └─ styles.css
├─ dist/                    # 构建产物，git 忽略
├─ docs/
├─ AGENTS.md
└─ README.md
```

没有 `spine-model/`、`src/spine/`、`hooks/`、`components/` 这些目录，也没有 `tsconfig.json`。`scripts/` 目前只有 `copy-to-we.mjs`。

## 数据流

```text
main.jsx
  └─ <App />
       ├─ <canvas ref>
       │    └─ startSpineStage(canvas, { onStatus, onAnimationChange, isCancelled })
       │         ├─ spine.webgl.ManagedWebGLRenderingContext + SceneRenderer
       │         ├─ 两个 AssetManager → public/spine/spine_hhbsd_bdmy/{bg,angel}/
       │         ├─ SkeletonBinary + AtlasAttachmentLoader → Skeleton / AnimationState
       │         ├─ fitView() → camera
       │         └─ requestAnimationFrame → drawSkeleton × 2
       ├─ viewSettings ── effect ──> stage.setView(scale, x / 100, y / 100)
       ├─ backgroundColor ──> <main style>
       ├─ clickToAction ──> canvas pointerup ──> stage.triggerAction()
       └─ <SettingsDrawer> ── onChange / play ──> App / Stage
```

更完整的说明见[架构设计](docs/architecture.md)。

## 关键约束

- `.skel` 是 Spine **3.8.99** 二进制；必须使用 [src/spine-webgl.js](src/spine-webgl.js) 中的 3.8 运行时，不能替换为 Spine 4.x 或 npm 上的运行时。
- `public/spine/spine_hhbsd_bdmy/` 当前就是资源事实来源；没有 `spine-model/` 源目录，也没有资源同步脚本。
- 两个图层都使用 `premultipliedAlpha: true`。
- 动画只有 `idle` 和 `action`；`action` 在骨架中排在前面，`idle` 必须在启动时显式播放。
- `action` 是非循环的；所有拥有 `action` 的图层播放完成后，统一回到 `idle`。如果以后加循环 Action，必须补上 Spine 3.8 的 `complete` 保护。
- 播放设置只存在于 React state，不写入 `localStorage`，也不写入 URL。
- `npm run build` 只构建到 `dist/`；`npm run build:we` 再通过 `scripts/copy-to-we.mjs` 复制并替换 WE 目标目录。

## 已知限制

- 高 DPI 屏幕上 canvas 按 CSS 像素渲染，没有乘 `devicePixelRatio`，画面可能偏软。
- 资源加载没有超时；网络或文件服务卡住时，页面可能一直停在加载状态。
- `dispose()` 只取消 rAF 和 resize 监听，没有显式释放 renderer、texture 和 animation state。
- 加载和错误状态只显示在左上角 `log` 按钮上，没有全屏遮罩。
- `npm run build` 没有类型检查；逻辑错误不会被构建发现。
- 复制步骤会清空 WE 目标目录；目标被 Wallpaper Engine 占用时可能失败。

## 文档

- [使用指南](docs/user-guide.md)
- [架构设计](docs/architecture.md)
- [Spine 3.8 与资源](docs/spine-runtime-and-assets.md)
- [开发与验证](docs/development.md)
- [设置字段参考](docs/settings-reference.md)

## 验证

```bash
npm run build      # 只构建
npm run build:we   # 构建并部署（需要时执行，会重新构建）
```

`npm run build` 必须通过；部署时 `npm run build:we` 的构建和复制都必须成功。之后在 Wallpaper Engine 中手动验证两个图层、动画、点击 Action、缩放/位置/背景色和刷新后的默认值。项目没有自动化测试；不要在未明确要求时引入 Playwright。
