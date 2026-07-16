import { type SnapRegion, computeSnapGeometry, TOPBAR_HEIGHT } from '../../store/windowStore'
import { cn } from '../../../lib/cn'

type SnapOverlayProps = {
  region: SnapRegion
}

/**
 * Translucent preview that shows where the window will snap.
 * Rendered at the document level (fixed), z-index below active window chrome.
 */
export function SnapOverlay({ region }: SnapOverlayProps) {
  const { position, size } = computeSnapGeometry(region)

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 9998,
        pointerEvents: 'none',
      }}
      className={cn(
        'border-2 border-primary',
        'bg-primary/10',
      )}
    />
  )
}

export { TOPBAR_HEIGHT }
