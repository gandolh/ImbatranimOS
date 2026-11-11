import { useEffect, useRef } from "react";
import { useWindowStore } from "../../shared/store/windowStore";
import { canvasFor, useLinuxWindowsStore, type LinuxPopup } from "./linuxWindowsStore";
import { attachPointer } from "./pointerInput";

/**
 * Where a Linux window's geometry starts on the page, or null when it isn't
 * showing (its OS window is minimized, on another workspace, or gone). A
 * toplevel's is its window body's corner; a popup's is its parent's plus
 * its own position.
 */
function windowOrigin(id: number, depth = 0): { x: number; y: number } | null {
  if (depth > 32) return null;
  const popup = useLinuxWindowsStore.getState().popups[id];
  if (popup) {
    const parent = windowOrigin(popup.parent, depth + 1);
    return parent ? { x: parent.x + popup.x, y: parent.y + popup.y } : null;
  }
  const body = document.querySelector<HTMLElement>(`[data-linux-toplevel-id="${id}"]`);
  if (!body) return null;
  const r = body.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: r.left, y: r.top };
}

/**
 * The session's popups: menus, dropdowns and tooltips, each drawn where the
 * host placed it relative to its parent, above every OS window, and free to
 * extend past its parent's edges. They follow their parent as it moves.
 */
export function LinuxPopupLayer() {
  const popups = useLinuxWindowsStore((s) => s.popups);
  // Above every window: the next window to come to the front takes this.
  const zIndex = useWindowStore((s) => s.nextZIndex);
  const list = Object.values(popups);
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex }} data-linux-popup-layer="">
      {list.map((p) => (
        <LinuxPopupView key={p.popup} popup={p} />
      ))}
    </div>
  );
}

function LinuxPopupView({ popup }: { popup: LinuxPopup }) {
  const holder = useRef<HTMLDivElement>(null);
  const cursor = useLinuxWindowsStore((s) => s.cursor);
  const { popup: id, geometry } = popup;

  // The canvas, moved into this popup and offset by its geometry.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const canvas = canvasFor(id);
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    el.appendChild(canvas);
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas);
    };
  }, [id]);

  useEffect(() => {
    canvasFor(id).style.transform = `translate(${-geometry.x}px, ${-geometry.y}px)`;
  }, [id, geometry.x, geometry.y]);

  // Follow the parent every frame while open; popups are short-lived.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let frame = 0;
    const place = () => {
      const at = windowOrigin(id);
      if (at) {
        el.style.display = "";
        el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      } else {
        el.style.display = "none";
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [id]);

  // The pointer goes to the popup. The keyboard stays where it was: the
  // host sends keys to the popup holding the grab.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    return attachPointer(el, id, () => canvasFor(id), {
      onDown: (e) => e.preventDefault(),
    });
  }, [id]);

  return (
    <div
      ref={holder}
      className="pointer-events-auto absolute top-0 left-0 overflow-hidden"
      style={{ width: geometry.width, height: geometry.height, cursor, touchAction: "none" }}
      data-linux-popup={id}
    />
  );
}
