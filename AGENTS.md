# AGENTS.md

## Project

Spine 3.8 WebGL viewer built with Vite + React 18 (JSX). It can package one model or all processed models, and select a model in the UI. There is no TypeScript, no lint suite, and no test suite. `npm run build` is the Vite production bundle; `npm run build:we` also copies the bundle to the Wallpaper Engine target.

## Execution rules

- Never leave a command, server, or verification step hanging. Use explicit timeouts and bounded waits; do not run interactive commands or open-ended foreground servers.
- If a step stalls or times out, terminate it, inspect the output/logs, and continue with a smaller bounded check. Never wait for the user to interrupt.
- Clean up background processes and temporary test dependencies before reporting completion.
- Do not run Playwright/browser automation unless the user explicitly requests it. The user manually tests each change in Wallpaper Engine.
- Do not run `npm run build`, `npm run build:we`, `npm run dev:all`, or any `npm run package:*` command after making changes unless the user explicitly asks for a build, packaging, or verification. Do not build speculatively; leave verification to the user unless requested.
- If `npm run build` or `npm run build:we` fails with `spawn EPERM` from esbuild inside a restricted sandbox, rerun the exact command outside the sandbox. That is a sandbox pipe restriction, not a dependency or code fault; do not change dependencies to work around it.

## Commands

- `npm run dev` — Vite dev server for the currently prepared `public/spine/models` package. Default `http://localhost:5173/`; Vite may choose another port if 5173 is occupied.
- `npm run dev:all` — prepares all models (skips copying if the current package matches `model-library/models.json` and `model-presets.json`) and starts Vite. Extra arguments are passed to Vite.
- `npm run build` — `vite build` only, writes `dist/`. There is no `tsc --noEmit`, no asset sync, and no test step. It must pass.
- `npm run build:we` — runs `npm run build`, then `node scripts/copy-to-we.mjs` replaces the Wallpaper Engine target with `dist/`. Use this when deploying the current `public/spine/models` content.
- `npm run models:import` — scans `modelSourceDir` from `local.config.json` (or `MODEL_SOURCE_DIR`), imports eligible models into `model-library/`, and writes `model-library/models.json`.
- `npm run models:use -- <id>[,<id>...]` — prepares one or more selected models into `public/spine/models` for dev/single builds.
- `node scripts/prepare-models.mjs --file deploy-models.json` — prepares the deployment subset (currently 51 models) without starting Vite.
- `npm run package:model -- <id>` — prepares one model, builds, and deploys.
- `npm run package:all` — prepares every eligible model in `model-library`, builds, and deploys.
- `npm run preview` — serves `dist/` on Vite's default preview port (`4173`); use `--port` if that port is unavailable.

## Build and deploy

- [vite.config.js](vite.config.js) sets `build.outDir: 'dist'` and `emptyOutDir: true`; `dist/` is gitignored.
- [scripts/copy-to-we.mjs](scripts/copy-to-we.mjs) creates a staging copy of `dist/`, removes the target directory, and renames the staging copy into place.
- `npm run build:we` runs the build and copy in one command. To retry only the copy after a build, run `node scripts/copy-to-we.mjs`.
- The Wallpaper Engine target comes from `weTargetDir` in the ignored `local.config.json` or from `WE_TARGET_DIR`; there is no built-in local default. `local.config.example.json` is the tracked template.
- The copy replaces the whole target directory. Do not put hand-written files there; if Wallpaper Engine is using those files, the copy may fail.
- `base` is `'./'`, so generated asset URLs are relative; `build.target` is `es2015`.
- `deploy-models.json` is the deployment subset (currently 51 models, one per name, priority `bdmy > np > cshs > mr`, about 294 MB). `vercel.json` and `.github/workflows/deploy-pages.yml` prepare that file with `prepare-models --file` before building `dist`; do not switch deployments to all 128 models unless the platform supports a ~730 MB output.
- GitHub Pages workflow: `.github/workflows/deploy-pages.yml`; Pages source must be set to GitHub Actions. The published site must stay under GitHub Pages' 1 GB limit.

