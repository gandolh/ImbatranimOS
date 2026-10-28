import { readPref, writePref } from '../../lib/prefs'
import { useAssociationStore } from '../registry/associations'
import { useAddonStore } from './addonStore'
import { useDesktopStore } from './desktopStore'
import { useStartupStore } from './startupStore'

/**
 * Built-in apps that left for imbatranim-office, and the one-time move of the
 * owner's choices to the suite's ids (brief 164, decisions-office-suite.md).
 *
 * Each retirement run adds its pair here: the built-in's id, then the suite
 * app that replaces it. Two built-ins may map to one suite app (PDF Viewer
 * and norPDF both became Office's PDF).
 */
export const RETIRED_APP_IDS: readonly (readonly [from: string, to: string])[] = [
  ['docs', 'office-docs'],
  ['slides', 'office-slides'],
  ['sheets', 'office-sheets'],
  // norPDF first: it was the default for .pdf, so its icon's place wins when
  // both were pinned.
  ['norpdf', 'office-pdf'],
  ['pdf-viewer', 'office-pdf'],
]

/** The dotfile that records which pairs have been moved. */
export const APP_ID_MIGRATIONS_KEY = 'imbatranimos:app-id-migrations'

const RENAMED = new Map(RETIRED_APP_IDS)

/**
 * The id an app goes by now: the suite's for a retired built-in, else `id`.
 * For app ids kept outside the dotfiles, such as the server's recents, which
 * are read through this rather than rewritten.
 */
export function currentAppId(id: string): string {
  return RENAMED.get(id) ?? id
}

function pairTag(from: string, to: string): string {
  return `${from}>${to}`
}

function readDone(): string[] {
  try {
    const parsed = JSON.parse(readPref(APP_ID_MIGRATIONS_KEY) ?? '{}') as { done?: unknown }
    return Array.isArray(parsed.done)
      ? parsed.done.filter((t): t is string => typeof t === 'string')
      : []
  } catch {
    return []
  }
}

function swapIn(list: readonly string[], from: string, to: string): string[] | null {
  if (!list.includes(from)) return null
  const next: string[] = []
  for (const id of list) {
    const now = id === from ? to : id
    if (!next.includes(now)) next.push(now)
  }
  return next
}

/**
 * Rewrite `from` to `to` in every dotfile that keeps an app id, except the
 * disabled set, which {@link moveDisabled} handles per suite app.
 */
function moveChoices(from: string, to: string): void {
  // "Always open .docx with Docs" becomes "with Office's Docs".
  const { overrides } = useAssociationStore.getState()
  if (Object.values(overrides).includes(from)) {
    useAssociationStore.setState({
      overrides: Object.fromEntries(
        Object.entries(overrides).map(([ext, id]) => [ext, id === from ? to : id])
      ),
    })
  }

  // The icon keeps the place the owner gave it, unless the suite's icon
  // already has one they chose.
  const { iconPositions } = useDesktopStore.getState()
  const old = iconPositions[from]
  if (old) {
    const { [from]: _gone, ...rest } = iconPositions
    const keep = iconPositions[to]?.pinned ? iconPositions[to] : old
    useDesktopStore.setState({ iconPositions: { ...rest, [to]: keep } })
  }

  const apps = swapIn(useStartupStore.getState().apps, from, to)
  if (apps) useStartupStore.setState({ apps })
}

/**
 * A disabled built-in stays disabled under its suite app's id. A suite app
 * that replaces two built-ins is disabled only when both were (brief 167):
 * hiding PDF Viewer, the light option, said nothing about wanting no PDF app.
 */
function moveDisabled(froms: readonly string[], to: string): void {
  let disabled: readonly string[] = useAddonStore.getState().disabled
  if (!froms.every((id) => disabled.includes(id))) return
  for (const from of froms) disabled = swapIn(disabled, from, to) ?? disabled
  useAddonStore.setState({ disabled: [...disabled] })
}

/**
 * Move the owner's choices from each retired built-in to its suite app, once
 * per pair. Runs at sign-in, after the dotfiles are rehydrated from the server
 * (`rehydrateDotfileStores`), so it rewrites the server's copy, and the record
 * of what ran is a dotfile too: a second browser does nothing again.
 *
 * Whether the suite is installed does not matter. A choice for an app that is
 * not installed stays where it was put: `resolveOpener` skips an override
 * whose app is missing, the desktop shows no icon for it and startup skips it,
 * and all of them come back the moment Office is installed.
 */
export function migrateRetiredAppIds(): void {
  const done = readDone()
  const pending = RETIRED_APP_IDS.filter(([from, to]) => !done.includes(pairTag(from, to)))
  if (pending.length === 0) return

  const sources = new Map<string, string[]>()
  for (const [from, to] of pending) {
    moveChoices(from, to)
    sources.set(to, [...(sources.get(to) ?? []), from])
  }
  for (const [to, froms] of sources) moveDisabled(froms, to)

  done.push(...pending.map(([from, to]) => pairTag(from, to)))
  writePref(APP_ID_MIGRATIONS_KEY, JSON.stringify({ done }))
}
