// Wallpaper Engine media bridge.
//
// The listeners are registered by an inline classic script in `index.html`, for
// the same reason as the audio bridge: Vite emits the app as a deferred module
// script, and the engine may have finished scanning for listeners by then.
//
// The inline handler writes a single global object:
//
//   window.__weMedia = {
//     thumbnail, primaryColor, secondaryColor, tertiaryColor,
//     textColor, highContrastColor,
//     title, artist, subTitle, albumTitle, albumArtist, genres, contentType,
//     playback,      // 'playing' | 'paused' | 'stopped' | null when unknown
//     enabled,       // whether the user enabled media integration
//     updatedAt,     // ms timestamp of the last thumbnail/property update
//   }
//
// This module only reads it, so it stays side-effect free.

// The engine only pushes updates when the track *changes*, so a cover must not
// expire on a timer: an unchanged song would disappear after a few seconds.
// Playback state decides instead - a stopped session clears the card, while a
// playing one keeps showing the art regardless of how long the track runs.
const MEDIA_KEY = '__weMedia'

function readMedia() {
  if (typeof window === 'undefined') return null
  const media = window[MEDIA_KEY]
  return media && typeof media === 'object' ? media : null
}

export function isWallpaperMediaAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof window.wallpaperRegisterMediaThumbnailListener === 'function'
  )
}

// Snapshot of the current media, or null when there is nothing to show.
export function getWallpaperMedia() {
  const media = readMedia()
  if (!media) return null
  if (!media.thumbnail) return null

  // `playback` stays null until the engine reports something, and even then it
  // is only cleared on an explicit "stopped". Treating an unknown state as
  // playing keeps the cover visible when the engine never sends playback
  // events at all, which some players do not.
  const playback = media.playback ?? null
  if (playback === 'stopped') return null

  return {
    thumbnail: media.thumbnail,
    title: media.title ?? '',
    artist: media.artist ?? '',
    albumTitle: media.albumTitle ?? '',
    primaryColor: media.primaryColor ?? '',
    textColor: media.textColor ?? '',
    playback: playback ?? 'playing',
  }
}

// Whether the user turned media integration on. When this is false no data will
// ever arrive, so the UI can explain that instead of showing an empty card.
export function isWallpaperMediaEnabled() {
  const media = readMedia()
  if (!media) return isWallpaperMediaAvailable()
  return media.enabled !== false
}
