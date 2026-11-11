# AGENTS.md

## Project

Spine 3.8 WebGL viewer built with Vite + React 18 (JSX). There is no TypeScript, no lint suite, and no test suite. `npm run build` is the Vite production bundle; `npm run build:we` also copies the bundle to the Wallpaper Engine target.

## Execution rules

- Never leave a command, server, or verification step hanging. Use explicit timeouts and bounded waits; do not run interactive commands or open-ended foreground servers.
- If a step stalls or times out, terminate it, inspect the output/logs, and continue with a smaller bounded check. Never wait for the user to interrupt.
- Clean up background processes and temporary test dependencies before reporting completion.
- Do not run Playwright/browser automation unless the user explicitly requests it. The user manually tests each change in Wallpaper Engine.
- If `npm run build` or `npm run build:we` fails with `spawn EPERM` from esbuild inside a restricted sandbox, rerun the exact command outside the sandbox. That is a sandbox pipe restriction, not a dependency or code fault; do not change dependencies to work around it.

## Commands

- `npm run dev` — Vite dev server. Default `http://localhost:5173/`; Vite may choose another port if 5173 is occupied. There is no asset-sync step.
- `npm run build` — `vite build` only, writes `dist/`. There is no `tsc --noEmit`, no asset sync, and no test step. It must pass.
- `npm run build:we` — runs `npm run build`, then `node scripts/copy-to-we.mjs` replaces the Wallpaper Engine target with `dist/`. Use this when deploying.
- `npm run preview` — serves `dist/` on Vite's default preview port (`4173`); use `--port` if that port is unavailable.

## Build and deploy

- [vite.config.js](vite.config.js) sets `build.outDir: 'dist'` and `emptyOutDir: true`; `dist/` is gitignored.
- [scripts/copy-to-we.mjs](scripts/copy-to-we.mjs) creates a staging copy of `dist/`, removes the target directory, and renames the staging copy into place.
- `npm run build:we` runs the build and copy in one command. To retry only the copy after a build, run `node scripts/copy-to-we.mjs`.
- Default target: `F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/spine-react-test`; override it with the `WE_TARGET_DIR` environment variable.
- The copy replaces the whole target directory. Do not put hand-written files there; if Wallpaper Engine is using those files, the copy may fail.
- `base` is `'./'`, so generated asset URLs are relative; `build.target` is `es2015`.

## Assets and Spine runtime

- `public/spine/spine_hhbsd_bdmy/` is the current committed source of truth. There is no `spine-model/` directory and no `sync:assets` script; `scripts/` only contains `copy-to-we.mjs`.
- Layers are `bg` then `angel`; each contains `bosaidongqiujin.skel`, `bosaidongqiujin.atlas`, and `bosaidongqiujin.png`.
- The `.skel` files are Spine **3.8.99 binary**. Use the vendored [src/spine-webgl.js](src/spine-webgl.js) (3.8 runtime, `export { spine }`); do not replace it with Spine 4.x or the npm runtime.
- Both layers use `premultipliedAlpha: true`.
- `Vector3` is `spine.webgl.Vector3`, not `spine.Vector3`.
- The runtime resolves the atlas page PNG relative to the atlas file. Atlas `size` must match the actual PNG dimensions.
- If assets are replaced, replace all three files per layer, keep the 3.8.99 export, and verify atlas/PNG sizes. There is currently no script that rescales atlas metadata.

## Architecture

- `src/main.jsx` mounts `<App />`; React StrictMode is not used.
- `src/App.jsx` owns `viewSettings`, `currentAnimation`, the drawer/debug UI, and the canvas. Its mount effect calls `startSpineStage(canvas, ...)`, so the stage persists while the drawer opens and closes.
- `src/spineStage.js` is the imperative WebGL layer: context, renderer, asset managers, skeletons, animation state, camera, resize handling, rAF loop, action state machine, and dispose.
- `src/SettingsDrawer.jsx` stays mounted; `.is-open` slides it in, and it is `inert` while closed.
- There is no edit/show mode and no URL state. Clicking the canvas triggers `action` whenever the drawer is closed and `clickToAction` is true.
- Playback settings are React state only; they are not persisted. Only the eye-hint flag uses `localStorage`, under `spine-viewer:eye-hint:v1`.
- The UI is intentionally chrome-less: full-screen canvas, no header/footer/card borders. Preserve the immersive layout.

## Non-obvious behavior

- Only animations are `idle` and `action`. `action` is first in the skeleton; `idle` must be played explicitly at startup.
- `action` is non-looping. When all layers that have it complete, the stage returns them to `idle`. The implementation uses an action token plus a pending-layer set to ignore stale completions.
- If a looping Action is added later, Spine 3.8 fires `complete` on every loop wrap; add a `loopAction` guard before returning to idle.
- There is no TypeScript compile step. Syntax and import errors fail `npm run build`; logic errors do not.
- The canvas backing store is sized in CSS pixels (no `devicePixelRatio` scaling), so high-DPI rendering is currently upscaled and may look soft.
