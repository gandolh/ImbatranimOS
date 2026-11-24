import { useEffect, useRef, useState, type ReactNode } from "react";

/** How far below (or above) the view a section starts mounting, so it is there before it scrolls in. */
const AHEAD = "600px 0px";

/**
 * A Settings section's content, mounted once it comes within {@link AHEAD} of the page's view, or at once
 * with `now` (an intent that asks for something inside it) or where there is no IntersectionObserver. Once
 * mounted it stays.
 *
 * Settings is one scrolling page, and every section used to mount on open: about 1,300 components (a Select
 * for each file type in Default apps among them) and 13 requests, five of them folder-size walks on the
 * server, for every open, though most opens change the theme at the top (2026-11-24).
 */
export function DeferredSection({
  children,
  now = false,
  minHeight = 160,
}: {
  children: ReactNode;
  now?: boolean;
  /** The space held while the content waits, so the page's length changes little when it arrives. */
  minHeight?: number;
}) {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  const holder = useRef<HTMLDivElement>(null);
  const shown = seen || now;

  useEffect(() => {
    const element = holder.current;
    if (shown || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setSeen(true);
      },
      { root: element.closest("[data-settings-page]"), rootMargin: AHEAD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);

  if (shown) return <>{children}</>;
  return <div ref={holder} style={{ minHeight }} aria-busy="true" />;
}
