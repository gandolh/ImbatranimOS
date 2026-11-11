import { Component, type ErrorInfo, type ReactNode } from "react";
import { api } from "../../../lib/axios";
import { notify } from "../../store/notificationStore";

interface Props {
  appId: string;
  appName: string;
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

/**
 * Containment for one add-on's desktop layer.
 *
 * A layer is mounted straight into the desktop, outside any window, so without
 * this an uncaught `throw` in it unmounts the whole tree and the page goes
 * black. Core can't vet an add-on's code, so each layer gets its own boundary:
 * a crashed layer draws nothing, and the icons, the wallpaper, the taskbar and
 * the other layers stay.
 *
 * Once caught, the layer stays hidden until the boundary mounts again: a
 * reload, or the add-on turned off and on (the desktop keys the boundary by
 * app id). There is no retry, because rendering the same layer again in the
 * same state usually throws again.
 *
 * The notice goes out once per crash. The boundary renders nothing after a
 * catch, so the layer can't throw again here, and `reported` covers a second
 * `componentDidCatch` for the same crash all the same.
 */
export class DesktopLayerBoundary extends Component<Props, State> {
  state: State = { crashed: false };
  private reported = false;

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const { appId, appName } = this.props;
    if (!this.reported) {
      this.reported = true;
      notify({
        title: `${appName} stopped working on the desktop.`,
        body: error.message || undefined,
        level: "error",
        appId,
      });
      // Into the system log too, as a window's crash is. Fire-and-forget:
      // failing to record a crash must not become an error of its own.
      void api
        .post("/logs/client-error", {
          appId,
          message: `Desktop layer: ${error.message || "stopped unexpectedly"}`.slice(0, 300),
        })
        .catch(() => undefined);
    }
    console.error(`[${appId}] desktop layer crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}
