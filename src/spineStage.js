import { spine } from './spine-webgl.js'

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
    camera.position.set(
      centerX - viewOffsetX * width * zoom,
      centerY + viewOffsetY * height * zoom,
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

  const setView = (scale, offsetX, offsetY) => {
    if (disposed) return
    viewScale = Math.min(Math.max(Number.isFinite(scale) ? scale : 1, 0.5), 5)
    viewOffsetX = Math.min(Math.max(Number.isFinite(offsetX) ? offsetX : 0, -1), 1)
    viewOffsetY = Math.min(Math.max(Number.isFinite(offsetY) ? offsetY : 0, -1), 1)
    fitView()
  }

  let actionToken = 0
  const pendingActionLayers = new Set()

  const returnToIdle = (token) => {
    if (token !== actionToken) return

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

  const triggerAction = () => {
    if (disposed) return

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

    if (started) setCurrentAnimation(ACTION_ANIMATION)
  }

  const play = (name) => {
    if (disposed || !availableAnimations.includes(name)) return

    if (name === ACTION_ANIMATION) {
      triggerAction()
      return
    }

    actionToken += 1
    pendingActionLayers.clear()

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
  return { setView, triggerAction, play, animations: availableAnimations, dispose }
}
