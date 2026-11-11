# 开发与验证

本文档说明当前项目的开发环境、命令、构建行为、调试方式和验证清单。代理/自动化维护者还应阅读根目录的 [AGENTS.md](../AGENTS.md)。

## 环境

- Node.js 18+；当前在 Node.js 20.18.1、npm 10.8.2 下验证。
- Vite 5、React 18、JSX。
- 需要一个支持 WebGL 的现代浏览器。
- 项目没有 TypeScript、lint 或测试套件。

## 安装与启动

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:5173/
```

Vite 在端口被占用时会自动选择下一个可用端口，以终端输出为准。`npm run dev` **不会**同步资源，也没有 `predev` / `prebuild` 钩子。

## 命令

| 命令 | 行为 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，默认 `5173` |
| `npm run build` | 只执行 `vite build`，输出到 `dist/`，不复制 |
| `npm run build:we` | 先执行 `npm run build`，再复制 `dist/` 到 WE 目标目录 |
| `npm run preview` | 预览 `dist/`，默认端口 `4173`；不触发复制 |

### 构建与部署（重要）

[vite.config.js](../vite.config.js) 当前配置：

```js
build: {
  target: 'es2015',
  outDir: 'dist',
  emptyOutDir: true,
}
```

只构建：

```bash
npm run build
```

构建并部署：

```bash
npm run build:we
```

`build:we` 的顺序：

1. `vite build` 清空并重建仓库内的 `dist/`。
2. `node scripts/copy-to-we.mjs` 把 `dist/` 复制到 staging 目录。
3. 删除旧的目标目录，把 staging 目录重命名为目标目录。

默认目标：

```text
F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/spine-react-test
```

注意：

- 目标目录会被整体替换；不要在里面放手工文件。
- 目标路径可以用 `WE_TARGET_DIR` 覆盖，例如 PowerShell：

  ```powershell
  $env:WE_TARGET_DIR = 'F:/path/to/another-we-project'
  npm run build:we
  ```

- 如果 Wallpaper Engine 正在占用目标文件，复制可能失败；先关闭/停止壁纸。
- 如果 `dist/` 已构建好，只想重试复制，执行 `node scripts/copy-to-we.mjs`。
- `dist/` 已被 `.gitignore` 忽略。
- `base: './'`，生成资源 URL 是相对路径。

### 构建能检查什么

`npm run build` 能发现：

- JSX / JS 语法错误
- 模块导入路径错误
- Vite / Rollup 打包错误
- 部分未定义标识符在打包阶段暴露的问题

不能发现：

- 类型错误（没有 TypeScript）
- 运行时逻辑错误
- 资源内容错误（例如 atlas 与 PNG 尺寸不一致）
- WebGL / 驱动兼容问题

## 手动验证

项目没有自动化测试。修改后至少执行：

```bash
npm run build
```

需要在 Wallpaper Engine 中查看效果时，直接执行：

```bash
npm run build:we
```

它会重新构建并复制；然后手动检查：

- [ ] 两个图层都能显示，顺序为 `bg` 在下、`angel` 在上
- [ ] 启动后播放 `idle`
- [ ] 动画下拉框可以选择 `idle` / `action`
- [ ] 点击画面触发 `action`，播放结束后回到 `idle`
- [ ] 抽屉打开时点击画面不会触发 `action`
- [ ] 取消“点击画面触发 action”后，点击不再触发
- [ ] 缩放 50%–500% 生效，输入框和滑杆同步
- [ ] 水平/垂直位置 -100%–100% 生效，正值方向正确
- [ ] 两个视图复位按钮恢复 100/0/0 和 240/-30/-27
- [ ] 背景色即时生效，透明区域显示该颜色
- [ ] 眼睛提示首次出现，点击“我知道了”后不再出现
- [ ] `log` 按钮能展开/收起调试面板
- [ ] 移动端宽度下抽屉占满宽度
- [ ] 刷新后播放设置恢复默认值（当前版本不持久化）
- [ ] 浏览器控制台无资源 404、WebGL 错误或未捕获异常

## 调试

### log 面板

左上角 `log` 按钮可以展开调试面板，内容包括：

- 运行环境（Wallpaper Engine / 浏览器）
- 浏览器版本
- 窗口、canvas、屏幕、可用屏幕尺寸
- 像素比
- CPU 线程、设备内存
- 平台、语言
- WebGL 版本 / vendor / renderer
- WE API 检测结果
- 页面 URL、User Agent

面板在打开时和窗口 resize 时更新。错误状态会反映在 `log` 按钮的颜色和 `title` 上；当前没有全屏错误遮罩。

### canvas 数据属性

`spineStage.js` 会把调试值写到 canvas 的 `dataset`：

```text
data-animation
data-camera-zoom
data-camera-x
data-camera-y
```

可以在控制台查看：

```js
const canvas = document.querySelector('canvas')
console.log(canvas.dataset)
```

### 常见检查点

1. 控制台是否有 WebGL 上下文创建失败或资源 404。
2. `public/spine/spine_hhbsd_bdmy/` 下两个图层的 `.skel`、`.atlas`、`.png` 是否都存在。
3. atlas 的 `size` 是否与 PNG 实际尺寸一致。
4. `.skel` 是否为 3.8.99 导出。
5. 两个图层是否都使用 `premultipliedAlpha: true`。
6. Action 完成后是否按预期回到 `idle`。

## 排障

### `npm run build` / `npm run build:we` 报 `spawn EPERM`

在受限沙箱中，esbuild 启动子进程可能被禁止使用管道，表现为：

```text
Error: spawn EPERM
  at ensureServiceIsRunning (.../esbuild/lib/main.js)
