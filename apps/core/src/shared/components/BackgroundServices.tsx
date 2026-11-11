import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { api } from "../../lib/axios";
import { WindowlessSystemProvider } from "../../system/WindowlessSystemProvider";
import { useEnabledApps } from "../registry/enabledApps";
import { notify } from "../store/notificationStore";

/**
 * Mounts every enabled app's `background` service component: a built-in
 * add-on's from its manifest, and an installed kit app's once its module has
 * loaded (`modules/marketplace/kitHooks.tsx` puts it on the app's registry
 * entry).
 *
 * Lives in the shell beside the ToastHost: present from login to tab close,
 * regardless of which windows exist. Disabling an app in Settings unmounts
 * its service on the next render — the same `useEnabledApps` filter the
 * launcher uses, so "disabled" means gone everywhere at once. Uninstalling a
 * kit app takes its entry out of the registry, and a rebuild brings a new
 * service, which mounts afresh.
 *
 * Each service gets a **windowless** system handle: notifications
 * carry the right appId and `system.schedule`/`system.http` work, while
 * `system.window` is the null-object — a background service has no window to
 * retitle or close, and shared code that tries gets a dev warning, not a crash.
 *
 * Each runs inside its own boundary: a service that throws is hidden with one
 * notification, and the desktop and the other services stay.
 */
export function BackgroundServices() {
  const apps = useEnabledApps();
  return (
    <>
      {apps.map((app) =>
        app.background ? (
          <BackgroundServiceBoundary key={`bg-${app.id}-${serialOf(app.background)}`} appId={app.id} appName={app.name}>
            <Suspense fallback={null}>
              <WindowlessSystemProvider appId={app.id}>
                <app.background />
              </WindowlessSystemProvider>
            </Suspense>
          </BackgroundServiceBoundary>
        ) : null,
      )}
    </>
  );
}

const serials = new WeakMap<object, number>();
let nextSerial = 0;

/**
 * A number per service component, for its key: a rebuilt kit app brings a
 * new component, which gets a new boundary and a new windowless copy rather
 * than the old build's, crashed or not.
 */
function serialOf(service: object): number {
  let serial = serials.get(service);
  if (serial === undefined) {
    serial = nextSerial++;
    serials.set(service, serial);
  }
  return serial;
}

/**
 * Containment for one app's background service, as `DesktopLayerBoundary` is
 * for a desktop layer. A service is mounted straight into the shell, outside
 * any window, so without this an uncaught throw in it would unmount the
 * whole desktop.
 *
 * Once caught, the service stays stopped until the boundary mounts again: a
 * reload, the app turned off and on, or a new build of a kit app. There is no
 * retry, because mounting the same service in the same state usually throws
 * again. The notice goes out once per crash.
 */
class BackgroundServiceBoundary extends Component<
  { appId: string; appName: string; children: ReactNode },
  { crashed: boolean }
> {
  override state = { crashed: false };
  private reported = false;

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { appId, appName } = this.props;
    if (!this.reported) {
      this.reported = true;
      notify({
        title: `${appName} stopped working in the background.`,
        body: error.message || undefined,
        level: "error",
        appId,
      });
      // Into the system log too, as a window's crash is. Fire-and-forget:
      // failing to record a crash must not become an error of its own.
      void api
        .post("/logs/client-error", {
          appId,
          message: `Background service: ${error.message || "stopped unexpectedly"}`.slice(0, 300),
        })
        .catch(() => undefined);
    }
    console.error(`[${appId}] background service crashed`, error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}
