import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Lock, LogOut, Power } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { APP_REGISTRY } from '../../registry/registry'
import { Logo } from '../brand/Logo'
import { useAuthStore } from '../../../modules/auth/store/authStore'
import { logout as logoutApi } from '../../../modules/auth/api/authApi'

type StartMenuProps = {
  onClose: () => void
  onOpenApp: (appId: string) => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function StartMenu({ onClose, onOpenApp, anchorRef }: StartMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  // Lock: return to the lock screen without ending the session on the client.
  function handleLock() {
    setAuthenticated(false)
    onClose()
  }

  // Log off: end the session on the backend, then re-lock.
  async function handleLogout() {
    onClose()
    try {
      await logoutApi()
    } finally {
      setAuthenticated(false)
    }
  }

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      role="menu"
      aria-label="Start menu"
      className={cn(
        'absolute bottom-full left-0 z-[9001] mb-1 flex w-[280px] flex-col',
        'border border-outline-variant bg-surface-container-low',
        'shadow-[0_-8px_32px_rgba(0,0,0,0.45)]',
      )}
    >
      {/* Brand header */}
      <div className="flex items-center gap-2.5 border-b border-outline-variant bg-surface-container px-4 py-3">
        <Logo size={26} className="text-on-surface" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-tight text-on-surface">
            Imbatranim<span className="text-primary">OS</span>
          </div>
          <div className="text-[10px] text-on-surface-variant">Signed in</div>
        </div>
      </div>

      {/* App list */}
      <div className="flex max-h-[52vh] flex-col overflow-y-auto py-1">
        {APP_REGISTRY.map((app) => {
          const Icon = app.icon
          return (
            <button
              key={app.id}
              role="menuitem"
              onClick={() => {
                onOpenApp(app.id)
                onClose()
              }}
              className={cn(
                'group flex items-center gap-3 px-4 py-1.5 text-left outline-none',
                'hover:bg-primary hover:text-on-primary',
                'focus-visible:bg-primary focus-visible:text-on-primary',
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-lowest group-hover:border-transparent group-hover:bg-white/15">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium">{app.name}</span>
                <span className="block truncate text-[10px] text-on-surface-variant group-hover:text-on-primary/80">
                  {app.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Session actions */}
      <div className="flex items-stretch border-t border-outline-variant bg-surface-container">
        <button
          role="menuitem"
          onClick={handleLock}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-medium text-on-surface outline-none hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <Lock size={14} strokeWidth={1.75} />
          Lock
        </button>
        <div className="w-px bg-outline-variant" />
        <button
          role="menuitem"
          onClick={handleLogout}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-medium text-on-surface outline-none hover:bg-error hover:text-on-error focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Log off
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-outline-variant px-4 py-1.5 text-[9px] uppercase tracking-widest text-on-surface-variant">
        <span>ImbatranimOS</span>
        <Power size={11} strokeWidth={1.75} className="opacity-60" />
      </div>
    </motion.div>
  )
}
