import { useEffect, useRef } from "react";

/**
 * A poll that only feeds its own window stops while the window is hidden (minimized, or on another
 * workspace; it stays mounted under `display: none`, where the browser keeps timers running). Its
 * `refetchInterval` returns false while `visible` is false; this hook does the other half: when the window
 * shows again with the poll on, it refetches once at once, so what shows is fresh rather than up to one
 * interval old.
 */
export function useRefetchOnShow(visible: boolean, polling: boolean, refetch: () => unknown): void {
  const wasHidden = useRef(!visible);
  useEffect(() => {
    if (!visible) {
      wasHidden.current = true;
      return;
    }
    if (!wasHidden.current) return;
    wasHidden.current = false;
    if (polling) void refetch();
  }, [visible, polling, refetch]);
}
