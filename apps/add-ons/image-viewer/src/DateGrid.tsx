import { memo, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { Button, cn } from "@imbatranim/ui";
import type { DayGroup } from "./lib/groupByDay";
import { verticalTarget } from "./lib/gridNav";

/** A tile's image: the photo's embedded preview, turned the way the photo is, or the file itself. */
export type TileSource = { src: string; transform?: string | undefined };

type Props = {
  /** Null while the folder is still being listed. */
  groups: DayGroup[] | null;
  /** The folder couldn't be listed: say so, with Retry, instead of "No images". */
  failed: boolean;
  onRetry: () => void;
  /** The photo the viewer is on: the grid starts with it as the tab stop. */
  currentPath: string | null;
  /** What a tile shows, or null while it waits (its photo's embedded preview may be on the way). */
  sourceFor: (path: string) => TileSource | null;
  reading: boolean;
  done: number;
  total: number;
  onOpen: (path: string) => void;
};

/** The day's heading: the year only when it isn't this one. */
function headingFor(day: Date, now: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    ...(day.getFullYear() === now.getFullYear() ? null : { year: "numeric" }),
  }).format(day);
}

/**
 * A folder's photos by day, newest first. One tab stop (the active tile); the
 * arrow keys move it, Enter opens the photo. A tile shows the photo's embedded
 * Exif preview when it has a usable one, else the file itself, loaded lazily and
 * sized by CSS.
 */
export const DateGrid = memo(function DateGrid({
  groups,
  failed,
  onRetry,
  currentPath,
  sourceFor,
  reading,
  done,
  total,
  onOpen,
}: Props) {
  const flat = useMemo(() => (groups ?? []).flatMap((g) => g.items.map((i) => i.entry)), [groups]);
  const [picked, setPicked] = useState<string | null>(null);
  const activePath = picked ?? currentPath;
  const found = flat.findIndex((e) => e.path === activePath);
  const active = found >= 0 ? found : 0;
  const box = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  if (groups === null) {
    return (
      <div className="text-on-surface-variant font-ui text-control flex flex-1 items-center justify-center gap-2">
        <Loader2 size={16} className="motion-safe:animate-spin" />
        Loading folder…
      </div>
    );
  }
  if (failed) {
    return (
      <div
        role="alert"
        className="text-on-surface-variant font-ui text-control flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <ImageOff size={40} strokeWidth={1} />
        Couldn't read this folder
        <Button onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (flat.length === 0) {
    return (
      <div className="text-on-surface-variant font-ui text-control flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <ImageOff size={40} strokeWidth={1} />
        No images in this folder
      </div>
    );
  }

  const tiles = () => [...(box.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
  const moveTo = (i: number) => {
    const target = flat[i];
    if (!target) return;
    setPicked(target.path);
    tiles()[i]?.focus();
    tiles()[i]?.scrollIntoView?.({ block: "nearest" });
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
        next = Math.max(0, active - 1);
        break;
      case "ArrowRight":
        next = Math.min(flat.length - 1, active + 1);
        break;
      case "ArrowUp":
      case "ArrowDown":
        next = verticalTarget(
          tiles().map((t) => ({ top: t.offsetTop, left: t.offsetLeft })),
          active,
          e.key === "ArrowDown" ? 1 : -1,
        );
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = flat.length - 1;
        break;
      case "Enter": {
        const entry = flat[active];
        if (entry) {
          e.preventDefault();
          onOpen(entry.path);
        }
        return;
      }
      default:
        return;
    }
    // The viewer's own arrow keys step photos; in the grid they move the tile.
    e.preventDefault();
    e.stopPropagation();
    moveTo(next);
  }

  let flatIndex = 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {reading && total > 0 && (
        <div
          role="status"
          className="text-on-surface-variant font-ui text-label border-outline-variant border-b px-3 py-1"
        >
          Reading dates… {done} of {total}
        </div>
      )}
      <div
        ref={box}
        role="group"
        aria-label="Photos by date"
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`day-${group.key}`}>
            <h3
              id={`day-${group.key}`}
              className="font-ui text-control text-on-surface bg-surface-container-lowest sticky top-0 z-10 flex items-baseline gap-2 py-2"
            >
              {headingFor(group.day, now)}
              <span className="text-on-surface-variant text-label tabular-nums">{group.items.length}</span>
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
              {group.items.map(({ entry }) => {
                const i = flatIndex++;
                const source = sourceFor(entry.path);
                return (
                  <button
                    key={entry.path}
                    type="button"
                    data-tile
                    tabIndex={i === active ? 0 : -1}
                    aria-label={entry.name}
                    onClick={() => onOpen(entry.path)}
                    onFocus={() => setPicked(entry.path)}
                    className={cn(
                      "bg-surface-container-low focus-visible:outline-primary aspect-square cursor-pointer overflow-hidden rounded-sm p-0 outline-offset-2 focus-visible:outline-2",
                    )}
                  >
                    {source && (
                      <img
                        src={source.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover"
                        style={source.transform ? { transform: source.transform } : undefined}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
});
