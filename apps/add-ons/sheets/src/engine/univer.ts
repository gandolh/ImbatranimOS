/**
 * Lazy bridge to Univer (the spreadsheet grid). The Univer presets + render
 * engine are the heaviest dependency in the repo, so everything here is behind a
 * dynamic import — the whole engine (and its CSS) becomes its own build chunk
 * and never touches the desktop boot bundle. Only `import type` lives at module
 * top level, and those are erased at build time.
 */
import type { IWorkbookData } from '@univerjs/presets'

// Minimal shape of the Univer facade surface we actually call. Univer's full
// FUniver/FWorkbook types come from several packages (core augmented by the
// sheets facade); pinning to just what we use keeps this bridge decoupled from
// that augmentation graph.
type UniverWorkbook = { dispose: () => void; save: () => IWorkbookData }
type UniverCommand = { type: number; id: string }
type UniverApi = {
  createWorkbook: (data: Partial<IWorkbookData>) => UniverWorkbook
  onCommandExecuted: (cb: (command: UniverCommand) => void) => { dispose: () => void }
}
type UniverInstance = { dispose: () => void }

export type SheetEngine = {
  /** Load a workbook snapshot into the mounted grid. */
  loadWorkbook: (data: Partial<IWorkbookData>) => void
  /** Current workbook state as a snapshot (for serialization on save). */
  snapshot: () => IWorkbookData | null
  /** Fire `cb` the first time the user mutates the sheet (for dirty tracking). */
  onEdit: (cb: () => void) => void
  /** Tear down Univer and release its render resources. */
  destroy: () => void
}

/**
 * Boot a Univer instance mounted into `container`. The presets bundle the sheet
 * UI (toolbar, formula bar, grid) so users get a real editor, not a viewer.
 */
export async function createSheetEngine(container: HTMLElement): Promise<SheetEngine> {
  const [{ createUniver, defaultTheme, LocaleType, merge }, sheetsCore, enUS] = await Promise.all([
    import('@univerjs/presets'),
    import('@univerjs/preset-sheets-core'),
    import('@univerjs/preset-sheets-core/locales/en-US'),
    import('@univerjs/preset-sheets-core/lib/index.css'),
  ])

  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: merge({}, enUS.default),
    },
    theme: defaultTheme,
    presets: [
      sheetsCore.UniverSheetsCorePreset({
        container,
      }),
    ],
  }) as unknown as { univer: UniverInstance; univerAPI: UniverApi }

  let workbook: UniverWorkbook | null = null
  let editListeners: Array<() => void> = []
  let notifiedThisLoad = false
  // Suppress edit notifications while a workbook is being loaded — building the
  // model can emit mutations that would otherwise register as a user edit.
  let suppressEdits = true

  // Univer namespaces every change: `sheet.command.*` are user-initiated edits,
  // `sheet.mutation.*` are low-level model writes (incl. formula recalculation
  // fired on load), and `sheet.operation.*` are selection/scroll. We latch dirty
  // only on user COMMANDs so opening a workbook (which recalculates formulas via
  // mutations) never registers as an edit — and dirty is a one-shot latch.
  const commandSub = univerAPI.onCommandExecuted((command) => {
    if (
      typeof command.id === 'string' &&
      command.id.startsWith('sheet.command.') &&
      !suppressEdits &&
      !notifiedThisLoad
    ) {
      notifiedThisLoad = true
      editListeners.forEach((cb) => cb())
    }
  })

  return {
    loadWorkbook: (data) => {
      workbook?.dispose()
      notifiedThisLoad = false
      suppressEdits = true
      workbook = univerAPI.createWorkbook(data)
      // Release suppression once the load's synchronous + immediate-async
      // mutations have flushed; genuine user edits arrive after this.
      setTimeout(() => {
        suppressEdits = false
      }, 0)
    },
    snapshot: () => workbook?.save() ?? null,
    onEdit: (cb) => {
      editListeners.push(cb)
    },
    destroy: () => {
      editListeners = []
      commandSub.dispose()
      workbook?.dispose()
      univer.dispose()
    },
  }
}
