import { Button } from '../../shared/components/ui'
import { AuthShell } from './AuthShell'
import { localSignOut } from './api/authApi'
import { LocalSetupScreen, LocalSignInScreen } from './LocalScreens'
import { useAuthStore } from './store/authStore'

/**
 * The pre-desktop and suspended states, all rendered in the same panel: the
 * screen cover, and the signed-out screen (first-run setup or sign-in).
 */

/**
 * The screen cover. **This is a privacy screen, not a lock**, and the copy says
 * so rather than implying otherwise.
 *
 * Dismissing it asks only that the session is still live. Re-proving the
 * password would be a real lock; the cover exists to keep a live terminal,
 * unsaved buffers and open windows across a walk away from the machine.
 */
export function ScreenCover({ onDismiss }: { onDismiss: () => void }) {
  const session = useAuthStore((s) => s.session)

  return (
    <AuthShell
      title="Screen covered"
      subtitle={
        session
          ? `Signed in as ${session.username}. Anyone at this machine can uncover the screen — it hides your work, it does not protect it.`
          : 'Anyone at this machine can uncover the screen — it hides your work, it does not protect it.'
      }
    >
      <div className="flex flex-col gap-2">
        <Button onClick={onDismiss}>Uncover</Button>
        {/* Signing out really does end the session, which is why it is a link
            away from here and not a button beside "Uncover". */}
        <button
          type="button"
          className="font-content text-on-surface-variant text-center text-[11px] underline"
          onClick={() => void localSignOut().finally(() => window.location.reload())}
        >
          Sign out instead
        </button>
      </div>
    </AuthShell>
  )
}

/** Nobody is signed in: the first-run setup on an unclaimed machine, else the sign-in. */
export function SignedOutScreen() {
  const identity = useAuthStore((s) => s.identity)
  return identity?.setUp === false ? (
    <LocalSetupScreen tokenRequired={identity.setupTokenRequired} />
  ) : (
    <LocalSignInScreen />
  )
}
