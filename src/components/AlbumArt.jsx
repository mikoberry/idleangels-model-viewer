import { useEffect, useState } from 'react'
import { getWallpaperMedia, isWallpaperMediaAvailable } from '../utils/wallpaperMedia.js'
import MiniSpectrum from './MiniSpectrum.jsx'
import './AlbumArt.css'

// How often to re-read the bridge. The engine pushes updates rather than
// emitting events the app can subscribe to, so a cheap poll keeps the card in
// sync without wiring a second event system.
const POLL_MS = 1000

// Every layout draws from the same data, so the shell only varies in how it
// arranges the cover, the metadata and the inline spectrum.
const STYLES = ['classic', 'glass', 'vinyl', 'minimal', 'bar', 'wall']

function AlbumCover({ media, t, variant }) {
  if (!media?.thumbnail) {
    return <div className={`album-art__placeholder album-art__placeholder--${variant}`} aria-hidden="true" />
  }
  return (
    <img
      className={`album-art__cover album-art__cover--${variant}`}
      src={media.thumbnail}
      alt={t('albumArt.coverAlt', { title: media.title || media.albumTitle })}
      draggable="false"
    />
  )
}

// The metadata block. `compact` drops the album line so the tighter layouts
// (bar, wall) keep a single readable line per field.
function Meta({ media, t, placeholder, compact = false }) {
  if (!media) return placeholder
  return (
    <>
      <p className="album-art__title" title={media.title}>
        {media.title || t('albumArt.unknownTitle')}
      </p>
      <p className="album-art__artist" title={media.artist}>
        {media.artist || t('albumArt.unknownArtist')}
      </p>
      {!compact && media.albumTitle && media.albumTitle !== media.title && (
        <p className="album-art__album" title={media.albumTitle}>
          {media.albumTitle}
        </p>
      )}
    </>
  )
}

export default function AlbumArt({
  visible,
  style = 'classic',
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

  const variant = STYLES.includes(style) ? style : 'classic'
  const paused = media?.playback === 'paused'

  // Anchor the card to the chosen corner. The offsets use the same 0..100
  // percentage range as every other widget position, measured inward from that
  // corner, so 0 sits flush and 100 reaches the opposite edge.
  const anchorStyle = {
    '--album-size': `${size}vh`,
    '--album-offset-x': `${offsetX}%`,
    '--album-offset-y': `${offsetY}%`,
  }

  // The cover's dominant colour tints the glass card's glow and the bar's edge.
  if (media?.primaryColor) {
    anchorStyle['--album-tint'] = media.primaryColor
  }

  // One root for every layout: they differ only by the `--style` modifier, so
  // corner anchoring and the size/offset variables stay identical.
  const rootClass = [
    'album-art',
    `album-art--${corner}`,
    `album-art--style-${variant}`,
    paused ? 'is-paused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Placeholder text for the idle / unsupported states.
  const placeholder = !available ? (
    <p className="album-art__title">{t('albumArt.unavailable')}</p>
  ) : (
    <>
      <p className="album-art__title">{t('albumArt.idle')}</p>
      <p className="album-art__artist">{t('albumArt.idleHint')}</p>
    </>
  )

  const cover =
    available && media ? (
      <AlbumCover media={media} t={t} variant={variant} />
    ) : (
      <div className={`album-art__placeholder album-art__placeholder--${variant}`} aria-hidden="true" />
    )

  const meta = (
    <Meta
      media={available ? media : null}
      t={t}
      placeholder={placeholder}
      compact={variant === 'bar' || variant === 'minimal' || variant === 'wall'}
    />
  )

  const spectrum = available && media ? (
    <MiniSpectrum active={!paused} color={spectrumColor} />
  ) : null

  // Each layout body. Keeping them together makes the shared props obvious and
  // lets the CSS cover all six from one file.
  let body
  switch (variant) {
    case 'vinyl':
      // One big record. The sleeve notes and spectrum live on the label, so the
      // whole widget is a single circle that spins as one piece.
      body = (
        <div className="album-art__vinyl">
          <div className="album-art__vinyl-cover">
            <AlbumCover media={available ? media : null} t={t} variant="vinyl" />
          </div>
          <div className="album-art__vinyl-label">
            <div className="album-art__meta">{meta}</div>
            <div className="album-art__vinyl-spectrum">{spectrum}</div>
          </div>
        </div>
      )
      break

    case 'minimal':
      // Text-first: a small square thumbnail sits above oversized type.
      body = (
        <div className="album-art__body album-art__body--minimal">
          <div className="album-art__thumb">{cover}</div>
          <div className="album-art__meta">{meta}</div>
          {spectrum}
        </div>
      )
      break

    case 'bar':
      // One horizontal strip: thumbnail, title, artist, then a wide spectrum.
      body = (
        <div className="album-art__body album-art__body--bar">
          <div className="album-art__thumb">{cover}</div>
          <div className="album-art__meta">{meta}</div>
          <div className="album-art__bar-spectrum">{spectrum}</div>
        </div>
      )
      break

    case 'wall':
      // A shelf of covers with the current one enlarged and highlighted.
      body = (
        <div className="album-art__wall">
          <div className="album-art__wall-card is-current">
            <div className="album-art__wall-art">{cover}</div>
            <div className="album-art__meta">{meta}</div>
            <div className="album-art__wall-spectrum">{spectrum}</div>
          </div>
          <div className="album-art__wall-card" aria-hidden="true" />
          <div className="album-art__wall-card" aria-hidden="true" />
          <div className="album-art__wall-card" aria-hidden="true" />
        </div>
      )
      break

    case 'classic':
    case 'glass':
    default:
      // The chrome-less card: circular cover, metadata column, spectrum behind
      // it. `classic` is that original look untouched; `glass` keeps the same
      // arrangement and adds the frosted panel (see AlbumArt.css).
      body = (
        <>
          <div className="album-art__disc">{cover}</div>
          <div className="album-art__body">
            <div className="album-art__meta">{meta}</div>
            {spectrum}
          </div>
        </>
      )
  }

  return (
    <div
      className={rootClass}
      style={anchorStyle}
      role={available && media ? 'group' : 'status'}
      aria-label={available && media ? t('albumArt.label') : undefined}
      lang={language}
    >
      {body}
    </div>
  )
}
