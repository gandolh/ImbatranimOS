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

/** Rewrite `from` to `to` in every dotfile that keeps an app id. */
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

  // A disabled built-in stays disabled under its new id.
  const disabled = swapIn(useAddonStore.getState().disabled, from, to)
  if (disabled) useAddonStore.setState({ disabled })

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
  let ran = false
  for (const [from, to] of RETIRED_APP_IDS) {
    const tag = pairTag(from, to)
    if (done.includes(tag)) continue
    moveChoices(from, to)
    done.push(tag)
    ran = true
  }
  if (ran) writePref(APP_ID_MIGRATIONS_KEY, JSON.stringify({ done }))
}