```

这不是依赖损坏，也不是代码错误。请在普通终端/非沙箱环境重跑同一条命令。不要为此修改依赖或构建配置。

### `npm run preview` 端口不可用

`npm run preview` 只服务 `dist/`，不会复制到 WE 目录。默认端口是 `4173`；如果端口被占用或系统限制，可以显式指定：

```bash
npm run preview -- --port 5174 --strictPort
```

### 复制到 WE 目标目录失败

- 检查 `scripts/copy-to-we.mjs` 中的默认路径，或 `WE_TARGET_DIR` 是否指向正确目录。
- 关闭/停止正在使用目标文件的 Wallpaper Engine 壁纸。
- 检查目标盘符和父目录是否存在、是否有写权限。
- 失败时脚本会删除 staging 目录，不会留下临时副本；但目标目录可能已经被替换。`dist/` 仍然存在时，可以只重跑 `node scripts/copy-to-we.mjs`，不必重新构建。
- 如果目标路径被错误地设置为项目目录、`dist/` 或盘符根目录，脚本会拒绝执行。

### 页面空白 / 资源 404

- 检查 `public/spine/spine_hhbsd_bdmy/{bg,angel}/` 下三个文件是否齐全。
- 检查 `spineStage.js` 里的 `MODEL_BASE`、`LAYERS`、`SKELETON`、`ATLAS`。
- 检查部署目录里 `spine/...` 是否被正确复制。

### 贴图错位

几乎都是 atlas 与 PNG 尺寸不一致。当前没有自动同步脚本，需要手动修正 atlas 的页面 `size`，以及区域的 `xy`、`size`、`orig`、`offset` 等元数据。

### 高 DPI 画面偏软

当前 canvas 按 CSS 像素渲染，没有乘 `devicePixelRatio`。这是已知限制；如果后续要改，需要同时调整 `canvas.width/height`、`gl.viewport`、`camera.setViewport` 和 `fitView` 的尺寸来源。

### Action 不回到 idle

- 检查两个图层是否都有 `action`。
- 检查 `action` 是否被设置成循环。
- 检查 `actionToken` / `pendingActionLayers` 逻辑是否被改坏。
- 如果新增了循环 Action，必须处理 Spine 3.8 每次循环回绕都触发 `complete` 的行为。

## 代码约定

- 保持 `App` 持有 `startSpineStage`，不要让设置抽屉开关导致 Stage 重建。
- 不要用 Spine 4.x 运行时替换 vendored `spine-webgl.js`。
- 不要直接修改 `spine-webgl.js` 的内部实现；它是第三方运行时。
- `public/spine/...` 当前是资源事实来源；替换时三个文件一起换，并保证 atlas/PNG 一致。
- 新增设置时，至少同步：
  - `App.jsx` 的初始 `viewSettings`
  - `SettingsDrawer.jsx` 的控件和 `onChange`
  - 如涉及 Stage，补 `spineStage.js` 的 API / effect
  - 相关文档
- 保持沉浸式全屏布局，不引入页头、页脚或明显卡片边框。
- 关闭的设置抽屉应保持 `inert`。
- 修改动画逻辑时，保留 `actionToken` / pending 集合的旧回调保护。
- `npm run build` 只构建到 `dist/`；`npm run build:we` 才复制。不要把 `outDir` 直接改回 WE 目录。
- 改完至少运行 `npm run build`；需要部署时运行 `npm run build:we` 并确认复制成功。

## 提交前检查清单

- [ ] `npm run build` 通过
- [ ] 部署时 `npm run build:we` 通过，且 `dist/` 已复制到 WE 目标目录
- [ ] 控制台无资源 404 / WebGL 错误
- [ ] 两个图层、`idle` / `action` 正常
- [ ] 点击 Action、抽屉开关、眼睛提示正常
- [ ] 缩放/位置/背景色实时生效
- [ ] 视图复位按钮行为正确
- [ ] 移动端宽度下抽屉可用
- [ ] 文档与代码一致
- [ ] 没有遗留后台服务、临时脚本或 Playwright 依赖
