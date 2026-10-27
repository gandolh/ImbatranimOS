import { topVisibleWindowId } from '../../store/windowStore'

/**
 * Moving the keyboard into a window the desktop raised (brief 174).
 *
 * A click inside a window puts DOM focus there by itself. Raising a window
 * from the taskbar, Alt+Tab, the Start menu or the palette does not: the store
 * changes the stacking order and nothing in the DOM, so the keyboard stayed on
 * the taskbar button and a keyboard-first app (the Terminal, an editor, CAD's
 * command line) needed a click first. Those paths call
 * {@link focusIntoWindowSoon} after their store calls; the click path never
 * does, because the click has already decided.
 */

/** Marks a window's content area (Window.tsx): the app's part, not the title bar. */
export const CONTENT_ATTR = 'data-window-content'

/**
 * The element that last had focus in each window's content area. Window.tsx
 * records it on every focus inside the content, never on the title bar: a
 * restore that put focus back on Minimize would make Enter minimise again.
 */
const lastFocused = new Map<string, HTMLElement>()

/** What can take the keyboard by Tab, a frame included. */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ')

function visible(el: HTMLElement): boolean {
  // jsdom has no layout; a browser without checkVisibility is too old to
  // matter here. Either way, assume visible rather than skip everything.
  return typeof el.checkVisibility !== 'function' || el.checkVisibility()
}

function windowRoot(windowId: string): HTMLElement | null {
  // Compared, not interpolated into a selector, so no id can break the query.
  for (const el of document.querySelectorAll<HTMLElement>('[data-window-id]')) {
    if (el.getAttribute('data-window-id') === windowId) return el
  }
  return null
}

/** Window.tsx calls this from its content area's focus handler. */
export function rememberWindowFocus(windowId: string, el: EventTarget | null): void {
  if (!(el instanceof HTMLElement) || el.hasAttribute(CONTENT_ATTR)) return
  lastFocused.set(windowId, el)
}

/** Window.tsx calls this when the window unmounts. */
export function forgetWindowFocus(windowId: string): void {
  lastFocused.delete(windowId)
}

/**
 * Where the keyboard goes in a content area, in the brief's order: the element
 * that last had focus in it, if it is still on the page; else the first
 * focusable element (the iframe, for a URL app); else the area itself.
 *
 * The remembered element is checked for being on the page, not for being
 * inside the area: an app's dialog renders through a portal, its focus reaches
 * the window through React's tree, and it is the right place to come back to.
 */
export function focusTargetIn(windowId: string, content: HTMLElement): HTMLElement {
  const last = lastFocused.get(windowId)
  if (last?.isConnected && visible(last)) return last
  for (const el of content.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el.tabIndex >= 0 && visible(el)) return el
  }
  return content
}

/**
 * Put the keyboard in `windowId`'s content now. Does nothing when focus is
 * already in the window (or in a dialog it opened). Returns the element it
 * focused, or null.
 */
export function focusIntoWindow(windowId: string): HTMLElement | null {
  const root = windowRoot(windowId)
  const content = root?.querySelector<HTMLElement>(`[${CONTENT_ATTR}]`)
  if (!root || !content) return null
  const active = document.activeElement
  if (active && active !== document.body) {
    if (root.contains(active)) return null
    if (active === lastFocused.get(windowId)) return null
  }
  const target = focusTargetIn(windowId, content)
  target.focus({ preventScroll: true })
  return target
}

/**
 * {@link focusIntoWindow} on the next frame, for the activation paths. A
 * minimised window is `display: none` until the store change renders, and a
 * menu or the palette that started the activation hands focus back to its
 * trigger as it closes; one frame lets both settle.
 *
 * Only while `windowId` is still the focused window: `topVisibleWindowId()` is
 * null behind the cover screen (brief 101), so nothing moves focus while the
 * shell is suspended, and a window closed, minimised or covered by another in
 * that frame is left alone.
 */
export function focusIntoWindowSoon(windowId: string): void {
  requestAnimationFrame(() => {
    if (topVisibleWindowId() !== windowId) return
    focusIntoWindow(windowId)
  })
}
