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
- `node scripts/prepare-models.mjs --file deploy-models.json` — prepares the deployment subset (currently 50 models) without starting Vite.
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
- `deploy-models.json` is the deployment subset (currently 50 models, one per name, priority `bdmy > np > cshs > mr`, about 288 MB). `vercel.json` and `.github/workflows/deploy-pages.yml` prepare that file with `prepare-models --file` before building `dist`; do not switch deployments to all 332 models unless the platform supports a ~1.2 GB output.
- GitHub Pages workflow: `.github/workflows/deploy-pages.yml`; Pages source must be set to GitHub Actions. The published site must stay under GitHub Pages' 1 GB limit.

## Assets and Spine runtime

- `model-library/` is the committed source library. `public/spine/models/` is generated from it and is gitignored; do not edit generated model assets by hand.
- `model-library/models.json` is the raw library manifest. `public/spine/models/manifest.json` is generated per package and lists only the models included in that build.
- `model-presets.json` (tracked) stores optional per-model `recommendedView` values: `scale`, `positionX`, `positionY`, optional `backgroundColor`. `scripts/prepare-models.mjs` merges it into the package manifest.
- A preset may also be nested: `{ view, clock, spectrum, albumArt }`, where each section is optional and overrides that widget when the model is selected. A missing section leaves the widget alone. Both shapes are folded by `normalizePreset` in [src/utils/modelPreset.js](src/utils/modelPreset.js), which the build script imports too; the manifest keeps a flat `recommendedView` alongside the nested `preset` for backwards compatibility.
- To capture a model's tuned look for packaging: tune it in the browser, open the drawer's model tab, press “复制本模型完整预设”, paste the JSON into `model-presets.json`, then repackage. `localStorage` never ships with `dist/`, so tuning alone is not enough.
- If a model has no preset, use `scale: 1`, `positionX: 0`, `positionY: 0`, `backgroundColor: '#000000'`. Do not hard-code a global recommended view in the UI.
- A model's current view is recorded only when the user clicks “记录当前视图”; records live in `localStorage` under `spine-viewer:model-views:v1`. The “复制全部视图” button copies only recorded models as a ready-to-paste `model-presets.json` object. Do not auto-record on model switch or view change.
- Current accepted model shape: an `angel` layer with exactly one `.skel`/`.atlas`/`.png` and both `idle` and `action`; the `bg` layer is optional, and an `angel`-only model renders on the page background. NPCs (`spine_npc*`), the `sn` beast-girl set (`spine_sn*`, which also covers `spine_sn0`–`spine_sn2`), models without `action`, models with missing textures, and multi-asset directories are intentionally skipped. The library currently holds 332 models (127 dual-layer, 205 angel-only).
- `scripts/import-models.mjs` imports eligible models and rescales atlas metadata in `scripts/prepare-models.mjs` so atlas `size` matches the actual PNG. Do not bypass that step.
- Layers are rendered in manifest order: `bg` first when present, then `angel`. An `angel`-only model has a single `angel` layer and shows the page background behind it. Each layer contains one skeleton, one atlas, and one PNG. File names are model-specific and may contain spaces or `+`; the stage encodes path segments.
- The `.skel` files are Spine **3.8.99 binary**. Use the vendored [src/spine-webgl.js](src/spine-webgl.js) (3.8 runtime, `export { spine }`); do not replace it with Spine 4.x or the npm runtime.
- Both layers use `premultipliedAlpha: true`.
- `Vector3` is `spine.webgl.Vector3`, not `spine.Vector3`.

## Architecture

