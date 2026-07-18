/**
 * Human-readable message for a native `HTMLMediaElement` error. Every branch
 * (including a missing `error`) returns a string — the element's `error`
 * event surfaces cleanly as UI copy, never a crash.
 */
export function describeMediaError(error: MediaError | null): string {
  if (!error) return 'This file could not be played.'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was aborted.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'A network error interrupted playback.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'This file is corrupt or uses an encoding this browser can’t decode.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This browser can’t play this file format.'
    default:
      return 'This file could not be played.'
  }
}
