import { spine } from './spine-webgl.js'
import { isWallpaperPaused } from './utils/wallpaperPause.js'

const DEFAULT_ANIMATION = 'idle'
const ACTION_ANIMATION = 'action'
const EMPTY_STAGE = {
  setView: () => {},
  triggerAction: () => {},
  play: () => {},
  animations: [],
  dispose: () => {},
}

function waitForLoad(managers, isCancelled) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (isCancelled()) {
        resolve()
        return
      }

      let complete = true
      const errors = []

      for (const manager of managers) {
        if (!manager.isLoadingComplete()) complete = false

        if (manager.hasErrors()) {
          const managerErrors = manager.getErrors()
          for (const path of Object.keys(managerErrors)) {
            errors.push(`${path}: ${managerErrors[path]}`)
          }
        }
      }

      if (errors.length > 0) {
        reject(new Error(errors.join('\n')))
        return
      }

      if (complete) {
        resolve()
        return
      }

      window.setTimeout(tick, 50)
    }

    tick()
  })
}

function assetPrefix(basePath) {
  return `${basePath.replace(/\/+$/, '')}/`
}

function encodeAssetPath(file) {
  return file
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/%2B/g, '+'))
    .join('/')
}

export async function startSpineStage(
  canvas,
  {
    model,
    onStatus,
    t = (key) => key,
    isCancelled = () => false,
    onAnimationChange,
  } = {},
) {
  const report = (key, vars, isError = false) => {
    if (isCancelled()) return
    onStatus?.(key, vars, isError)
  }

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(t('stage.missingCanvas'))
  }

  if (!model?.layers?.length) {
    throw new Error(t('stage.missingModel'))
  }

  report('stage.creatingContext', { model: model.id })

  const context = new spine.webgl.ManagedWebGLRenderingContext(canvas, {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  })

  if (!context.gl) {
    throw new Error(t('stage.webglUnavailable'))
  }

  const renderer = new spine.webgl.SceneRenderer(canvas, context, true)
  renderer.camera.position.set(0, 0, 0)
  renderer.camera.update()

  report('stage.loadingAssets', { model: model.id })

  const managers = model.layers.map((layer) => {
    const manager = new spine.webgl.AssetManager(context, assetPrefix(layer.basePath))
    manager.loadBinary(encodeAssetPath(layer.skeleton))
    manager.loadTextureAtlas(encodeAssetPath(layer.atlas))
    return manager
  })

  let disposed = false
  let frameId = 0
  let layers = []

  const disposeResources = () => {
    for (const manager of managers) {
      manager.dispose?.()
    }
    for (const layer of layers) {
      layer.state.clearTracks?.()
    }
    renderer.dispose?.()
  }

  try {
    await waitForLoad(managers, isCancelled)
  } catch (error) {
    disposed = true
    disposeResources()
    throw error
  }

  if (isCancelled()) {
    disposed = true
    if (frameId) window.cancelAnimationFrame(frameId)
    disposeResources()
    return EMPTY_STAGE
  }

  try {
    layers = managers.map((manager, index) => {
      const layer = model.layers[index]
      const binary = manager.get(encodeAssetPath(layer.skeleton))
      const atlas = manager.get(encodeAssetPath(layer.atlas))

      if (!binary || !atlas) {
        throw new Error(t('stage.missingLayer', { id: layer.id }))
      }

      const attachmentLoader = new spine.AtlasAttachmentLoader(atlas)
      const skeletonData = new spine.SkeletonBinary(attachmentLoader).readSkeletonData(binary)
      const skeleton = new spine.Skeleton(skeletonData)
      const stateData = new spine.AnimationStateData(skeletonData)
      const state = new spine.AnimationState(stateData)

      stateData.defaultMix = 0.2
      if (
        skeletonData.findAnimation(DEFAULT_ANIMATION) &&
        skeletonData.findAnimation(ACTION_ANIMATION)
      ) {
        stateData.setMix(ACTION_ANIMATION, ACTION_ANIMATION, 0)
        stateData.setMix(DEFAULT_ANIMATION, ACTION_ANIMATION, 0.1)
        stateData.setMix(ACTION_ANIMATION, DEFAULT_ANIMATION, 0.2)
      }
      skeleton.setToSetupPose()
      skeleton.updateWorldTransform()

      const animation =
        skeletonData.findAnimation(DEFAULT_ANIMATION) ?? skeletonData.animations[0]
      if (animation) state.setAnimation(0, animation.name, true)

      state.update(0)
      state.apply(skeleton)
      skeleton.updateWorldTransform()

      return { id: layer.id, skeleton, state }
    })
  } catch (error) {
    disposed = true
    disposeResources()
    throw error
  }

  const sceneAnimations = [DEFAULT_ANIMATION, ACTION_ANIMATION].filter((name) =>
    layers.some((layer) => layer.skeleton.data.findAnimation(name)),
  )
  const knownAnimations = new Set(sceneAnimations)
  const extraAnimations = layers
    .flatMap((layer) => layer.skeleton.data.animations.map((animation) => animation.name))
    .filter((name) => !knownAnimations.has(name))
  const availableAnimations = [...sceneAnimations, ...new Set(extraAnimations)]

  const setCurrentAnimation = (name) => {
    canvas.dataset.animation = name
    if (!isCancelled()) onAnimationChange?.(name)
  }

  setCurrentAnimation(
    layers[0]?.state.getCurrent(0)?.animation?.name ?? DEFAULT_ANIMATION,
  )

  const offset = new spine.Vector2()
  const size = new spine.Vector2()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const layer of layers) {
    layer.skeleton.getBounds(offset, size)
    if (
      !Number.isFinite(offset.x) ||
      !Number.isFinite(offset.y) ||
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y)
    ) {
      continue
    }

    minX = Math.min(minX, offset.x)
    minY = Math.min(minY, offset.y)
    maxX = Math.max(maxX, offset.x + size.x)
    maxY = Math.max(maxY, offset.y + size.y)
  }

  if (!Number.isFinite(minX)) {
    minX = -100
    minY = -100
    maxX = 100
    maxY = 100
  }

  const bounds = { minX, minY, maxX, maxY }
  let viewScale = 1
  let viewOffsetX = 0
  let viewOffsetY = 0
  // Parallax offset, in fractions of the viewport. Kept separate from the view
  // offsets above so pointer movement never overwrites the user's saved
  // position: the camera sits at view + parallax.
  let parallaxX = 0
  let parallaxY = 0

  const fitView = () => {
    const width = canvas.width
    const height = canvas.height
    if (width <= 1 || height <= 1) return

    const padding = 0.06
    const worldWidth = Math.max(bounds.maxX - bounds.minX, 1e-3)
    const worldHeight = Math.max(bounds.maxY - bounds.minY, 1e-3)
    const availableWidth = Math.max(width * (1 - padding * 2), 1)
    const availableHeight = Math.max(height * (1 - padding * 2), 1)
    const baseZoom = Math.max(worldWidth / availableWidth, worldHeight / availableHeight)
    const zoom = baseZoom / viewScale
    const camera = renderer.camera
    const centerX = (bounds.minX + bounds.maxX) * 0.5
    const centerY = (bounds.minY + bounds.maxY) * 0.5

    camera.zoom = zoom
    // The view offset keeps its original sign convention (positive positionY
    // moves the camera down, so the artwork appears to rise) because saved views
    // in model-presets.json depend on it.
    //
    // The parallax term uses the same expressions as the view offset, so one
    // amount drives both axes identically: a positive amount follows the
    // pointer, a negative one leans away. The per-axis directions are documented
    // on each term below; they were established by projecting world points
    // through this runtime's lookAt + ortho matrices.
    camera.position.set(
      // x is subtracted from the centre, so a positive parallaxX lowers camera.x
      // and the artwork slides right.
      centerX - viewOffsetX * width * zoom - parallaxX * width * zoom,
      // y is added, so a positive parallaxY raises camera.y and the artwork
      // slides down. (Direction confirmed by projecting world points through this
      // runtime's lookAt + ortho matrices: camera.x up => artwork left,
      // camera.y up => artwork down.)
      centerY + viewOffsetY * height * zoom + parallaxY * height * zoom,
      0,
    )
    camera.update()

    canvas.dataset.cameraZoom = zoom.toFixed(4)
    canvas.dataset.cameraX = camera.position.x.toFixed(2)
    canvas.dataset.cameraY = camera.position.y.toFixed(2)
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))

    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    context.gl.viewport(0, 0, width, height)
    renderer.camera.setViewport(width, height)
    fitView()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (frameId) window.cancelAnimationFrame(frameId)
    window.removeEventListener('resize', resize)
    disposeResources()
  }

  // Pointer-driven parallax. `x` and `y` are normalised to [-1, 1] across the
  // viewport, where 0 is the centre; `amount` scales how far the character may
  // drift, as a fraction of the viewport. Re-fits the camera so the offset is
  // visible immediately rather than on the next resize.
  const setParallax = (x, y, amount = 0) => {
    if (disposed) return
    // Negative amounts are allowed: they reverse the drift, so the character
    // leans away from the pointer instead of following it.
    const limit = Math.min(Math.max(Number.isFinite(amount) ? amount : 0, -0.5), 0.5)
    const nx = Math.min(Math.max(Number.isFinite(x) ? x : 0, -1), 1)
    const ny = Math.min(Math.max(Number.isFinite(y) ? y : 0, -1), 1)

    // Verified by projecting world points through this runtime's own matrices
    // (lookAt + ortho), rather than reasoning about signs:
    //   camera.x up  => artwork moves LEFT on screen
    //   camera.y up  => artwork moves DOWN on screen
    //   camera.x = centre - offset (fitView)  => +parallaxX lowers camera.x,
    //                                            so the artwork moves RIGHT
    //   camera.y = centre + offset (fitView)  => +parallaxY raises camera.y,
    //                                            so the artwork moves DOWN
    // Following the pointer therefore needs: +nx horizontally (pointer right =>
    // artwork right) and +ny vertically (pointer low => ny > 0 => artwork down).
    //
    // `limit` appears exactly once per axis, so a negative amount reverses both
    // axes together.
    parallaxX = nx * limit
    parallaxY = ny * limit
    fitView()
  }

  const setView = (scale, offsetX, offsetY) => {
    if (disposed) return
    viewScale = Math.min(Math.max(Number.isFinite(scale) ? scale : 1, 0.5), 5)
    viewOffsetX = Math.min(Math.max(Number.isFinite(offsetX) ? offsetX : 0, -1), 1)
    viewOffsetY = Math.min(Math.max(Number.isFinite(offsetY) ? offsetY : 0, -1), 1)
    fitView()
  }

  let actionToken = 0
  const pendingActionLayers = new Set()
  // True from the moment an action starts until every layer that has one has
  // finished and the stage is back on idle. Clicks arriving inside that window
  // are dropped rather than restarting the action, so a fast double-click
  // cannot cut the move short or stack a second playback on top of it.
  let actionInFlight = false

  const returnToIdle = (token) => {
    if (token !== actionToken) return

    actionInFlight = false

    for (const layer of layers) {
      if (layer.skeleton.data.findAnimation(DEFAULT_ANIMATION)) {
        layer.state.setAnimation(0, DEFAULT_ANIMATION, true)
      }
    }

    setCurrentAnimation(DEFAULT_ANIMATION)
  }

  const handleActionComplete = (layerId, token) => {
    if (token !== actionToken) return
    pendingActionLayers.delete(layerId)
    if (pendingActionLayers.size > 0) return
    returnToIdle(token)
  }

  // Starts the action on every layer that has it. `force` restarts an action
  // that is already running; without it a request arriving while one is in
  // flight is ignored. Clicking the canvas is non-forced, so fast repeated
  // clicks wait for the previous action to finish; picking `action` in the
  // drawer is forced, because that is an explicit request to replay it.
  const startAction = (force) => {
    if (disposed) return

    if (actionInFlight && !force) return

    actionToken += 1
    const token = actionToken
    pendingActionLayers.clear()
    let started = false

    for (const layer of layers) {
      if (!layer.skeleton.data.findAnimation(ACTION_ANIMATION)) continue

      const current = layer.state.getCurrent(0)?.animation?.name ?? null
      const entry = layer.state.setAnimation(0, ACTION_ANIMATION, false)
      if (!entry) continue

      if (current === ACTION_ANIMATION) entry.mixDuration = 0
      entry.listener = {
        complete: () => handleActionComplete(layer.id, token),
      }

      pendingActionLayers.add(layer.id)
      started = true
    }

    if (started) {
      actionInFlight = true
      setCurrentAnimation(ACTION_ANIMATION)
    }
  }

  const triggerAction = () => startAction(false)

  const play = (name) => {
    if (disposed || !availableAnimations.includes(name)) return

    if (name === ACTION_ANIMATION) {
      startAction(true)
      return
    }

    actionToken += 1
    pendingActionLayers.clear()
    // An explicit switch away from the action cancels it, so the in-flight
    // guard has to be released too; otherwise the stale `complete` callbacks are
    // ignored by the token check and clicks would stay blocked forever.
    actionInFlight = false

    let played = false
    for (const layer of layers) {
      if (!layer.skeleton.data.findAnimation(name)) continue
      layer.state.setAnimation(0, name, true)
      played = true
    }

    if (played) setCurrentAnimation(name)
  }

  window.addEventListener('resize', resize)
  resize()
  if (isCancelled()) {
    dispose()
    return EMPTY_STAGE
  }

  report('stage.loaded', {
    model: model.id,
    layers: layers.map((layer) => layer.id).join(' + '),
  })

  let lastTime = performance.now()

  const frame = (now) => {
    if (disposed) return

    // While the engine has the wallpaper paused there is nothing to draw and
    // nothing to advance, so skip the whole frame body. Keeping the rAF alive
    // means resuming is instant, and skipping the work is what actually saves
    // power.
    if (isWallpaperPaused()) {
      lastTime = now
      frameId = window.requestAnimationFrame(frame)
      return
    }

    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
    lastTime = now

    for (const layer of layers) {
      layer.state.update(delta)
      layer.state.apply(layer.skeleton)
      layer.skeleton.updateWorldTransform()
    }

    const gl = context.gl
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    renderer.begin()
    for (const layer of layers) {
      renderer.drawSkeleton(layer.skeleton, true)
    }
    renderer.end()

    frameId = window.requestAnimationFrame(frame)
  }

  frameId = window.requestAnimationFrame(frame)
  return { setView, setParallax, triggerAction, play, animations: availableAnimations, dispose }
}
