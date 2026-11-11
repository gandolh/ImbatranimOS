import type { CSSProperties } from "react";

/**
 * The sunset-hills scene from the 2026-11-02 canvas, drawn at 1280×756 there.
 * Here it fills any desktop: stars, sun and clouds sit at the canvas's
 * positions as percentages and keep their sizes, so the sun stays round and
 * top-right; the hills are the canvas's paths, stretched across the bottom
 * 43% (the band they took on the canvas). Stars show only in dark mode, through
 * --k-wall-star-opacity.
 */
export function SunsetHills() {
  const fill = (v: string): CSSProperties => ({ fill: `var(${v})` });
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" focusable="false">
      <g style={{ ...fill("--k-wall-star"), opacity: "var(--k-wall-star-opacity)" }}>
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={pct(x, 1280)} cy={pct(y, 756)} r={r} />
        ))}
      </g>
      <circle cx="84.375%" cy="25.13%" r="150" style={{ ...fill("--k-wall-sun"), opacity: 0.28 }} />
      <circle cx="84.375%" cy="25.13%" r="74" style={fill("--k-wall-sun")} />
      <g style={{ ...fill("--k-wall-cloud"), opacity: 0.85 }}>
        {CLOUDS.map(([x, y, rx, ry]) => (
          <ellipse key={`${x}-${y}`} cx={pct(x, 1280)} cy={pct(y, 756)} rx={rx} ry={ry} />
        ))}
      </g>
      <svg y="56.88%" width="100%" height="43.12%" viewBox="0 430 1280 326" preserveAspectRatio="none">
        <path
          d="M0 500 C 200 430 420 450 640 505 S 1040 590 1280 470 L 1280 756 L 0 756 Z"
          style={fill("--k-wall-hill-1")}
        />
        <path
          d="M0 590 C 240 530 500 550 760 600 S 1110 660 1280 590 L 1280 756 L 0 756 Z"
          style={fill("--k-wall-hill-2")}
        />
        <path
          d="M0 670 C 300 630 620 640 900 680 S 1180 715 1280 690 L 1280 756 L 0 756 Z"
          style={fill("--k-wall-hill-3")}
        />
      </svg>
    </svg>
  );
}

function pct(v: number, of: number): string {
  return `${((v / of) * 100).toFixed(2)}%`;
}

/** [cx, cy, r] on the canvas's 1280×756. */
const STARS: [number, number, number][] = [
  [140, 70, 1.6],
  [420, 40, 1.2],
  [610, 110, 1.8],
  [760, 56, 1.3],
  [900, 150, 1.5],
  [1210, 60, 1.4],
  [1240, 300, 1.2],
  [980, 330, 1.6],
];

/** [cx, cy, rx, ry] on the canvas's 1280×756; each cloud is two ellipses. */
const CLOUDS: [number, number, number, number][] = [
  [300, 150, 90, 20],
  [346, 134, 52, 26],
  [860, 96, 72, 16],
  [896, 84, 40, 20],
  [1190, 330, 60, 14],
  [1210, 320, 32, 16],
];
