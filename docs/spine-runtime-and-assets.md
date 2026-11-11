# Spine 3.8 与资源

本文档说明当前项目实际使用的 Spine 运行时、资源布局、加载方式和替换资源的注意事项。

## 运行时版本

- `.skel` 文件是 **Spine 3.8.99 二进制**。
- 运行时位于 [src/spine-webgl.js](../src/spine-webgl.js)，是 vendored 的 Spine 3.8 WebGL 运行时，文件末尾通过 `export { spine }` 暴露命名空间。
- 不要替换为 Spine 4.x，也不要改用 npm 上的 Spine runtime；二进制格式和 API 都不兼容。
- `spine.webgl.Vector3` 才是 WebGL 层使用的 `Vector3`，不是 `spine.Vector3`。
- 当前代码只使用运行时的一小部分 API：
  - `spine.webgl.ManagedWebGLRenderingContext`
  - `spine.webgl.SceneRenderer`
  - `spine.webgl.AssetManager`
  - `spine.SkeletonBinary`
  - `spine.AtlasAttachmentLoader`
  - `spine.Skeleton`
  - `spine.AnimationStateData`
  - `spine.AnimationState`
  - `spine.Vector2`

## 资源目录

模型采用“源库 + 按包生成”的结构：

```text
model-library/                 # 源模型库，git 忽略
├─ models.json                 # 源库清单
├─ import-report.json          # 导入/拒绝原因
└─ spine_*/                    # 从源目录复制进来的合格模型

public/spine/models/           # 按包生成，git 忽略
├─ manifest.json               # 当前包的实际模型清单
└─ spine_*/
```

源目录默认是：

```text
F:/live2d/IdleAngels/model-output
```

当前筛选条件：

- 同时有 `angel` 和 `bg`；
- 每层恰好一套 `.skel` / `.atlas` / `.png`；
- 有 `idle` 和 `action`；
- atlas 页面名与 PNG 文件名一致。

当前源目录有 377 个模型目录、约 1.27 GB；按上述条件导入 **128 个**、约 731 MB。NPC、只有 `angel`、没有 `action`、缺 PNG、特殊目录（多套资源/嵌套模型）暂不处理。

图层顺序来自 `manifest.json` 的 `layers` 数组，当前合格模型都是：

| 图层 | 顺序 | 说明 |
| --- | --- | --- |
| `bg` | 先绘制 | 背景层 |
| `angel` | 后绘制 | 前景角色层 |

所有图层都使用 `premultipliedAlpha: true`，绘制时传给 `renderer.drawSkeleton(skeleton, true)`。

## 当前资源核对结果

- 源目录中 509 个 `.skel` 全部解析为 **3.8.99**。
- 当前导入的 128 个模型都是 `bg + angel`，每层都有 `idle` / `action`。
- 有 17 个 NPC 只有 `idle`，没有导入。
- 有 2 个模型缺少 PNG，没有导入。
- 源目录 509 个 atlas 中有 455 个声明的 `size` 与 PNG 实际尺寸不一致；`prepare-models` 会在复制时按 PNG 尺寸重写 atlas。
- atlas 可能包含 `rotate: true` / `false`，以及少数 **MeshAttachment** 区域的 `180` / `270` 角度；当前 3.8 运行时的 mesh UV 分支支持 90/180/270。
- 文件路径里可能有空格或 `+`，`spineStage.js` 会按路径段做 URL 编码。

## 加载流程

`src/spineStage.js` 的加载顺序：

1. 创建 `ManagedWebGLRenderingContext`：
   ```js
   {
     alpha: true,
     premultipliedAlpha: true,
     antialias: true,
   }
   ```
2. 创建 `SceneRenderer`。
3. 为 `model.layers` 的每一层创建 `AssetManager`，读取 manifest 里的 `basePath`：
   ```text
   ./spine/models/spine_abl0/bg
   ./spine/models/spine_abl0/angel
   ```
4. 并行调用：
   ```js
   manager.loadBinary(layer.skeleton)
   manager.loadTextureAtlas(layer.atlas)
   ```
