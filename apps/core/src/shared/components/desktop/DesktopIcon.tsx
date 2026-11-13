import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "../../../lib/cn";
import type { AppConfig } from "../../registry/registry";
import { ICON_HEIGHT, ICON_WIDTH, clampToDesktop } from "./layoutIcons";

type DesktopIconProps = {
  app: AppConfig;
  onOpen: () => void;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  /**
   * The desktop's measured size. Drag limits are numbers derived from it, not
   * a ref to the desktop element: with a ref, framer-motion listens for window
   * resizes (and observes the element) and on each one stops the icon's
   * running animation and moves it to the same fraction of the new bounds. A
   * resize therefore froze every icon part way to its new grid cell, squeezed
   * together, until a reload. Numeric limits have no such listener.
   */
  bounds: { width: number; height: number };
  /**
   * Selection is owned by Desktop — it is a set across icons now
   * (marquee, Ctrl+click), which no per-icon `useState` can express. It is also
   * deliberately ephemeral: the desktop store persists to a dotfile, and a
   * selection surviving a reload would be a bug, not a feature.
   */
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function DesktopIcon({
  app,
  onOpen,
  position,
  onPositionChange,
  bounds,
  selected,
  onSelect,
  onContextMenu,
}: DesktopIconProps) {
  const Icon = app.icon;
  // In the x/y motion values' own space: the icon is placed by transform from
  // the desktop's top-left corner. Memoised so a re-render does not hand
  // framer-motion a new object.
  const dragConstraints = useMemo(
    () => ({
      left: 0,
      top: 0,
      right: Math.max(0, bounds.width - ICON_WIDTH),
      bottom: Math.max(0, bounds.height - ICON_HEIGHT),
    }),
    [bounds.width, bounds.height],
  );

  return (
    <motion.div
      drag
      dragConstraints={dragConstraints}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={(_, info) => {
        // Persist the CLAMPED point, not the raw pointer delta. `dragConstraints`
        // only limits what is drawn during the drag; `info.offset` is the full
        // pointer movement, so a flick past the edge would otherwise be stored
        // (and pinned) out of bounds and redraw off-screen, unrecoverable.
        onPositionChange(clampToDesktop({ x: position.x + info.offset.x, y: position.y + info.offset.y }, bounds));
      }}
      initial={false}
      animate={{ x: position.x, y: position.y }}
      whileDrag={{ scale: 1.05, zIndex: 10 }}
      className={cn(
        "pt-base gap-half absolute top-0 left-0 flex w-[80px] cursor-default flex-col items-center select-none",
        "rounded-item focus-visible:ring-primary outline-none focus-visible:ring-2",
      )}
      role="button"
      aria-label={app.name}
      aria-pressed={selected}
      tabIndex={0}
      // Stop the bubble in both directions: a press on an icon must never
      // start the desktop's marquee, and a right-click here opens the ICON
      // menu, not the background one.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* The tile: raised, resting on the wallpaper (2026-11-13). Apricot draws
          the glyph in the strong accent on the brightest surface. */}
      <div
        className={cn(
          "rounded-tile flex h-[40px] w-[40px] shrink-0 items-center justify-center border",
          selected
            ? "border-primary bg-primary-container text-on-primary-container"
            : "border-outline-variant bg-surface-container-low text-on-surface apricot:border-transparent apricot:bg-surface-bright apricot:text-primary apricot:shadow-(--k-shadow-tile)",
        )}
      >
        <Icon size={20} strokeWidth={1.75} className="text-current" />
      </div>

      {/* The label: one line where it fits, two at most. Under a night sky
          (the dusk wallpaper's stars) it sits on a soft chip, so a pale label
          never lands on the pale moon; the chip follows the stars' opacity,
          which is 0 by day. */}
      <span className="relative max-w-[76px]">
        {!selected && (
          <span
            aria-hidden
            className="bg-surface-container-low absolute inset-0 rounded-[6px]"
            style={{ opacity: "calc(var(--k-wall-star-opacity, 0) * 0.91)" }}
          />
        )}
        <span
          className={cn(
            "font-ui text-label relative line-clamp-2 block rounded-[6px] px-[6px] py-[2px] text-center break-words",
            selected
              ? "bg-primary-container text-on-primary-container"
              : "text-on-surface [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]",
          )}
        >
          {app.name}
        </span>
      </span>
    </motion.div>
  );
}
