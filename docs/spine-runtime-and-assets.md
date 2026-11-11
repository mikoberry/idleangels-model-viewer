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

当前仓库没有 `spine-model/` 源模型目录，也没有 `scripts/sync-assets.mjs`。**`public/spine/` 是当前提交的资源事实来源。**

```text
public/
├─ project.json                         # Wallpaper Engine 项目描述
└─ spine/
   └─ spine_hhbsd_bdmy/
      ├─ bg/
      │  ├─ bosaidongqiujin.skel
      │  ├─ bosaidongqiujin.atlas
      │  └─ bosaidongqiujin.png
      └─ angel/
         ├─ bosaidongqiujin.skel
         ├─ bosaidongqiujin.atlas
         └─ bosaidongqiujin.png
```

图层配置在 `src/spineStage.js` 中：

| 图层 | 顺序 | 说明 |
| --- | --- | --- |
| `bg` | 先绘制 | 背景层 |
| `angel` | 后绘制 | 前景角色层 |

两个图层都使用 `premultipliedAlpha: true`，绘制时传给 `renderer.drawSkeleton(skeleton, true)`。

## 当前资源核对结果

- 两个 `.skel` 的版本字符串都是 `3.8.99`。
- 动画只有 `action` 和 `idle`，其中 `action` 排在前面。
- `idle` 时长约 8 秒，`action` 时长约 3.33 秒。
- 两个 atlas 的 `size` 都是 `2048,2048`，对应 PNG 实际尺寸也是 `2048x2048`。
- atlas 使用 `rotate: true` / `rotate: false`，并在少数 **MeshAttachment** 区域使用 `180` / `270` 角度。当前 3.8 运行时的 mesh UV 分支支持 90/180/270；RegionAttachment 仍按 `rotate: true` / `false` 处理，当前资源没有对 RegionAttachment 使用数字角度。
- 如果替换后的资源把 `180` / `270` 用在 RegionAttachment 上，3.8 运行时会按未旋转处理，可能贴图错位；需要改成 `true` / `false` 或调整导出。
- 骨架中的图片路径字段可能包含旧导出环境的绝对路径，但实际纹理加载走 atlas 页面名 + 相对路径，不依赖该字段。

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
3. 为每个图层创建 `AssetManager`，路径前缀为：
   ```text
   ./spine/spine_hhbsd_bdmy/bg/
   ./spine/spine_hhbsd_bdmy/angel/
   ```
4. 并行调用：
   ```js
   manager.loadBinary('bosaidongqiujin.skel')
   manager.loadTextureAtlas('bosaidongqiujin.atlas')
   ```
5. 每 50ms 轮询 `isLoadingComplete()` 和 `hasErrors()`；有错误就 reject，全部完成才继续。
6. 用 `AtlasAttachmentLoader` + `SkeletonBinary` 读取 `.skel`。
7. 创建 `Skeleton` / `AnimationStateData` / `AnimationState`。
8. 显式播放 `idle`，执行一次 `update(0)` / `apply` / `updateWorldTransform`。
9. 计算包围盒并初始化相机。

atlas 的页面名（例如 `bosaidongqiujin.png`）会相对于 atlas 文件所在目录解析。因此三个文件必须放在同一图层目录下。

## 为什么 atlas 与 PNG 必须一致

`.skel` 中的 UV、区域尺寸和偏移依赖 atlas 声明的页面尺寸。如果 PNG 被缩放，但 atlas 仍写着旧尺寸，会出现：

- 贴图错位、拉伸、闪烁
- 角色显示不完整
- 同一张图的不同区域采样到错误内容

当前项目没有自动缩放 atlas 的脚本。替换 PNG 时，必须同时保证 atlas 的 `size` 与 PNG 实际尺寸一致，并按相同比例处理区域元数据。

## 替换模型

当前没有 `spine-model/` 和 `sync:assets`，替换资源需要手动完成：

1. 用 Spine **3.8.99** 导出新的二进制骨架和 atlas。
2. 保持目录和文件名：
   ```text
   public/spine/spine_hhbsd_bdmy/bg/bosaidongqiujin.{skel,atlas,png}
   public/spine/spine_hhbsd_bdmy/angel/bosaidongqiujin.{skel,atlas,png}
   ```
3. 每个图层同时替换 `.skel`、`.atlas`、`.png`，不要混用不同版本。
4. 确认 atlas 的 `size` 与 PNG 实际宽高一致。
5. 如果动画名变化，同步修改 `src/spineStage.js` 中的：
   - `DEFAULT_ANIMATION`
   - `ACTION_ANIMATION`
   - 混合时间设置
   - UI 标签（`src/SettingsDrawer.jsx` 的 `ANIMATION_LABELS`）
6. 如果目录、图层名或文件名变化，同步修改 `src/spineStage.js` 中的 `MODEL_BASE`、`LAYERS`、`SKELETON`、`ATLAS`。
7. 运行：
   ```bash
   npm run build:we
   ```
   如果只需要检查构建，可先运行 `npm run build`，再单独执行 `node scripts/copy-to-we.mjs`。
8. 在 Wallpaper Engine 中手动检查：
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
| 页面空白、资源 404 | 路径错误或 `public/spine/...` 缺失 | 检查两个图层目录和三个文件是否存在 |
| 角色边缘发黑/发亮 | premultiplied alpha 不匹配 | 确认导出设置与 `premultipliedAlpha: true` 一致 |
| Action 播完回 idle | 当前实现预期行为 | `action` 是非循环的；需要循环时再实现 loop 逻辑 |
| 改成循环 Action 后第一次循环就回 idle | 缺少 Spine 3.8 `complete` 保护 | 在完成回调里判断 `loopAction`，循环时直接返回 |
| 构建通过但页面资源加载失败 | 构建不检查资源内容 | 检查 `public/spine/...`，不要只看构建退出码 |
| 高倍缩放画面偏软 | canvas 未按 devicePixelRatio 放大 | 当前已知限制；需要时再实现 DPR 适配 |

## 相关文件

- [src/spineStage.js](../src/spineStage.js)
- [src/spine-webgl.js](../src/spine-webgl.js)
- [src/SettingsDrawer.jsx](../src/SettingsDrawer.jsx)
- [public/spine/spine_hhbsd_bdmy/](../public/spine/spine_hhbsd_bdmy/)
- [vite.config.js](../vite.config.js)
