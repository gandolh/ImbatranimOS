/** The skip the user asked for, on the dedicated buttons. */
export const SKIP_SECONDS = 5

/** Arrow-key skip, and the shifted (coarse) variant — VLC's own tiering. */
export const ARROW_SKIP_SECONDS = 10
export const COARSE_SKIP_SECONDS = 60

/** Volume step for the arrow keys — VLC's own 5%. */
export const VOLUME_STEP = 0.05

export type Loudness = { volume: number; muted: boolean }

/**
 * What the media element plays at: the player's own volume times the OS
 * volume from the tray, and silent when either is muted. The player's own
 * setting is kept apart and saved as it is; only the element gets the product.
 */
export function elementLoudness(player: Loudness, os: Loudness): Loudness {
  const volume = Math.min(1, Math.max(0, player.volume * os.volume))
  return { volume, muted: player.muted || os.muted }
}

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const

/**
 * Clamp a seek target into the playable range.
 *
 * `duration` is NaN until metadata loads and Infinity for a live stream; both
 * must be treated as "cannot seek" rather than producing a NaN currentTime,
 * which silently wedges the element.
 */
export function clampSeek(target: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(target)) return null
  return Math.min(duration, Math.max(0, target))
}

/** Read a media element's buffered ranges as plain pairs. */
export function bufferedRanges(el: { buffered: TimeRanges }): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < el.buffered.length; i++) {
    out.push([el.buffered.start(i), el.buffered.end(i)])
  }
  return out
}
