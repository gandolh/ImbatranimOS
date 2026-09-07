import { Button } from '../../shared/components/ui'
import { AuthShell } from './AuthShell'
import { wardAccountUrl, wardLoginUrl } from './api/authApi'
import { useAuthStore } from './store/authStore'

/**
 * The three pre-desktop states, all rendered in the same panel.
 *
 * None of them is a form. imbatranimOS has no password to take, so every way
 * forward from here is a navigation to Ward — and that is the visible shape of
 * the cutover.
 */

/**
 * The screen cover. **This is a privacy screen, not a lock**, and the copy says
 * so rather than implying otherwise.
 *
 * Before Ward, dismissing this re-proved the local password. There is no local
 * password now, and re-proving Ward's would mean navigating away — which tears
 * down the desktop and destroys the exact property the cover exists to protect
 * (a live terminal, unsaved buffers, open windows). So the cover obscures the
 * screen and dismissing it asks only that the Ward session is still live.
 *
 * Useful — walking away from a shared room and coming back to a live shell is
 * the real case — but it is not security, and calling it "Locked" would be a
 * claim this app can no longer honour.
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
        {/* Signing out really does end the session, estate-wide — which is why
            it is a link away from here and not a button beside "Uncover". */}
        <a
          className="font-content text-on-surface-variant text-center text-[11px] underline"
          href={wardAccountUrl()}
        >
          Sign out instead
        </a>
      </div>
    </AuthShell>
  )
}

/** Nobody is signed in. The only way forward is Ward. */
export function SignedOutScreen() {
  return (
    <AuthShell
      title="Sign in"
      subtitle="This machine uses the estate's single sign-in. You will come back here afterwards."
    >
      <Button
        onClick={() => {
          window.location.assign(wardLoginUrl())
        }}
      >
        Continue to sign in
      </Button>
    </AuthShell>
  )
}

/**
 * The backend could not reach Ward.
 *
 * Deliberately **not** a "Sign in" button: the way in is the service that is
 * not answering, so offering one sends somebody into a loop that reads as a
 * rejected password. Retrying the probe is the only honest action.
 */
export function IdentityUnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <AuthShell
      title="Sign-in unavailable"
      subtitle="The identity service is not answering, so this machine cannot tell who you are. Nothing is wrong with your account."
    >
      <Button onClick={onRetry}>Try again</Button>
    </AuthShell>
  )
}
