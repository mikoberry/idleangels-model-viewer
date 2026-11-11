# 开发与验证

本文档说明本地开发、构建、验证方式和代码约束。代理/自动化维护者还应阅读根目录的 `AGENTS.md`：那里是执行约束，本文件面向开发者。

## 环境

- Node.js 18+，建议使用 Node.js 20 LTS。
- 当前项目在 Node.js 20.18.1 下验证。
- 需要一个支持 WebGL 的现代浏览器。

## 安装与启动

```bash
npm install
npm run dev
```

`npm run dev` 会先执行 `predev`：

```bash
node scripts/sync-assets.mjs
```

随后启动 Vite，默认地址：

```text
http://localhost:5173/
```

开发服务器配置了 `host: true`，同一局域网内也可访问。端口固定为 `5173`。

## 命令

| 命令 | 行为 |
| --- | --- |
| `npm run dev` | `predev` 同步资源 → Vite 开发服务器 |
| `npm run build` | `prebuild` 同步资源 → `tsc --noEmit` → `vite build` |
| `npm run preview` | 用 Vite 预览 `dist/` |
| `npm run sync:assets` | 只同步资源 |

注意：

- `npm run preview` 的 Vite 默认预览端口是 `4173`。当前 Windows 验证环境中 `4173` 处于系统排除端口范围，应显式指定端口：

  ```bash
  npm run preview -- --port 5173 --strictPort
  ```

- 预览前必须先执行 `npm run build`，否则 `dist/` 可能不存在或过期。
- 构建产物输出到 `dist/`，已被 `.gitignore` 忽略。
- `npm run sync:assets` 会删除并重建 `public/spine/spine_hhbsd_bdmy/`，不要在里面保存手工修改。

## 类型检查与构建

项目没有独立的 lint 或 test 命令。`npm run build` 是唯一必须通过的检查：

```bash
npm run build
```

它包含：

1. 资源同步
2. `tsc --noEmit`
3. Vite 生产构建

TypeScript 配置为严格模式，并启用了：

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

因此未使用的 import、变量、参数或函数都会导致构建失败。

### 构建通过不等于资源正确

如果 `spine-model/` 不存在，`sync-assets.mjs` 会打印警告并跳过，构建仍可能通过。此时页面在运行时会出现加载错误。检查同步日志中的图层尺寸和 `sx/sy`，不要只看构建退出码。

## 开发模式下的 StrictMode

`src/main.tsx` 使用了 `React.StrictMode`。开发模式下 React 可能会重复执行 effect，导致 Stage 被创建、销毁、再创建，出现重复的资源加载或日志。这是开发期行为；生产构建不会重复挂载。

## Headless WebGL 验证

项目没有自动化测试套件。涉及 WebGL 的改动建议使用 headless 浏览器做一次有边界的验证。

### Edge + SwiftShader

Windows 上使用 Edge 并启用软件渲染：

```text
--use-angle=swiftshader
--enable-unsafe-swiftshader
```

Playwright 启动参数示例：

```js
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
```

### 临时安装 Playwright

不要把 Playwright 加入项目依赖。临时安装并在结束后清理：

```bash
npm install --no-save playwright-core
# 运行临时验证脚本
npm prune
```

验证脚本建议放在仓库外或临时目录，完成后删除。确认 `package.json` 和 `package-lock.json` 中没有残留 `playwright` 引用。

### 启动预览

先构建，再在 `5173` 启动预览：

```bash
npm run build
npm run preview -- --port 5173 --strictPort
```

启动后等待 HTTP 200，并设置明确的超时时间。不要把预览服务器作为无界前台进程留在终端里。

### 验证脚本建议

- 等待页面加载完成，例如等待设置中的 `<select>` 可用。
- 检查 canvas 存在且尺寸大于 0。
- 检查页面无 `pageerror`。
- 对 WebGL 场景可做像素/截图哈希断言，但动画会持续变化，优先针对稳定区域或暂停状态验证。
- 验证修改后清理：关闭浏览器、停止预览进程、删除临时脚本和日志、执行 `npm prune`。

## 调试

### 调试叠层

在编辑模式打开“调试叠层”，可查看：

- FPS
- Viewport
- Camera zoom
- Speed
- 当前动画和 Action 状态
- 整体包围盒
- 图层版本、动画、皮肤、骨骼和插槽数

调试叠层只在编辑模式渲染，且不阻挡鼠标。

### 常见检查点

1. 浏览器控制台是否有 WebGL 或资源 404 错误。
2. `public/spine/...` 是否由 `sync:assets` 生成。
3. 控制台或构建日志中的 atlas 缩放是否符合预期。
4. Spine 资源是否为 3.8.99 导出。
5. 两个图层是否都开启 premultiplied alpha。
6. 循环 Action 是否受 `loopAction` 保护。

## 代码约定

- 保持 `App` 持有 `useSpineStage`，不要让设置抽屉开关导致 Stage 重建。
- 不要用 Spine 4.x 运行时替换 vendored runtime。
- 不要直接编辑 `public/spine/...` 或 `dist/spine/...`。
- 新增设置时同时处理：
  - `PlaybackSettings` 类型
  - 默认值
  - `sanitizeSettings`
  - 设置 UI
  - 同步到 Stage 的 effect
- 保持沉浸式全屏布局，不引入页头、页脚或明显卡片边框。
- 隐藏的设置抽屉应保持 `inert`。
- 修改动画逻辑时保留 3.8 的循环 `complete` 保护。
- 改完运行 `npm run build`。

## 提交前检查清单

- [ ] `npm run build` 通过
- [ ] `sync:assets` 日志中的资源尺寸正常
- [ ] 页面可加载，canvas 有内容
- [ ] 眼睛按钮、抽屉外点击、`Esc` 均正常
- [ ] 缩放/位置/背景色实时生效并可持久化
- [ ] 恢复默认行为正确
- [ ] 展示模式下自动播放和点击 Action 正常
- [ ] 循环 Action 不会错误回到 `idle`
- [ ] 移动端宽度下设置面板可用
- [ ] 临时服务、Playwright 和日志已清理
