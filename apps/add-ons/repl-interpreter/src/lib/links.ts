/**
 * Which links the Terminal opens, and how. Two kinds arrive: plain URLs in the output (the web-links addon
 * matches only http and https) and OSC 8 hyperlinks, where a program names the target and the text can say
 * anything. Both come here, so the same rule holds for both: http and https open in a new tab; any other
 * scheme, or a target that doesn't parse, is refused. A crafted link must not reach a local file, script or
 * app scheme (Ghostty's 2026 advisories GHSA-cw69-wm67-5pv8 and GHSA-mfw9-xcr3-7gfp).
 */

/** The target as `new URL` writes it, when it is an http or https URL; otherwise null. */
export function webLinkTarget(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

/** What a click on a link does. */
export type LinkAction =
  | { kind: "refuse" }
  | { kind: "open"; href: string }
  /** On a screen with no hover, an OSC 8 link whose text isn't its address asks first, naming the host. */
  | { kind: "ask"; href: string; host: string };

/**
 * The decision for a click on `uri`. `shownText` is an OSC 8 link's visible text (absent for a plain URL,
 * which is its own text); `canHover` is whether the pointer can hover, which is how the target was shown
 * before the click.
 */
export function linkAction(uri: string, opts: { shownText?: string; canHover: boolean }): LinkAction {
  const href = webLinkTarget(uri);
  if (href === null) return { kind: "refuse" };
  const shown = opts.shownText?.trim();
  if (!opts.canHover && shown !== undefined && shown !== uri && shown !== href) {
    return { kind: "ask", href, host: new URL(href).host };
  }
  return { kind: "open", href };
}
