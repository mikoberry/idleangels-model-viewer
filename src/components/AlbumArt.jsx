import { useEffect, useState } from 'react'
import { getWallpaperMedia, isWallpaperMediaAvailable } from '../wallpaperMedia.js'

// How often to re-read the bridge. The engine pushes updates rather than
// emitting events the app can subscribe to, so a cheap poll keeps the card in
// sync without wiring a second event system.
const POLL_MS = 1000

export default function AlbumArt({
  visible,
  corner = 'bottom-right',
  size = 18,
  offsetX = 0,
  offsetY = 0,
  language,
  t,
}) {
  const [media, setMedia] = useState(() => getWallpaperMedia())
  const [available] = useState(() => isWallpaperMediaAvailable())

  useEffect(() => {
    if (!visible) return undefined

    const update = () => setMedia(getWallpaperMedia())
    update()

    const interval = window.setInterval(update, POLL_MS)
    return () => window.clearInterval(interval)
  }, [visible])

  if (!visible) return null

  // Anchor the card to the chosen corner. The offsets use the same 0..100
  // percentage range as every other widget position, measured inward from that
  // corner, so 0 sits flush and 100 reaches the opposite edge.
  const anchorStyle = {
    '--album-size': `${size}vh`,
    '--album-offset-x': `${offsetX}%`,
    '--album-offset-y': `${offsetY}%`,
  }

  if (!available) {
    return (
      <div
        className={`album-art album-art--empty album-art--${corner}`}
        style={anchorStyle}
        role="status"
      >
        <div className="album-art__placeholder" aria-hidden="true" />
        <div className="album-art__meta">
          <p className="album-art__title">{t('albumArt.unavailable')}</p>
        </div>
      </div>
    )
  }

  if (!media) {
    return (
      <div
        className={`album-art album-art--empty album-art--${corner}`}
        style={anchorStyle}
        role="status"
      >
        <div className="album-art__placeholder" aria-hidden="true" />
        <div className="album-art__meta">
          <p className="album-art__title">{t('albumArt.idle')}</p>
          <p className="album-art__artist">{t('albumArt.idleHint')}</p>
        </div>
      </div>
    )
  }

  const paused = media.playback === 'paused'

  return (
    <div
      className={`album-art album-art--${corner}${paused ? ' is-paused' : ''}`}
      style={anchorStyle}
      role="group"
      aria-label={t('albumArt.label')}
      lang={language}
    >
      <img
        className="album-art__cover"
        src={media.thumbnail}
        alt={t('albumArt.coverAlt', { title: media.title || media.albumTitle })}
        draggable="false"
      />
      <div className="album-art__meta">
        <p className="album-art__title" title={media.title}>
          {media.title || t('albumArt.unknownTitle')}
        </p>
        <p className="album-art__artist" title={media.artist}>
          {media.artist || t('albumArt.unknownArtist')}
        </p>
        {media.albumTitle && media.albumTitle !== media.title && (
          <p className="album-art__album" title={media.albumTitle}>
            {media.albumTitle}
          </p>
        )}
      </div>
    </div>
  )
}
