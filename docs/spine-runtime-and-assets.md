# Spine 3.8 与资源管线

本文档说明为什么固定 Spine 3.8、资源如何生成、如何替换模型，以及容易踩坑的运行时行为。

## 运行时版本

- `.skel` 文件是 **Spine 3.8.99 二进制**。
- 运行时位于 `src/spine/runtime/spine-webgl.js`，是 vendored 的 Spine 3.8 WebGL 运行时，带 ESM 包装和对应的 `.d.ts`。
- 不要替换为 Spine 4.x，也不要改用 npm 上的 Spine runtime；二进制格式和 API 都不兼容。
- 当前代码中的类型和构造器来自 vendored 运行时，例如 `spine.webgl.Vector3`，不是 `spine.Vector3`。

`参考/` 目录是旧 Wallpaper Engine 4.2 导出，只能作为美术/结构参考，不能用当前 3.8 运行时加载。

## 资源目录

```text
spine-model/
└─ spine_hhbsd_bdmy/
   ├─ angel/
   │  ├─ bosaidongqiujin.atlas
   │  ├─ bosaidongqiujin.png
   │  └─ bosaidongqiujin.skel
   └─ bg/
      ├─ bosaidongqiujin.atlas
      ├─ bosaidongqiujin.png
      └─ bosaidongqiujin.skel
```

- `spine-model/` 是资源事实来源。
- `public/spine/spine_hhbsd_bdmy/` 由脚本生成。
- `dist/spine/...` 是构建产物。
- `public/spine` 和 `dist/spine` 都不要手工编辑，否则下次 `dev` / `build` 会被覆盖。

图层配置在 `src/spine/manifest.ts`：

| 图层 | zIndex | 说明 |
| --- | --- | --- |
| `bg` | 0 | 背景层 |
| `angel` | 1 | 前景角色层 |

两个图层都配置了 `premultipliedAlpha: true`，绘制时会传给 `renderer.drawSkeleton()`。

## 自动资源同步

`npm run dev` 和 `npm run build` 会通过 `predev` / `prebuild` 自动执行：

```bash
npm run sync:assets
```

也可以手动执行。

脚本位置：`scripts/sync-assets.mjs`。

### 脚本做了什么

1. 删除 `public/spine/spine_hhbsd_bdmy/`。
2. 从 `spine-model/spine_hhbsd_bdmy/` 完整复制。
3. 对 `angel` 和 `bg` 分别执行 atlas 修正：
   - 读取 atlas 中声明的 `size`。
   - 读取 PNG 文件头中的真实宽高。
   - 计算 `sx = 实际宽度 / 声明宽度`、`sy = 实际高度 / 声明高度`。
   - 重写 atlas 页面头部的 `size`。
   - 按比例缩放并取整所有 `xy`、`size`、`orig`、`offset` 元组。
4. 输出每个图层的缩放日志。

当前资源在构建时会出现类似日志：

```text
[sync-assets] angel: atlas 4096x4096 -> 2048x2048 (sx=0.5000, sy=0.5000)
[sync-assets] bg: atlas 3835x3835 -> 2048x2048 (sx=0.5340, sy=0.5340)
```

### 为什么必须修正 atlas

Skeleton 中的 UV 和尺寸信息依赖 atlas 声明的页面尺寸。如果 PNG 被缩小，但 atlas 仍写着 `4096x4096`，纹理采样和区域计算就会错位，表现为：

- 贴图错位、拉伸、闪烁
- 角色显示不完整
- 同一张图的不同区域采样到错误内容

因此不要手动改 PNG 尺寸后直接运行，必须走 `sync:assets`。

### 当前脚本假设

- 模型目录名固定为 `spine_hhbsd_bdmy`。
- 图层目录固定为 `angel`、`bg`。
- 文件名固定为 `bosaidongqiujin.skel`、`.atlas`、`.png`。
- 当前两个 atlas 都是单页，脚本按这套结构处理。

如果新模型使用不同目录、文件名或多页 atlas，除了替换资源，还需要同步修改：

- `scripts/sync-assets.mjs`
- `src/spine/manifest.ts`

## 加载流程

`SpineStage.load()`：