## Assets and Spine runtime

- `model-library/` is the committed source library. `public/spine/models/` is generated from it and is gitignored; do not edit generated model assets by hand.
- `model-library/models.json` is the raw library manifest. `public/spine/models/manifest.json` is generated per package and lists only the models included in that build.
- `model-presets.json` (tracked) stores optional per-model `recommendedView` values: `scale`, `positionX`, `positionY`, optional `backgroundColor`. `scripts/prepare-models.mjs` merges it into the package manifest.
- If a model has no preset, use `scale: 1`, `positionX: 0`, `positionY: 0`, `backgroundColor: '#000000'`. Do not hard-code a global recommended view in the UI.
- A model's current view is recorded only when the user clicks “记录当前视图”; records live in `localStorage` under `spine-viewer:model-views:v1`. The “复制全部视图” button copies only recorded models as a ready-to-paste `model-presets.json` object. Do not auto-record on model switch or view change.
- Current accepted model shape: `angel` + `bg`, exactly one `.skel`/`.atlas`/`.png` per layer, `idle` and `action` present. Models without `action`, without `bg`, NPC-only models, and malformed directories are intentionally skipped.
- `scripts/import-models.mjs` imports eligible models and rescales atlas metadata in `scripts/prepare-models.mjs` so atlas `size` matches the actual PNG. Do not bypass that step.
- Layers are `bg` then `angel`; each contains one skeleton, one atlas, and one PNG. File names are model-specific and may contain spaces or `+`; the stage encodes path segments.
- The `.skel` files are Spine **3.8.99 binary**. Use the vendored [src/spine-webgl.js](src/spine-webgl.js) (3.8 runtime, `export { spine }`); do not replace it with Spine 4.x or the npm runtime.
- Both layers use `premultipliedAlpha: true`.
- `Vector3` is `spine.webgl.Vector3`, not `spine.Vector3`.

## Architecture

