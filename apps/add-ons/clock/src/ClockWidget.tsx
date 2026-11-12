import { useNow } from "./useNow";

/**
 * The desktop clock widget: time at a glance, hosted by core's
 * widget layer. Content only — the frame, drag and removal are the host's.
 */
export function ClockWidget() {
  const now = useNow(1000);
  const d = new Date(now);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-2">
      <span className="text-on-surface text-display-sm font-mono leading-none tabular-nums">
        {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="font-ui text-on-surface-variant text-tiny">
        {d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </span>
    </div>
  );
}