5. 每 50ms 轮询 `isLoadingComplete()` 和 `hasErrors()`；有错误就 reject，全部完成才继续。
6. 用 `AtlasAttachmentLoader` + `SkeletonBinary` 读取 `.skel`。
7. 创建 `Skeleton` / `AnimationStateData` / `AnimationState`。
8. 显式播放 `idle`，执行一次 `update(0)` / `apply` / `updateWorldTransform`。
9. 计算包围盒并初始化相机。

atlas 的页面名会相对于 atlas 文件所在目录解析。因此 `.skel`、`.atlas`、`.png` 必须放在 manifest 指定的同一图层目录下。

## 为什么 atlas 与 PNG 必须一致

`.skel` 中的 UV、区域尺寸和偏移依赖 atlas 声明的页面尺寸。如果 PNG 被缩放，但 atlas 仍写着旧尺寸，会出现：

- 贴图错位、拉伸、闪烁
- 角色显示不完整
- 同一张图的不同区域采样到错误内容

`npm run models:import` + `scripts/prepare-models.mjs` 会自动按 PNG 实际尺寸重写 atlas 的页面 `size`，以及区域的 `xy`、`size`、`orig`、`offset`。不要手动复制源 atlas 到 `public/spine/models`，否则会出现贴图错位。

## 替换模型

替换或新增模型走模型管线：

1. 用 Spine **3.8.99** 导出新的二进制骨架和 atlas，按 `<model-id>/angel/` 与 `<model-id>/bg/` 放好。
2. 确保每层恰好一套 `.skel` / `.atlas` / `.png`，atlas 页面名与 PNG 文件名一致，并且有 `idle` 和 `action`。
3. 运行导入：
   ```bash
   npm run models:import
   ```
   源目录可用 `MODEL_SOURCE_DIR` 覆盖；默认是 `F:/live2d/IdleAngels/model-output`。
4. 准备模型：
   ```bash
   npm run models:use -- <model-id>[,<model-id>...]
   ```
5. 只检查构建：
   ```bash
   npm run build
   ```
6. 打包并部署到 WE：
   ```bash
   npm run package:model -- <model-id>
   # 或
   npm run package:all
   ```
7. 在 Wallpaper Engine 中手动检查：
   - 模型能否在抽屉里搜索并切换
   - 图层顺序
   - `idle` / `action`
   - 点击 Action 后是否回到 `idle`
   - 缩放/位置/背景色
   - 高倍缩放下的纹理边缘

## 常见问题

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 贴图错位、拉伸 | PNG 尺寸与 atlas 声明不一致 | 修正 atlas `size` 和区域元数据，或换回匹配的资源 |
| 骨架版本错误 | 用了 Spine 4.x 导出或错误 runtime | 使用 3.8.99 导出和 `src/spine-webgl.js` |
| 页面空白、资源 404 | 路径错误或 `public/spine/models/...` 缺失 | 检查 manifest 和图层目录；先运行 `models:use` 或 `package:*` |
| 模型列表为空 | `manifest.json` 缺失或没有模型 | 运行 `npm run models:use -- <id>` 或 `package:all` |
| 角色边缘发黑/发亮 | premultiplied alpha 不匹配 | 确认导出设置与 `premultipliedAlpha: true` 一致 |
| Action 播完回 idle | 当前实现预期行为 | `action` 是非循环的；需要循环时再实现 loop 逻辑 |
| 改成循环 Action 后第一次循环就回 idle | 缺少 Spine 3.8 `complete` 保护 | 在完成回调里判断 `loopAction`，循环时直接返回 |
| 构建通过但页面资源加载失败 | 构建不检查资源内容 | 检查 `public/spine/models/...` 和 manifest，不要只看构建退出码 |
| 高倍缩放画面偏软 | canvas 未按 devicePixelRatio 放大 | 当前已知限制；需要时再实现 DPR 适配 |

## 相关文件

- [src/spineStage.js](../src/spineStage.js)
- [src/spine-webgl.js](../src/spine-webgl.js)
- [src/SettingsDrawer.jsx](../src/SettingsDrawer.jsx)
- [scripts/import-models.mjs](../scripts/import-models.mjs)
- [scripts/prepare-models.mjs](../scripts/prepare-models.mjs)
- [scripts/package-models.mjs](../scripts/package-models.mjs)
- [vite.config.js](../vite.config.js)
