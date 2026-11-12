import { Flag, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@imbatranim/ui";
import { useClockStore } from "../clockStore";
import { useNow } from "../useNow";
import { formatStopwatch } from "../format";

export function Stopwatch() {
  const stopwatch = useClockStore((s) => s.stopwatch);
  const start = useClockStore((s) => s.startStopwatch);
  const stop = useClockStore((s) => s.stopStopwatch);
  const lap = useClockStore((s) => s.lapStopwatch);
  const reset = useClockStore((s) => s.resetStopwatch);

  // Tick fast enough for a smooth centisecond readout, but only while
  // running — the value itself always comes from Date.now() math, not from
  // counting ticks, so tab-switch or throttling never skews it.
  const now = useNow(31, stopwatch.running);
  const elapsed =
    stopwatch.accumulatedMs + (stopwatch.running && stopwatch.startedAt !== null ? now - stopwatch.startedAt : 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-8">
        <span className="text-on-surface text-display-lg font-mono leading-none font-semibold tabular-nums">
          {formatStopwatch(elapsed)}
        </span>
        <div className="flex items-center gap-2">
          {stopwatch.running ? (
            <Button variant="default" size="sm" onClick={stop}>
              <Pause size={12} strokeWidth={2} />
              Stop
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={start}>
              <Play size={12} strokeWidth={2} />
              Start
            </Button>
          )}
          <Button variant="default" size="sm" onClick={lap} disabled={!stopwatch.running}>
            <Flag size={12} strokeWidth={2} />
            Lap
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={reset}
            disabled={stopwatch.running && stopwatch.accumulatedMs === 0 && stopwatch.startedAt === null}
          >
            <RotateCcw size={12} strokeWidth={2} />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stopwatch.laps.length === 0 ? (
          <p className="font-ui text-on-surface-variant text-control flex h-full items-center justify-center">
            No laps recorded
          </p>
        ) : (
          stopwatch.laps.map((lapMs, i) => {
            const lapNumber = stopwatch.laps.length - i;
            return (
              <div
                key={`${lapNumber}-${lapMs}`}
                className="border-outline-variant flex items-center justify-between border-b px-3 py-1.5"
              >
                <span className="font-ui text-on-surface-variant text-label">Lap {lapNumber}</span>
                <span className="text-on-surface text-control font-mono tabular-nums">{formatStopwatch(lapMs)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
