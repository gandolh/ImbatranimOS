import { getExtension } from './fileKind'

/**
 * Which desktop app opens which file type, by lowercase extension.
 *
 * This is the single source of truth for double-click / Enter routing in the
 * file manager. Brief 20 (Sheets/Docs editors) extends it by adding entries
 * here — nothing else in the file manager needs to change.
 *
 * `onlyRoots` gates an entry to specific FS roots. Notepad reads the Notes root
 * only (it is not root-aware), so text files route to it just from `notes`.
 * The viewers (PDF Viewer, Slides) are root-aware — they receive `{ root }` in
 * the open payload and fetch bytes via the authed download endpoint — so they
 * carry no `onlyRoots` and open from any root.
 */
export type OpenWithRule = {
  appId: string
  /** If set, this rule only applies when the file lives under one of these roots. */
  onlyRoots?: string[]
}

const NOTEPAD_ONLY_NOTES: OpenWithRule = { appId: 'notepad', onlyRoots: ['notes'] }

export const EXTENSION_APP_MAP: Record<string, OpenWithRule> = {
  // Text / code → Notepad (Notes root only)
  md: NOTEPAD_ONLY_NOTES,
  txt: NOTEPAD_ONLY_NOTES,
  log: NOTEPAD_ONLY_NOTES,
  json: NOTEPAD_ONLY_NOTES,
  ts: NOTEPAD_ONLY_NOTES,
  tsx: NOTEPAD_ONLY_NOTES,
  js: NOTEPAD_ONLY_NOTES,
  jsx: NOTEPAD_ONLY_NOTES,
  css: NOTEPAD_ONLY_NOTES,
  html: NOTEPAD_ONLY_NOTES,
  sh: NOTEPAD_ONLY_NOTES,
  py: NOTEPAD_ONLY_NOTES,
  // Documents → viewers (any root)
  pdf: { appId: 'pdf-viewer' },
  pptx: { appId: 'slides' },
  ppt: { appId: 'slides' },
  // Office editors → Sheets / Docs (any root; root-aware like the viewers)
  xlsx: { appId: 'sheets' },
  xls: { appId: 'sheets' },
  docx: { appId: 'docs' },
}

/**
 * The app id that should open `fileName` from `root`, or null if nothing is
 * registered (or the registered app isn't available from this root).
 */
export function resolveOpenApp(root: string, fileName: string): string | null {
  const rule = EXTENSION_APP_MAP[getExtension(fileName)]
  if (!rule) return null
  if (rule.onlyRoots && !rule.onlyRoots.includes(root)) return null
  return rule.appId
}

/** Human label for the "Open" context-menu item, given the resolved app id. */
export function openAppLabel(appId: string | null): string {
  switch (appId) {
    case 'notepad':
      return 'Open in Notepad'
    case 'pdf-viewer':
      return 'Open in PDF Viewer'
    case 'slides':
      return 'Open in Slides'
    case 'sheets':
      return 'Open in Sheets'
    case 'docs':
      return 'Open in Docs'
    default:
      return 'Open'
  }
}
