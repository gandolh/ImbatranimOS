import { Component, Suspense, lazy, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { notify } from "../store/notificationStore";

type BoundaryProps = { name: string; props: object; onFailure: () => void; children: ReactNode };

/** True when the two prop objects differ in any value. */
function changed(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!Object.is(left[key], right[key])) return true;
  return false;
}

/**
 * Containment for a part whose chunk did not arrive. The shell has no boundary
 * above it, so without this one a failed import would take the whole desktop
 * down. It draws nothing, says so once, and tries again when the part's props
 * change (the palette opened again) or the part mounts again (Start opened again).
 */
class PartBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onFailure();
    notify({
      title: `${this.props.name} could not load`,
      body: "Its code did not arrive. Try again, or reload the page if the OS was just updated.",
      level: "error",
    });
    // eslint-disable-next-line no-console -- no client logger yet (2026-11-25)
    console.error(`[${this.props.name}] did not load`, error, info.componentStack);
  }

  override componentDidUpdate(prev: BoundaryProps): void {
    if (this.state.failed && changed(prev.props, this.props.props)) this.setState({ failed: false });
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * A part of the shell kept out of the first page load: its code is a chunk of
 * its own, fetched the first time the part renders, or before that through
 * `preload` (the pointer reaching the button that opens it). It draws nothing
 * while the chunk is on its way, and nothing, with a notice, if it does not come.
 *
 * Unlike `React.lazy` on its own, which keeps a failure for the life of the
 * page, a part whose chunk failed asks for it again the next time it shows,
 * since the network may be back.
 */
export function lazyPart<P extends object>(
  name: string,
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> & { preload: () => void } {
  const make = () => lazy(() => load().then((part) => ({ default: part })));
  let current = make();
  // Called once the boundary has the failure, never while React retries the render that suspended,
  // so a chunk that keeps failing is asked for once per showing, not in a loop.
  const reset = () => {
    current = make();
  };

  function LazyPart(props: P) {
    const Part = current;
    return (
      <PartBoundary name={name} props={props} onFailure={reset}>
        <Suspense fallback={null}>
          <Part {...props} />
        </Suspense>
      </PartBoundary>
    );
  }
  LazyPart.displayName = `LazyPart(${name})`;
  return Object.assign(LazyPart, { preload: () => void load().catch(() => undefined) });
}
