import { Logo } from '../../shared/components/brand/Logo'

/**
 * The full-screen panel every pre-desktop state renders inside: the session
 * cover, the signed-out screen, and the "identity service is down" screen.
 *
 * Moved here verbatim from `FirstRunWizard.tsx`, which went with the local
 * password. There is no first run to wizard through any more — a machine is not
 * claimed by whoever reaches it first, because an account gets an
 * `imbatranim-os` grant from Ward's console, which is a deliberate act by an
 * operator rather than a race.
 */
// Branded ImbatranimOS lock/setup surface — B&W with the single accent.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-surface relative flex h-screen w-screen items-center justify-center"
      style={{
        backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* subtle vignette so the card reads as a lit panel */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />

      <div className="border-outline-variant bg-surface-container-low relative w-[360px] border shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        {/* accent top edge */}
        <div className="bg-primary h-[3px] w-full" />

        <div className="border-outline-variant bg-surface-container flex flex-col items-center gap-2 border-b px-6 py-6">
          <Logo size={44} className="text-on-surface" />
          <div className="text-on-surface text-[17px] font-bold tracking-tight">
            Imbatranim<span className="text-primary">OS</span>
          </div>
        </div>

        <div className="p-6">
          <header className="mb-5">
            <h1 className="font-ui text-on-surface text-base font-bold tracking-tight">{title}</h1>
            <p className="font-content text-on-surface-variant mt-1 text-[12px]">{subtitle}</p>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="font-content text-error text-[11px]">{children}</p>
}