1. 为每个图层创建 `spine.webgl.AssetManager`。
2. 加载 `.skel` 二进制和 `.atlas`。
3. 每 50ms 轮询加载进度和错误。
4. 用 `spine.SkeletonBinary` + `AtlasAttachmentLoader` 读取骨架。
5. 创建 `SpineLayer`。
6. 创建 `SceneAnimationController` 并显式播放 `idle`。
7. 采样 `idle` / `action` 的包围盒。
8. 启动渲染循环并发送 ready 事件。

资源路径基于 Vite 的 `import.meta.env.BASE_URL`，因此部署到子路径时仍从 `public/spine/...` 对应的静态路径加载。

## 动画约束

当前项目围绕两个动画名构建：

```text
idle
action
```

对应常量在 `src/spine/manifest.ts`：

- `SCENE_ANIMATIONS = ['idle', 'action']`
- `DEFAULT_ANIMATION = 'idle'`
- `ACTION_ANIMATION = 'action'`

注意：

- `action` 在骨架中可能排在 `idle` 前面，因此不能依赖“默认动画”。
- 启动时必须显式播放 `idle`。
- UI 的动画标签目前只映射 `idle` 和 `action`。
- 如果新模型改动画名，需要同步修改常量、UI 标签、Action 触发逻辑和默认设置。

### 循环 Action 的 `complete` 陷阱

Spine 3.8 在 Action 每次循环回到开头时也会触发 `complete`。`SceneAnimationController.handleActionComplete` 在 `loopAction` 为 true 时直接返回：

```ts
if (this.loopAction) return
```

这段保护不能删除，否则循环 Action 会在第一次循环结束时错误回到 `idle`。

## 替换模型检查清单

1. 用 Spine 3.8.99 导出替换 `spine-model/spine_hhbsd_bdmy/` 下的资源。
2. 如果目录或文件名变化，更新 `scripts/sync-assets.mjs` 和 `src/spine/manifest.ts`。
3. 如果动画名变化，更新 `SCENE_ANIMATIONS`、`DEFAULT_ANIMATION`、`ACTION_ANIMATION` 和 `PlaybackInspector` 中的标签。
4. 确认两个图层的 `premultipliedAlpha` 配置符合导出设置。
5. 执行：

   ```bash
   npm run sync:assets
   npm run build
   ```

6. 运行 `npm run dev`，检查：
   - 图层顺序
   - 动画是否正常
   - 缩放/位置/背景色
   - 包围盒和调试叠层
7. 若替换的是多页 atlas 或不同 atlas 文件名，先确认 `sync-assets.mjs` 是否仍适用。

## 常见问题

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 贴图错位、拉伸 | PNG 尺寸与 atlas 声明不一致 | 执行 `npm run sync:assets`，检查日志中的 `sx/sy` |
| 骨架版本错误 | 用了 Spine 4.x 导出或错误 runtime | 使用 3.8.99 导出和 vendored runtime |
| 页面空白、资源 404 | `public/spine/...` 缺失或路径错误 | 执行 `npm run sync:assets`，检查网络请求 |
| 角色边缘发黑/发亮 | premultiplied alpha 不匹配 | 确认导出设置与 `premultipliedAlpha: true` 一致 |
| 循环 Action 自动回 idle | 删除了 `loopAction` 保护，或循环未开启 | 保留 `handleActionComplete` 中的 guard |
| 手动改了 `public/spine` 又失效 | 生成目录被 predev/prebuild 覆盖 | 只改 `spine-model/`，然后同步 |
| `参考/` 资源无法加载 | 旧 Wallpaper Engine 4.2 导出 | 不要用 3.8 runtime 加载，重新导出 |
| WebGL 不可用 | 浏览器/驱动/headless 未启用软件渲染 | 使用支持 WebGL 的浏览器；headless 见开发文档 |

## 相关文件

- `scripts/sync-assets.mjs`
- `src/spine/manifest.ts`
- `src/spine/assetLoader.ts`
- `src/spine/SpineLayer.ts`
- `src/spine/SceneAnimationController.ts`
- `src/spine/runtime/spine-webgl.js`
- `src/spine/runtime/spine-webgl.d.ts`
