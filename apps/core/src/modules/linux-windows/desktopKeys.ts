import { useShortcutStore } from "../../shared/hooks/shortcutRegistry";
import { eventMatchesBinding, parseBinding } from "../../shared/hooks/useGlobalHotkeys";

/**
 * A key the desktop keeps even while a Linux window has the keyboard: the
 * registered global and window-management shortcuts (the palette, Alt+Tab,
 * workspaces, closing a window). Everything else goes to the app.
 */
export function isDesktopShortcut(e: KeyboardEvent): boolean {
  for (const s of Object.values(useShortcutStore.getState().shortcuts)) {
    if (s.scope === "Editing") continue;
    if (bindingsOf(s.keys).some((b) => eventMatchesBinding(e, parseBinding(b)))) return true;
  }
  return false;
}

/**
 * A shortcut's bindings. A family is documented as one row with a range,
 * `ctrl+alt+1…4`; it stands for each digit in it.
 */
function bindingsOf(keys: string): string[] {
  const range = /^(.*?)(\d)…(\d)$/.exec(keys);
  if (!range) return [keys];
  const out: string[] = [];
  for (let d = Number(range[2]); d <= Number(range[3]); d++) out.push(`${range[1]}${d}`);
  return out;
}
