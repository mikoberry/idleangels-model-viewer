# AGENTS.md

## Project
Spine 3.8 WebGL viewer built with Vite + React 18 + TypeScript. There is no test or lint suite; `npm run build` is the typecheck and production build.

## Execution rules
- Never leave a command, server, or verification step hanging. Use explicit timeouts and bounded waits; do not run interactive commands or open-ended foreground servers.
- If a step stalls or times out, terminate it, inspect the output/logs, and continue with a smaller bounded check. Never wait for the user to interrupt.
- Clean up background processes and temporary test dependencies before reporting completion.
- Do not run Playwright/browser automation, create `verify.mjs`, or install `playwright-core` unless the user explicitly requests automated verification. The user manually tests each change in Wallpaper Engine.

## Commands
- `npm run dev` — sync assets, then Vite on port 5173.
- `npm run build` — `sync:assets` (prebuild) + `tsc --noEmit` + `vite build`. Must pass.
- `npm run preview` — serves `dist`; run `npm run build` first.
- `npm run sync:assets` — regenerate `public/spine/...` from `spine-model/...`.

## Assets and Spine runtime
- `spine-model/spine_hhbsd_bdmy` is the source of truth. `public/spine/...` and `dist/spine/...` are generated; never edit them by hand.
- `scripts/sync-assets.mjs` copies and rescales atlas metadata to the actual PNG dimensions. Always use sync rather than manual atlas edits.
- The `.skel` files are Spine **3.8.99 binary**. Use the vendored `src/spine/runtime/spine-webgl.js` (ESM wrapper); do not replace it with Spine 4.x or the npm runtime.
- Both layers use `premultipliedAlpha: true`. `Vector3` is `spine.webgl.Vector3`, not `spine.Vector3`.
- `参考/` is an old Wallpaper Engine 4.2 export for reference only; do not load it with the 3.8 runtime.

## Architecture
- `src/App.tsx` owns playback settings and `mode`, and hosts `useSpineStage` so the canvas/stage persist while the UI opens and closes.
- `SpineViewer` is the full-screen canvas. Show mode (`?mode=show`) closes the settings drawer and enables click-to-action.
- `PlaybackInspector` stays mounted and slides in from the right via `.is-open`; it is `inert` when closed. The bottom-right eye button toggles mode.
- The UI is intentionally chrome-less: no header/footer or card borders. Preserve the immersive full-screen layout.
- Settings persist in `localStorage` under `spine-viewer:playback:v1`. `mode=show` is the only URL state.

## Non-obvious behavior
- Only animations are `idle` and `action`. `action` is first in the skeleton, but `idle` must be played explicitly at startup.
- Spine 3.8 fires `complete` on every loop wrap. `SceneAnimationController.handleActionComplete` ignores it while `loopAction` is true; removing that guard makes a looping Action snap back to idle.
- TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`; unused code fails `npm run build`.
- Headless WebGL checks only when explicitly requested: Edge with `--use-angle=swiftshader --enable-unsafe-swiftshader`; install `playwright-core` temporarily with `npm i --no-save` and run `npm prune` afterward. Use port 5173; 4173 is blocked in this Windows environment.
