import { useEffect, useState } from "react";
import { cn } from "@imbatranim/ui";
import { ENC_DEFLATE_RGBA, ENC_JPEG, ENC_VP8, ENC_WEBP_LOSSLESS } from "./frames";
import { ENCODING_NAMES, streamStats, useStreamStatsSwitch } from "./streamStats";

/** One colour per encoding, from the theme's tokens. */
const OUTLINE: Record<number, string> = {
  [ENC_DEFLATE_RGBA]: "border-tertiary",
  [ENC_WEBP_LOSSLESS]: "border-primary",
  [ENC_JPEG]: "border-error",
  [ENC_VP8]: "border-secondary",
};
const SWATCH: Record<number, string> = {
  [ENC_DEFLATE_RGBA]: "bg-tertiary",
  [ENC_WEBP_LOSSLESS]: "bg-primary",
  [ENC_JPEG]: "bg-error",
  [ENC_VP8]: "bg-secondary",
};
const LEGEND = [ENC_WEBP_LOSSLESS, ENC_VP8, ENC_JPEG, ENC_DEFLATE_RGBA];

/** How often the overlay redraws while it shows. */
const REDRAW_MS = 250;

/**
 * "Show stream stats" over one Linux window: each rectangle that came in the last half second, outlined in
 * its encoding's colour, and a corner panel with the last second's numbers. It ignores the pointer, draws
 * only while its switch is on and its window is showing, and costs nothing otherwise.
 */
export function StreamStatsOverlay({
  toplevel,
  visible,
  scale,
  offset,
}: {
  toplevel: number;
  visible: boolean;
  /** Image pixels per CSS pixel. */
  scale: number;
  /** The app's window geometry's top-left in the image, which the canvas is shifted by. */
  offset: { x: number; y: number };
}) {
  const on = useStreamStatsSwitch((s) => s.on);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on || !visible) return;
    const t = setInterval(() => setNow(performance.now()), REDRAW_MS);
    return () => clearInterval(t);
  }, [on, visible]);
  if (!on || !visible) return null;

  const s = scale >= 1 ? scale : 1;
  const stats = streamStats.summary(toplevel, now);
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" data-stream-stats="">
      {streamStats.flashes(toplevel, now).map((f, i) => (
        <span
          key={`${f.at}-${i}`}
          className={cn("absolute border", OUTLINE[f.encoding] ?? "border-outline")}
          style={{ left: f.x / s - offset.x, top: f.y / s - offset.y, width: f.w / s, height: f.h / s }}
        />
      ))}
      <div className="bg-inverse-surface text-inverse-on-surface rounded-control text-label absolute top-1 right-1 px-2 py-1 font-mono leading-snug opacity-90">
        <div>
          {stats.fps.toFixed(0)} fps · {stats.kBps.toFixed(0)} kB/s
        </div>
        <div>decode {stats.decodeMs.toFixed(1)} ms</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2">
          {LEGEND.map((e) => {
            const share = stats.shares.find((x) => x.encoding === e)?.share ?? 0;
            return (
              <span key={e} className="flex items-center gap-1">
                <span className={cn("inline-block size-2 rounded-full", SWATCH[e])} />
                {ENCODING_NAMES[e]} {Math.round(share * 100)}%
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
