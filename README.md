**English** | [简体中文](README.zh-CN.md)

# Spine 3.8 WebGL Viewer

> Live demo: <https://mikoberry.github.io/idleangels-model-viewer/>

> **AI-assisted development and disclaimer**
>
> This project's code, documentation, UI copy, and translations are primarily produced with AI assistance. AI-generated content may contain errors, omissions, or inaccurate wording; it does not represent any official position and is not professional advice.
>
> This project is not affiliated with IdleAngels or its developers or publishers. Character models, images, Spine assets, and other materials belong to their respective rights holders and are used for learning, research, and personal display only. No commercial license is provided. If you are a rights holder and want content removed, please contact us.
>
> Issues and corrections are welcome, including translation fixes.

A full-screen Spine 3.8 WebGL viewer built with **Vite + React 18 (JSX)**. The local model library contains **128 models** with `angel`, `bg`, and `action`; the GitHub Pages build ships **51 representative models**.

The canvas stays mounted while the settings drawer opens and closes. In a normal browser the drawer starts open; inside Wallpaper Engine it starts closed. The drawer contains a searchable model picker. There is no edit/show mode and no URL state.

## Online version

```text
https://mikoberry.github.io/idleangels-model-viewer/
```

The online build is deployed with GitHub Pages. It reads [deploy-models.json](deploy-models.json) and publishes 51 models, about 294 MB.

You can:

- Search by directory name, pinyin initials, or model filename and switch models
- Adjust scale, position, and page background color
- Click the canvas to trigger `action`
- Click **Record current view** to store the current model view in the browser
- Click **Copy all views** to export every recorded model as JSON for `model-presets.json`

Unrecorded changes are not kept after a refresh. Recorded model views are restored from `localStorage`. Wallpaper Engine uses the full local library and starts with the drawer closed.

## Features

- Spine 3.8.99 binary skeleton loading and WebGL rendering
- Searchable multi-model picker
- `idle` / `action` playback; `action` returns to `idle` when finished
- Click-to-action when the drawer is closed and the toggle is on
- Scale 50%–500% with slider, number input, and ±1% steps
- Horizontal/vertical position from -100% to 100%
- Page background color with presets, color picker, and `#RRGGBB` input
- Per-model view recording and copy-all export
- UI in Chinese, English, Japanese, and Korean; defaults to the browser language and can be switched in the drawer
- First-visit eye-button hint
- Debug panel toggle inside the settings drawer
- Responsive full-screen layout; the drawer fills the width on mobile
- Single-model and all-model packaging

Not included yet: automatic global settings persistence, selected-model persistence, edit/show mode, `?mode=show`, speed, pause, looping action, autoplay, animation bounds, and a full-screen loading/error overlay.

## Quick start

Requires Node.js 18+. Verified with Node.js 20.18.1 and npm 10.8.2.

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

If port 5173 is busy, Vite chooses the next available port.

To prepare all 128 models and start the dev server:

```bash
npm run dev:all
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite for the currently prepared model package |
| `npm run dev:all` | Prepare all models when needed, then start Vite |
| `npm run build` | Build the current `public/spine/models` package into `dist/` |
| `npm run build:we` | Build and replace the configured Wallpaper Engine directory |
| `npm run models:import` | Scan `MODEL_SOURCE_DIR` and import eligible models into `model-library/` |
| `npm run models:use -- <id>[,<id>...]` | Prepare selected models for dev or a single-model build |
| `npm run package:model -- <id>` | Prepare one model, build, and deploy to Wallpaper Engine |
| `npm run package:all` | Prepare every eligible model, build, and deploy to Wallpaper Engine |
| `npm run preview` | Preview `dist/` on Vite's preview port |

Prepare the deployment subset without building:

```bash
node scripts/prepare-models.mjs --file deploy-models.json
```

## Model library

The source library is committed under `model-library/`; generated model assets live in `public/spine/models/` and are ignored by Git.

Current scope: models with `angel` + `bg`, one `.skel` / `.atlas` / `.png` per layer, and both `idle` and `action`. The source directory contains 377 entries; 128 match these rules. NPC-only models, single-layer models, missing textures, and unusual directory layouts are skipped.

Model recommendations are stored in [model-presets.json](model-presets.json):

```json
{
  "spine_hhbsd_bdmy": {
    "scale": 2.4,
    "positionX": -30,
    "positionY": -27,
    "backgroundColor": "#06070d"
  }
}
```

If a model has no preset, the fallback is `100 / 0 / 0` with a black background. A model's view is recorded only when **Record current view** is clicked; switching models does not record automatically.

## Project structure

```text
.
├─ model-library/                 # Committed source model library
├─ model-presets.json             # Per-model recommended views
├─ deploy-models.json             # GitHub Pages / Vercel deployment subset
├─ public/
│  ├─ project.json
│  └─ spine/models/               # Generated models, ignored by Git
├─ scripts/
│  ├─ import-models.mjs
│  ├─ prepare-models.mjs
│  ├─ package-models.mjs
│  ├─ copy-to-we.mjs
│  └─ model-utils.mjs
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ SettingsDrawer.jsx
│  ├─ i18n.js
│  ├─ spineStage.js
│  ├─ spine-webgl.js
│  └─ styles.css
├─ .github/workflows/deploy-pages.yml
├─ vercel.json
└─ docs/
```

## GitHub Pages

The workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) runs on pushes to `main` or manually:

1. `npm ci`
2. `node scripts/prepare-models.mjs --file deploy-models.json`
3. `npm run build`
4. Upload `dist/` and deploy to GitHub Pages

Set the repository Pages source to **GitHub Actions**:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

GitHub Pages limits the published site to 1 GB and has a soft bandwidth limit of 100 GB/month. The current deployment subset is about 294 MB.

## Documentation

The detailed documentation is currently written in Chinese:

- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture.md)
- [Spine 3.8 and assets](docs/spine-runtime-and-assets.md)
- [Development and verification](docs/development.md)
- [Settings reference](docs/settings-reference.md)

## Notes

- Spine `.skel` files must remain Spine 3.8.99 binary; use the vendored `src/spine-webgl.js` runtime.
- Both layers use `premultipliedAlpha: true`.
- Canvas rendering currently uses CSS pixels without `devicePixelRatio` scaling, so high-DPI output may look soft.
- `dist/` and `public/spine/models/` are generated and ignored by Git.
- `npm run build` does not perform type checking; this is a JavaScript project.

[简体中文版](README.zh-CN.md)