- `src/main.jsx` mounts `<App />`; React StrictMode is not used.
- `src/App.jsx` loads `spine/models/manifest.json`, owns `viewSettings`, the selected model, `currentAnimation`, the drawer/debug UI, and the canvas. The Stage effect depends on the selected model, so switching models disposes and recreates the Stage and applies the model's recommended view (or fallback).
- `src/spineStage.js` is the imperative WebGL layer: dynamic layer list, context, renderer, asset managers, skeletons, animation state, camera, resize handling, rAF loop, action state machine, and resource disposal.
- `src/components/SettingsDrawer.jsx` stays mounted; `.is-open` slides it in, and it is `inert` while closed. Its body is a vertical tab menu (`.inspector-nav`) beside a scrollable pane (`.inspector-pane`), with four tabs: `clock` (date/time), `spectrum` (audio spectrum and album art), `model` (model picker, animation, transform, background) and `other` (language, debug). `clock` and `spectrum` are engine-only: `availableTabs(inWallpaperEngine)` drops them in the browser, and their panes are gated on `inWallpaperEngine &&`, so a browser never renders those controls. `loadDrawerTab` never restores a tab that is unavailable in the current environment. The selected tab persists under `spine-viewer:drawer-tab:v1`; the retired `display` value maps to `clock`. The drawer itself does not scroll — only the pane does — because scrolling is unreliable in Wallpaper Engine; keep each tab's content short rather than adding more to one pane. The model section renders only when `inWallpaperEngine` is false: inside the engine the first manifest model is always used, so switching there is pointless.
- The widget layer is an external library, **WallKit** (`wallkit/components/clock`, `wallkit/components/spectrum`, `wallkit/components/album-art`), consumed as a git dependency and compiled from source by this project's Vite. It is a pure-view library: it renders props and never touches `window.wallpaper*`, storage or timers. `src/components/ControlOverlays.jsx` is the only place that renders it, mounted inside a single `inWallpaperEngine &&` block, so a plain browser never shows a clock, spectrum or album card (a preset with `show: true` has no visible effect there). ControlOverlays owns the engine side: the 1s clock ticker (`now`, because WallKit's Clock holds no timer), one rAF loop that fills a single reusable `Float32Array` in place and passes it as `bars`, the 1s media poll, and the paused flag from the pause bridge. Do not add polling, storage or translations inside the widgets — feed them from here.
- React components live in `src/components/`; non-React modules live in `src/utils/`; `src/` root keeps only the entry (`main.jsx`), app state (`App.jsx`), i18n, the WebGL layer, the vendored runtime, and global styles. Do not add new components to the `src/` root, and do not add new helpers to it either — put them in `src/utils/`.
- Styles are split per component and colocated: `src/base.css` (tokens, reset, `.viewer` shell) is imported once by `main.jsx`; `src/App.css` by `App.jsx`; `src/components/SettingsDrawer.css` by the drawer. The widget stylesheets ship inside WallKit and each component imports its own; do not override them from here. Do not add a new shared stylesheet or put another component's rules in an existing file; give a new component its own `.css` next to it and import it there.
- `src/i18n.js` owns Chinese, English, Japanese, and Korean UI strings, browser-language detection, and the `spine-viewer:language:v1` preference.
- Audio reactivity: an inline classic script in `index.html`'s `<head>` registers `window.wallpaperRegisterAudioListener` during HTML parsing (earlier than Vite's deferred module script) and stores `window.__weAudioFrame` / `window.__weAudioAt`. `src/utils/wallpaperAudio.js` only reads those globals (`isWallpaperAudioAvailable`, `getWallpaperAudioFrame(staleMs)`). `src/utils/audio.js` holds the pure helpers (`summarizeWallpaperAudio`, `extractSpectrumBars`, `smoothAudioLevel`). Inside the engine a missing frame means silence, never fake bars. The `syntheticSpectrum` / `syntheticAudioLevel` helpers are currently unreferenced: the widgets are not mounted in a browser at all, so there is nothing for them to feed — do not wire them back into a component. Never register the listener from React code or a `window.onload` handler.
- **`supportsaudioprocessing` belongs inside `general`, never at the top level.** Wallpaper Engine's native `project.json` shape is `{ "file": "index.html", "general": { "properties": { "schemecolor": {...} }, "supportsaudioprocessing": true }, "title": "...", "type": "Web" }` — note `type` is capitalised `"Web"`. A top-level `"supportsaudioprocessing": true` is silently ignored, and the symptom is the audio listener registering successfully while the callback never fires (0 callbacks). Keep `public/project.json` on that exact nested shape. If audio still fails, check the engine's Media → audio recording device setting and that Wallpaper Engine is not muted in the Windows volume mixer.
- Spectrum state (`spine-viewer:spectrum:v1`) is `show`, `style`, `offsetX`, `offsetY`, `size`, `color`. `offsetX`/`offsetY` still address the **centre** of the box in 0-100 viewport percentages (50 is centred), because that is what the sliders and the saved presets mean, while WallKit anchors widgets to the bottom-left corner: the conversion lives in `src/utils/controlOverlay.js` and nowhere else. `size` is WallKit's percentage (20-500, 100 = a 30vw x 15vh reference box); the retired `scale` (0.5-5) is read as `size = scale * 300`. Do not reintroduce `scale`, and do not add peak-hold markers.
- Album card state (`spine-viewer:album-art:v1`) is `show`, `style`, `size`, `offsetX`, `offsetY` — `size` is the cover height as a viewport percentage (10-40) and is converted to WallKit's 20-300 in `src/utils/controlOverlay.js`. **The old `corner` field is gone**: WallKit anchors every widget to the bottom-left corner, so a preset written for a top or right corner keeps its size but needs its offsets re-tuned. WallKit renders nothing when there is no track and no "nothing playing" placeholder — the drawer copy covers that case. `playback === null` still means unknown and must be treated as playing.
- Media integration: the inline script in `index.html`'s `<head>` registers the `wallpaperRegisterMedia*` listeners and writes one global object, `window.__weMedia`. `src/utils/wallpaperMedia.js` only reads it (`isWallpaperMediaAvailable`, `getWallpaperMedia`, `isWallpaperMediaEnabled`); `ControlOverlays.jsx` polls it once per second and skips the state update when no field changed. The cover must not expire on a timer — the engine only pushes on track change — so hide the card only on an explicit `stopped` playback state, and treat an unknown state (`null`, e.g. missing `window.wallpaperMediaIntegration`) as playing.
- There is no edit/show mode and no URL state. Clicking the canvas triggers `action` whenever the drawer is closed and `clickToAction` is true.
- Playback settings and the selected model are React state only; the first model in the generated manifest is selected on every load. Display preferences are persisted separately: per-model view records (`spine-viewer:model-views:v1`), `clock` (`spine-viewer:clock:v1`), `spectrum` (`spine-viewer:spectrum:v1`), `albumArt` (`spine-viewer:album-art:v1`), the language (`spine-viewer:language:v1`), and the drawer tab (`spine-viewer:drawer-tab:v1`). Do not treat the selected model itself as persisted.
- The UI is intentionally chrome-less: full-screen canvas, no header/footer/card borders. Preserve the immersive layout.

## Non-obvious behavior

- Only animations are `idle` and `action`. `action` is first in the skeleton; `idle` must be played explicitly at startup.
- `action` is non-looping. When all layers that have it complete, the stage returns them to `idle`. The implementation uses an action token plus a pending-layer set to ignore stale completions.
- A click never restarts a running `action`: `triggerAction()` is non-forced and returns early while `actionInFlight` is set, so the next action only starts after the previous one finished and the stage is back on `idle`. Picking `action` in the drawer's animation dropdown is forced (`play('action')` → `startAction(true)`) and still replays from the start. Any switch to another animation in `play()` must clear `actionInFlight`, otherwise the token check swallows the stale `complete` and clicks stay blocked forever.
- If a looping Action is added later, Spine 3.8 fires `complete` on every loop wrap; add a `loopAction` guard before returning to idle.
- There is no TypeScript compile step. Syntax and import errors fail `npm run build`; logic errors do not.
- The canvas backing store is sized in CSS pixels (no `devicePixelRatio` scaling), so high-DPI rendering is currently upscaled and may look soft.
