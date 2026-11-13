/**
 * The phone layout's one rule (2026-11-13): a viewport under 600 px wide is a
 * phone. Windows open maximized above the taskbar, the taskbar holds 48 px
 * targets and the desktop's icons pack closer. Classes say it as
 * `phone:`; type follows the pointer instead (`pointer-coarse:` and the
 * coarse-pointer block in index.css).
 */
const PHONE_MAX_WIDTH = 600;

export function isPhoneWidth(width: number): boolean {
  return width < PHONE_MAX_WIDTH;
}
