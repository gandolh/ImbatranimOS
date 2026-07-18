import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'
import type { NotificationLevel } from '../../store/notificationStore'

type LevelIconProps = { level: NotificationLevel; size?: number; className?: string }

/**
 * Renders the icon for a level via a static switch (not a dynamic `<Icon/>`
 * local) so the react-hooks static-components rule stays happy.
 */
export function LevelIcon({ level, size = 16, className }: LevelIconProps) {
  switch (level) {
    case 'success':
      return <CheckCircle2 size={size} strokeWidth={2} className={className} />
    case 'warning':
      return <AlertTriangle size={size} strokeWidth={2} className={className} />
    case 'error':
      return <AlertCircle size={size} strokeWidth={2} className={className} />
    default:
      return <Info size={size} strokeWidth={2} className={className} />
  }
}
