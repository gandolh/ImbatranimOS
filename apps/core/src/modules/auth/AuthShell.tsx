import { Logo } from "../../shared/components/brand/Logo";

/**
 * The full-screen panel every pre-desktop state renders inside: the session
 * cover, and the setup and sign-in screens in `LocalScreens.tsx`.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // A warm ground with the dotted grid and a lit centre, the card one step
      // lighter than it (2026-11-13). On a phone the card sits 96 px from the
      // top, clear of the keyboard.
      className="bg-surface-dim relative flex h-screen w-screen items-center justify-center overflow-y-auto max-[600px]:items-start max-[600px]:pt-[96px]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 46%, var(--k-surface-container-lowest), transparent 62%), radial-gradient(var(--k-outline-variant) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 24px 24px",
      }}
    >
      <div className="border-outline-variant bg-surface-container-low rounded-window relative w-[400px] max-w-[calc(100vw-32px)] overflow-hidden border shadow-(--k-shadow-card)">
        {/* accent top edge */}
        <div className="bg-primary h-[3px] w-full" />

        <div className="border-outline-variant bg-surface-container gap-base flex flex-col items-center border-b p-[24px]">
          <Logo size={44} className="text-on-surface" />
          <div className="font-display text-on-surface text-headline font-bold">
            Imbatranim<span className="text-primary">OS</span>
          </div>
        </div>

        <div className="gap-double flex flex-col p-[24px]">
          <header>
            <h1 className="font-display text-on-surface text-headline font-bold">{title}</h1>
            <p className="font-content text-on-surface-variant text-body mt-0.5">{subtitle}</p>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="font-content text-error text-control">{children}</p>;
}