- `src/main.jsx` mounts `<App />`; React StrictMode is not used.
- `src/App.jsx` loads `spine/models/manifest.json`, owns `viewSettings`, the selected model, `currentAnimation`, the drawer/debug UI, and the canvas. The Stage effect depends on the selected model, so switching models disposes and recreates the Stage and applies the model's recommended view (or fallback).
- `src/spineStage.js` is the imperative WebGL layer: dynamic layer list, context, renderer, asset managers, skeletons, animation state, camera, resize handling, rAF loop, action state machine, and resource disposal.
- `src/components/SettingsDrawer.jsx` stays mounted; `.is-open` slides it in, and it is `inert` while closed. Its body is a vertical tab menu (`.inspector-nav`) beside a scrollable pane (`.inspector-pane`), with four tabs: `clock` (date/time), `spectrum` (audio spectrum and album art), `model` (model picker, animation, transform, background) and `other` (language, debug). The selected tab persists under `spine-viewer:drawer-tab:v1`; the retired `display` value maps to `clock`. The drawer itself does not scroll — only the pane does — because scrolling is unreliable in Wallpaper Engine; keep each tab's content short rather than adding more to one pane. The model section renders only when `inWallpaperEngine` is false: inside the engine the first manifest model is always used, so switching there is pointless.
- `src/components/Clock.jsx` renders the optional date/time overlay in the bottom-left corner; it polls once per second only while visible, uses `pointer-events: none`, refreshes on `visibilitychange` / Wallpaper Engine pause, and tilts in 3D toward the pointer. Its formatting and tilt helpers live in `src/utils/clock.js` (`computeClockTilt`), and the `clock` state is persisted separately under `spine-viewer:clock:v1`.
- React components live in `src/components/`; non-React modules live in `src/utils/`; `src/` root keeps only the entry (`main.jsx`), app state (`App.jsx`), i18n, the WebGL layer, the vendored runtime, and styles. Do not add new components to the `src/` root, and do not add new helpers to it either — put them in `src/utils/`.
- `src/i18n.js` owns Chinese, English, Japanese, and Korean UI strings, browser-language detection, and the `spine-viewer:language:v1` preference.
- Audio reactivity: an inline classic script in `index.html`'s `<head>` registers `window.wallpaperRegisterAudioListener` during HTML parsing (earlier than Vite's deferred module script) and stores `window.__weAudioFrame` / `window.__weAudioAt`. `src/utils/wallpaperAudio.js` only reads those globals (`isWallpaperAudioAvailable`, `getWallpaperAudioFrame(staleMs)`). `src/utils/audio.js` holds the pure helpers (`summarizeWallpaperAudio`, `extractSpectrumBars`, `syntheticSpectrum`, `syntheticAudioLevel`, `smoothAudioLevel`). Browsers cannot read system audio, so synthetic spectrum/beat data stands in there. Never register the listener from React code or a `window.onload` handler.
- **`supportsaudioprocessing` belongs inside `general`, never at the top level.** Wallpaper Engine's native `project.json` shape is `{ "file": "index.html", "general": { "properties": { "schemecolor": {...} }, "supportsaudioprocessing": true }, "title": "...", "type": "Web" }` — note `type` is capitalised `"Web"`. A top-level `"supportsaudioprocessing": true` is silently ignored, and the symptom is the audio listener registering successfully while the callback never fires (0 callbacks). Keep `public/project.json` on that exact nested shape. If audio still fails, check the engine's Media → audio recording device setting and that Wallpaper Engine is not muted in the Windows volume mixer.
- `src/components/Spectrum.jsx` draws a 128-bar equaliser on a Canvas 2D surface pinned to the top or bottom edge. It has its own `spectrum` state (`spine-viewer:spectrum:v1`: `show`, `position`, `height`). Use Canvas 2D, not 128 DOM nodes, and keep `pointer-events: none`. There is deliberately no peak-hold marker: keep the visual to plain bars.
- `src/components/MiniSpectrum.jsx` is the same bar renderer without any positioning: it fills whatever box the parent gives it, and `src/components/AlbumArt.jsx` puts one under the track metadata. Both share `readBars` semantics — real frames inside the engine, synthetic data in a browser, and silence (never fake bars) once the engine is detected but silent.
- `src/components/AlbumArt.jsx` renders a rectangular card with two independent layers inside the body column: the mini spectrum is absolutely positioned and fills the whole card height at the back, and the title/artist/album float above it in `.album-art__meta` (z-index 1, no background — readability comes from the card's `text-shadow`). They never share flex space, so the text cannot squeeze the graph and the graph keeps the full height. The cover is wrapped in `.album-art__disc`, a circular mask that spins once per 24s; `is-paused` sets `animation-play-state: paused`, and `prefers-reduced-motion` disables the animation entirely. All states render through one `shell()` helper so the card keeps a single footprint. Peaks reach 78% of the card height; the graph colour follows `spectrum.color`.
- There is no edit/show mode and no URL state. Clicking the canvas triggers `action` whenever the drawer is closed and `clickToAction` is true.
- Playback settings and the selected model are React state only; the first model in the generated manifest is selected on every load. Per-model view records are persisted separately under `spine-viewer:model-views:v1`; the eye-hint flag uses `spine-viewer:eye-hint:v1`. Do not treat the selected model itself as persisted.
- The UI is intentionally chrome-less: full-screen canvas, no header/footer/card borders. Preserve the immersive layout.

## Non-obvious behavior

- Only animations are `idle` and `action`. `action` is first in the skeleton; `idle` must be played explicitly at startup.
- `action` is non-looping. When all layers that have it complete, the stage returns them to `idle`. The implementation uses an action token plus a pending-layer set to ignore stale completions.
- If a looping Action is added later, Spine 3.8 fires `complete` on every loop wrap; add a `loopAction` guard before returning to idle.
- There is no TypeScript compile step. Syntax and import errors fail `npm run build`; logic errors do not.
- The canvas backing store is sized in CSS pixels (no `devicePixelRatio` scaling), so high-DPI rendering is currently upscaled and may look soft.
