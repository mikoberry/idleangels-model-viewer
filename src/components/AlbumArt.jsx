import { useEffect, useState } from 'react'
import { getWallpaperMedia, isWallpaperMediaAvailable } from '../utils/wallpaperMedia.js'
import MiniSpectrum from './MiniSpectrum.jsx'

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
  spectrumColor,
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

  // Row layout: cover on the left, then a column with the track metadata on top
  // and a small spectrum underneath. Every state renders that same shell so the
  // card keeps one rectangular footprint instead of jumping as data arrives.
  const shell = ({ cover, meta, spectrum, paused = false }) => (
    <div
      className={`album-art album-art--${corner}${paused ? ' is-paused' : ''}`}
      style={anchorStyle}
      role={meta ? 'group' : 'status'}
      aria-label={meta ? t('albumArt.label') : undefined}
      lang={language}
    >
      {cover}
      <div className="album-art__body">
        <div className="album-art__meta">{meta}</div>
        {spectrum}
      </div>
    </div>
  )

  const placeholder = <div className="album-art__placeholder" aria-hidden="true" />

  if (!available) {
    return shell({
      cover: placeholder,
      meta: <p className="album-art__title">{t('albumArt.unavailable')}</p>,
      spectrum: null,
    })
  }

  if (!media) {
    return shell({
      cover: placeholder,
      meta: (
        <>
          <p className="album-art__title">{t('albumArt.idle')}</p>
          <p className="album-art__artist">{t('albumArt.idleHint')}</p>
        </>
      ),
      spectrum: null,
    })
  }

  return shell({
    paused: media.playback === 'paused',
    cover: (
      // The wrapper owns the circular mask and the spin; the image is just the
      // artwork inside it.
      <div className="album-art__disc">
        <img
          className="album-art__cover"
          src={media.thumbnail}
          alt={t('albumArt.coverAlt', { title: media.title || media.albumTitle })}
          draggable="false"
        />
      </div>
    ),
    meta: (
      <>
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
      </>
    ),
    spectrum: <MiniSpectrum color={spectrumColor} />,
  })
}
