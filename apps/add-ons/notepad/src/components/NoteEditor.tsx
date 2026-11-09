import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Link2, Loader2, PanelLeft, Save, Unlink2, WrapText } from 'lucide-react'
import {
  Button,
  cn,
  FileConflictError,
  fileName,
  reportFileFailure,
  ScrollArea,
  Tooltip,
  UploadTooLargeError,
  useElementSize,
  useFileConflict,
  useSaveHotkey,
  useSystem,
  useUnsavedGuard,
} from '@imbatranim/ui'
import { useNoteFileQuery, useUpdateFileMutation } from '../queries/notepadQueries'
import { useNotepadStore, type OpenDoc } from '../store/notepadStore'
import { FindBar } from './FindBar'
import { FormatToolbar } from './FormatToolbar'
import { MarkdownPreview } from './MarkdownPreview'
import { Outline } from './Outline'
import { SplitDivider } from './SplitDivider'
import { useLineTops } from '../hooks/useLineTops'
import { useScrollSync } from '../hooks/useScrollSync'
import { useMarkdownView } from '../store/markdownViewStore'
import { defaultViewMode, isMarkdownFile, VIEW_MODE_OPTIONS, type ViewMode } from '../lib/viewMode'
import { applyFormat, keyToFormat, type FormatKind } from '../lib/formatActions'
import { caretLineOf, IMAGE_EXTENSIONS } from '../lib/editorText'
import { baseName, linkTarget } from '../lib/linkTarget'
import { parseHeadings } from '../lib/outline'
import { toggleTaskAtLine } from '../lib/markdownMarkers'
import {
  assetDir,
  dirOf,
  extensionForMime,
  imageMarkdown,
  relativeFrom,
  safeBaseName,
  uniqueName,
} from '../lib/assetPaths'
import {
  caretPosition,
  findMatches,
  matchIndexFrom,
  minimalEdit,
  replaceAll,
  replaceRange,
  textStats,
} from '../lib/findReplace'

type FsEntry = { name: string; path: string; type: 'file' | 'directory' }

/** The HTTP status a failed call came back with, if any. */
function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status
}

/**
 * The editor.
 *
 * ## Explicit save, not autosave
 *
 * This app used to write on a 1-second debounce after every keystroke, with **no
 * dirty marker, no Ctrl+S and no close guard**. The one-filesystem notepad lists the save spine under
 * "must preserve" and calls autosave "rejected" — but Notepad was the autosaving app,
 * so the brief's non-change was in fact its largest one.
 *
 * Explicit save now, matching the other editors: `useUnsavedGuard` for the dirty `•` and the close prompt, `useSaveHotkey`
 * for Ctrl+S. That is the right way round — there is no version history and no undo
 * across a reload, so a debounce meant a stray keystroke reached disk in one second
 * with nothing to recover from.
 */
export function NoteEditor({
  windowId,
  doc,
  onBack,
}: {
  windowId: string
  doc: OpenDoc
  onBack: () => void
}) {
  const system = useSystem()
  const { root, path } = doc
  // A new file isn't on disk yet, and Notepad isn't given it until its first
  // save picks a place: nothing to read.
  const {
    data: file,
    isLoading,
    isError,
    refetch,
  } = useNoteFileQuery(root, doc.isNew ? undefined : path)
  const updateMutation = useUpdateFileMutation()

  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  // The version of `savedContent` on disk, sent with every save.
  // Tied to the baseline, not to the latest read: a refetch that is not adopted
  // (unsaved edits) must not move it, or the next save would overwrite blind.
  const [savedVersion, setSavedVersion] = useState<string | null>(null)
  // Markdown files open split, everything else in the editor. The split view, the
  // outline, the format toolbar and image insertion belong to Markdown files; any file
  // can still be previewed as Markdown.
  const markdown = isMarkdownFile(path)
  const [mode, setMode] = useState<ViewMode>(() => defaultViewMode(path))
  const { settings, update, dragRatio, commitRatio } = useMarkdownView()
  const [imageBusy, setImageBusy] = useState(false)
  // Elements the sync hooks measure, held as state: a ref's `.current` does not re-run an
  // effect when the node attaches, and the panes mount after the file has loaded.
  const [editorEl, setEditorEl] = useState<HTMLTextAreaElement | null>(null)
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null)
  const attachPreview = useCallback((el: HTMLDivElement | null) => setPreviewEl(el), [])
  const [paneBox, attachPanes] = useElementSize()
  const [wrap, setWrap] = useState(true)
  const [caret, setCaret] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [findOpen, setFindOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchIndex, setMatchIndex] = useState(0)

  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const attachEditor = useCallback((el: HTMLTextAreaElement | null) => {
    textRef.current = el
    setEditorEl(el)
  }, [])
  const findInputRef = useRef<HTMLInputElement>(null)

  // Load a (re)fetched file into the draft. Render-time adjustment rather than an
  // effect — React's documented "adjust state when a prop changes" bail-out.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const key = `${root}:${path}`
  if (file && (loadedKey !== key || savedContent !== file.content)) {
    if (loadedKey !== key) {
      setLoadedKey(key)
      setContent(file.content)
      setSavedContent(file.content)
      setSavedVersion(file.version)
    } else if (savedContent !== file.content && content === savedContent) {
      // The file changed on disk and the user has no unsaved edits, so adopting it
      // is safe. With unsaved edits it is deliberately NOT adopted — silently
      // replacing what someone is typing is the worst possible resolution.
      setContent(file.content)
      setSavedContent(file.content)
      setSavedVersion(file.version)
    }
  }

  const dirty = content !== savedContent
  const { ask: askConflict, dialog: conflictDialog } = useFileConflict()

  const save = useCallback(async () => {
    if (!dirty || updateMutation.isPending) return
    const snapshot = content
    const name = fileName(path, 'note')
    setError(null)
    // A new file is placed in the Save dialog: the pick is what gives Notepad
    // the path, and the window then holds the file it saved.
    if (doc.isNew && savedVersion === null) {
      const choice = await system.fs.pickSave({
        title: 'Save as',
        suggestedName: name,
        startIn: { root, path: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' },
      })
      if (!choice) return
      const placed = {
        root: choice.root === 'notes' ? 'notes' : 'home',
        path: choice.path,
      } as const
      try {
        const written = await updateMutation.mutateAsync({ ...placed, content: snapshot })
        setSavedContent(snapshot)
        setSavedVersion(written.version)
        useNotepadStore.getState().setEditor(windowId, placed)
      } catch (err) {
        setError(reportFileFailure(system, 'save', err, { noun: 'note', name }))
      }
      return
    }
    const write = async (expected: string | undefined) => {
      const written = await updateMutation.mutateAsync({ root, path, content: snapshot, expected })
      // Only what was actually written becomes the new baseline. If the user typed
      // during the request, `content` has moved on and the document stays dirty.
      setSavedContent(snapshot)
      setSavedVersion(written.version)
    }
    try {
      try {
        await write(savedVersion ?? undefined)
      } catch (err) {
        if (!(err instanceof FileConflictError)) throw err
        const choice = await askConflict(name)
        if (choice === 'overwrite') await write(undefined)
        if (choice === 'reload') {
          const { data: fresh } = await refetch({ throwOnError: true })
          if (fresh) {
            setContent(fresh.content)
            setSavedContent(fresh.content)
            setSavedVersion(fresh.version)
          }
        }
      }
    } catch (err) {
      setError(reportFileFailure(system, 'save', err, { noun: 'note', name }))
    }
  }, [
    dirty,
    updateMutation,
    content,
    root,
    path,
    system,
    savedVersion,
    askConflict,
    refetch,
    doc.isNew,
    windowId,
  ])

  // The window and taskbar titles carry the filename and the dirty marker, and
  // closing with unsaved changes asks Save / Don't Save / Cancel — the same
  // themed spine every other editor uses.
  const unsavedDialog = useUnsavedGuard(dirty, fileName(path, 'note'), save)

  useSaveHotkey(save)

  // ── Find / replace ────────────────────────────────────────────────────────
  const matches = findMatches(content, query, caseSensitive)
  const current = matches[matchIndex] ?? null

  const select = useCallback((match: { start: number; end: number } | null) => {
    const el = textRef.current
    if (!el || !match) return
    el.focus()
    el.setSelectionRange(match.start, match.end)
    setCaret(match.end)
  }, [])

  const step = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return
      const from = textRef.current?.selectionStart ?? caret
      const next =
        current && direction === 1
          ? (matchIndex + 1) % matches.length
          : current && direction === -1
            ? (matchIndex - 1 + matches.length) % matches.length
            : matchIndexFrom(matches, from, direction)
      setMatchIndex(next)
      select(matches[next])
    },
    [matches, current, matchIndex, caret, select]
  )

  /**
   * Apply a whole-text rewrite through the browser's own editing pipeline rather
   * than a `value` assignment, so the native undo stack survives. `insertText` fires an `input` event that reaches
   * the textarea's `onChange`, so `content` still updates. If the command is
   * unavailable (older engines, tests) the state path is the fallback: worse
   * undo, identical text.
   */
  const applyEdit = useCallback((nextText: string, caretTo: number, caretEnd = caretTo) => {
    const el = textRef.current
    if (!el) {
      setContent(nextText)
      setCaret(caretTo)
      return
    }
    const edit = minimalEdit(el.value, nextText)
    el.focus()
    el.setSelectionRange(edit.start, edit.end)
    const handled = (() => {
      try {
        return edit.insert === ''
          ? document.execCommand('delete')
          : document.execCommand('insertText', false, edit.insert)
      } catch {
        return false
      }
    })()
    if (!handled) setContent(nextText)
    requestAnimationFrame(() => {
      el.setSelectionRange(caretTo, caretEnd)
      setCaret(caretTo)
    })
  }, [])

  // ── Markdown: formatting, images, outline, preview links ─────────────────
  const docDir = dirOf(path)
  const showEditor = mode === 'edit' || mode === 'split'
  const showPreview = mode === 'preview' || mode === 'split'
  const showOutline = markdown && settings.outlineOpen
  const syncing = markdown && settings.syncScroll && mode === 'split'
  // Parsed only when something reads it: a large log never pays for it while editing.
  const headings = useMemo(
    () => (showPreview || showOutline ? parseHeadings(content) : []),
    [content, showPreview, showOutline]
  )
  const lineTops = useLineTops(editorEl, content, syncing)
  useScrollSync({ editor: editorEl, preview: previewEl, lineTops, enabled: syncing })

  const applyFormatting = useCallback(
    (kind: FormatKind) => {
      const el = textRef.current
      if (!el) return
      const next = applyFormat(kind, el.value, { start: el.selectionStart, end: el.selectionEnd })
      applyEdit(next.text, next.start, next.end)
    },
    [applyEdit]
  )

  const insertAtCaret = useCallback(
    (snippet: string) => {
      const el = textRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const at = start + snippet.length
      applyEdit(el.value.slice(0, start) + snippet + el.value.slice(end), at)
    },
    [applyEdit]
  )

  /** Names already taken in a directory, plus whether it holds an `assets/` folder. */
  const readDirectory = useCallback(
    async (dirRoot: string, dirPath: string) => {
      const res = await system.http.get<FsEntry[]>('/files', {
        params: { root: dirRoot, path: dirPath },
      })
      return {
        names: res.data.map((entry) => entry.name),
        hasAssets: res.data.some((entry) => entry.type === 'directory' && entry.name === 'assets'),
      }
    },
    [system]
  )

  /**
   * Write the image into `assets/` beside the document under a free name, with no
   * dialog: opening the note from Files, Open With or a launcher (or picking it in the
   * Open or Save dialog) lets this window add files there, never write over one.
   * Null when the window wasn't given that folder (the note came by another app), or
   * lost it; the caller asks in the Save dialog instead.
   */
  const addToAssets = useCallback(
    async (bytes: ArrayBuffer, base: string, ext: string): Promise<string | null> => {
      const dir = assetDir(docDir)
      let taken: string[]
      try {
        taken = (await readDirectory(root, dir)).names
      } catch (err) {
        // Not there yet: the first image makes it.
        if (statusOf(err) === 404) taken = []
        else if (statusOf(err) === 403) return null
        else throw err
      }
      // A name taken since the listing (another window, the Terminal) is refused,
      // never written over: take the next one.
      for (let tries = 0; tries < 5; tries++) {
        const target = `${dir}/${uniqueName(taken, base, ext)}`
        try {
          await system.fs.upload(root, target, bytes, fileName(target))
          return target
        } catch (err) {
          if (err instanceof FileConflictError) {
            taken = [...taken, fileName(target)]
            continue
          }
          if (statusOf(err) === 403) return null
          throw err
        }
      }
      return null
    },
    [docDir, readDirectory, root, system]
  )

  /**
   * Today's way without the `assets/` folder to add to: the Save dialog, already at
   * the place and name worked out here, since a new file is the user's to give and the
   * pick is what gives it. Null when the user cancels or picks another root.
   */
  const saveInDialog = useCallback(
    async (bytes: ArrayBuffer, base: string, ext: string): Promise<string | null> => {
      const here = await readDirectory(root, docDir).catch(() => null)
      const targetDir = here?.hasAssets ? assetDir(docDir) : docDir
      const taken =
        targetDir === docDir
          ? (here?.names ?? [])
          : await readDirectory(root, targetDir).then(
              (d) => d.names,
              () => []
            )
      // The dialog opens in the folder (it can't open at a file not there
      // yet), with the worked-out name filled in; a clash is the dialog's to raise.
      const choice = await system.fs.pickSave({
        title: 'Save the image',
        suggestedName: uniqueName(taken, base, ext),
        startIn: { root, path: targetDir },
      })
      if (!choice) return null
      if (choice.root !== root) {
        system.notify({
          title: 'Could not add the image',
          body: 'Save it in the same place as the document: a link can’t reach another root.',
          level: 'error',
        })
        return null
      }
      await system.fs.upload(root, choice.path, bytes, fileName(choice.path))
      return choice.path
    },
    [docDir, readDirectory, root, system]
  )

  /**
   * Write an image beside the document and link it relatively, so the link still
   * works in git, in another editor, or on GitHub. A base64 data URI would be less
   * code and produce a document nothing else reads comfortably.
   */
  const attachImageBytes = useCallback(
    async (bytes: ArrayBuffer, suggestedName: string, mime: string) => {
      setImageBusy(true)
      try {
        const base = safeBaseName(suggestedName)
        const ext = extensionForMime(mime)
        const target =
          (await addToAssets(bytes, base, ext)) ?? (await saveInDialog(bytes, base, ext))
        if (target === null) return
        insertAtCaret(imageMarkdown(base, relativeFrom(docDir, target)))
        system.notify({
          title: 'Image added',
          body: `Written to ${target} and linked from the document.`,
          level: 'success',
        })
      } catch (err) {
        const tooLarge = err instanceof UploadTooLargeError
        if (!tooLarge) console.error('[notepad] failed to attach image', err)
        system.notify({
          title: 'Could not add the image',
          body: tooLarge
            ? 'The image is larger than the upload limit.'
            : 'Writing the file next to the document failed.',
          level: 'error',
        })
      } finally {
        setImageBusy(false)
      }
    },
    [addToAssets, docDir, insertAtCaret, saveInDialog, system]
  )

  const attachImageFile = useCallback(
    async (file: File) => attachImageBytes(await file.arrayBuffer(), file.name, file.type),
    [attachImageBytes]
  )

  /**
   * Insert an image already on this machine. Same root as the document: link it where
   * it lies. Different root: copy it in, because a relative link cannot cross roots.
   */
  const insertExistingImage = useCallback(async () => {
    const choice = await system.fs.pickOpen({
      title: 'Insert an image',
      extensions: [...IMAGE_EXTENSIONS],
    })
    if (!choice) return
    if (choice.root === root) {
      insertAtCaret(
        imageMarkdown(safeBaseName(fileName(choice.path)), relativeFrom(docDir, choice.path))
      )
      return
    }
    setImageBusy(true)
    try {
      const bytes = await system.fs.read(choice.root, choice.path)
      const chosenName = fileName(choice.path)
      const extension = chosenName.includes('.') ? chosenName.split('.').pop()! : 'png'
      await attachImageBytes(bytes, chosenName, `image/${extension === 'jpg' ? 'jpeg' : extension}`)
    } finally {
      setImageBusy(false)
    }
  }, [attachImageBytes, docDir, insertAtCaret, root, system])

  /** Scroll the editor so a heading is at the top, and put the caret on it. */
  const goToHeading = useCallback(
    (line: number, offset: number) => {
      const el = textRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(offset, offset)
        setCaret(offset)
        // `scrollTo`, not `scrollTop =`: assigning to a property of a value held in state
        // is what the immutability rule forbids.
        if (lineTops.length >= line) el.scrollTo({ top: lineTops[line - 1] })
      }
      // In preview-only mode there is no editor to scroll, and in split mode the sync hook
      // only reacts to a scroll event, so the preview is moved explicitly either way.
      previewEl?.querySelector<HTMLElement>(`[data-src-line="${line}"]`)?.scrollIntoView({
        block: 'start',
      })
    },
    [lineTops, previewEl]
  )

  const toggleTaskLine = useCallback(
    (line: number) => {
      const next = toggleTaskAtLine(content, line)
      if (next === content) return
      const el = textRef.current
      applyEdit(next, el?.selectionStart ?? caret, el?.selectionEnd ?? caret)
    },
    [applyEdit, caret, content]
  )

  /** A relative link clicked in the preview. */
  const openRelative = useCallback(
    (target: string) => {
      const opener = linkTarget(system.intents.associations, target)
      if (opener.kind === 'markdown') {
        system.intents.openApp('notepad', { openPath: target, root })
        return
      }
      if (opener.kind === 'app') {
        // openApp is the choke point that also records the OS-wide recent, so a link
        // followed from a document counts as opening it.
        system.intents.openApp(opener.appId, { openPath: target, root })
        return
      }
      system.notify({
        title: 'Cannot open this link',
        body: `Nothing in the system claims ${baseName(target)}.`,
        level: 'info',
      })
    },
    [root, system]
  )

  const doReplaceOne = useCallback(() => {
    if (!current) return
    const out = replaceRange(content, current, replacement)
    applyEdit(out.text, out.caret)
    // Clamp: the replacement may have removed later matches.
    setMatchIndex(0)
  }, [current, content, replacement, applyEdit])

  const doReplaceAll = useCallback(() => {
    const out = replaceAll(content, query, replacement, caseSensitive)
    if (out.count === 0) return
    applyEdit(out.text, Math.min(caret, out.text.length))
    setMatchIndex(0)
    // Reported, because "replace all" giving no feedback is indistinguishable from
    // it having done nothing.
    system.notify({
      title: 'Replaced',
      body: `${out.count} occurrence${out.count === 1 ? '' : 's'} of “${query}”`,
      level: 'info',
    })
  }, [content, query, replacement, caseSensitive, caret, applyEdit, system])

  const openFind = useCallback((withReplace: boolean) => {
    setFindOpen(true)
    if (withReplace) setShowReplace(true)
    // Seed from the selection, the way every editor does — select a word, Ctrl+F,
    // and it is already the query.
    const el = textRef.current
    if (el && el.selectionEnd > el.selectionStart) {
      setQuery(el.value.slice(el.selectionStart, el.selectionEnd))
      setMatchIndex(0)
    }
    requestAnimationFrame(() => findInputRef.current?.select())
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'f') {
      e.preventDefault()
      openFind(false)
    }
    if (k === 'h') {
      e.preventDefault()
      openFind(true)
    }
  }

  // Keep the caret readout live without re-rendering on every keystroke twice.
  const syncCaret = () => setCaret(textRef.current?.selectionStart ?? 0)

  const stats = textStats(content)
  const pos = caretPosition(content, caret)

  if (isLoading) {
    return (
      <div className="text-on-surface-variant flex h-full items-center justify-center gap-2 p-4 text-[12px]">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </div>
    )
  }
  // A brand-new file has nothing on disk yet, so its read misses — that is the
  // expected state, not a failure. Fall through to an empty draft; the file is
  // created on the first save. Only a read error on a file that was supposed to
  // exist is the dead-end worth showing (T1-9).
  if (isError && !doc.isNew) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <span className="text-error font-content text-[12px]">Could not open this file.</span>
        <Button variant="default" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div
      className="bg-surface-container-lowest flex h-full flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* toolbar */}
      <div className="border-outline-variant bg-surface-container-low flex h-10 shrink-0 items-center justify-between border-b px-3 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onBack}
            className="hover:bg-surface-container-high focus-visible:ring-primary p-1 outline-none focus-visible:ring-2 focus-visible:ring-inset"
            title="Close this file"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="truncate text-[12px] font-semibold" title={`${root}:/${path}`}>
            {fileName(path, 'note')}
            {dirty && ' •'}
          </span>
          {/* The root is shown, always. It is the whole point of this brief: you can
              see which filesystem you are editing. */}
          <span className="rounded-small border-outline-variant text-on-surface-variant shrink-0 border px-1 text-[9px] font-semibold tracking-wider uppercase">
            {root}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            className="flex h-6 items-center gap-1 px-2"
            disabled={!dirty || updateMutation.isPending}
            onClick={save}
          >
            {updateMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            Save
          </Button>
          <div
            className="border-outline-variant rounded-control flex items-center overflow-hidden border"
            role="group"
          >
            {VIEW_MODE_OPTIONS.filter((option) => markdown || option.mode !== 'split').map(
              (option) => (
                <Tooltip key={option.mode} content={option.label}>
                  <button
                    type="button"
                    onClick={() => setMode(option.mode)}
                    aria-pressed={mode === option.mode}
                    aria-label={option.label}
                    className={cn(
                      'focus-visible:ring-primary flex items-center p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset',
                      mode === option.mode
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface hover:bg-surface-container-high'
                    )}
                  >
                    <option.icon size={14} />
                  </button>
                </Tooltip>
              )
            )}
          </div>
          {markdown && (
            <Tooltip content={settings.outlineOpen ? 'Hide outline' : 'Show outline'}>
              <button
                type="button"
                aria-label="Outline"
                aria-pressed={settings.outlineOpen}
                onClick={() => update({ outlineOpen: !settings.outlineOpen })}
                className={cn(
                  'focus-visible:ring-primary rounded-control p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  settings.outlineOpen
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface hover:bg-surface-container-high'
                )}
              >
                <PanelLeft size={14} />
              </button>
            </Tooltip>
          )}
          {markdown && mode === 'split' && (
            <Tooltip content={settings.syncScroll ? 'Scroll sync is on' : 'Scroll sync is off'}>
              <button
                type="button"
                aria-label="Sync scrolling"
                aria-pressed={settings.syncScroll}
                onClick={() => update({ syncScroll: !settings.syncScroll })}
                className={cn(
                  'focus-visible:ring-primary rounded-control p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  settings.syncScroll
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface hover:bg-surface-container-high'
                )}
              >
                {settings.syncScroll ? <Link2 size={14} /> : <Unlink2 size={14} />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {findOpen && (
        <FindBar
          query={query}
          // The match cursor resets HERE, where the query actually changes, rather
          // than in an effect watching it — an effect that only mirrors a change
          // its own handler could have made is the cascading-render shape React's
          // `set-state-in-effect` rule exists to catch.
          onQueryChange={(value) => {
            setQuery(value)
            setMatchIndex(0)
          }}
          replacement={replacement}
          onReplacementChange={setReplacement}
          caseSensitive={caseSensitive}
          onToggleCase={() => {
            setCaseSensitive((v) => !v)
            setMatchIndex(0)
          }}
          showReplace={showReplace}
          onToggleReplace={() => setShowReplace((v) => !v)}
          matchCount={matches.length}
          currentMatch={matches.length === 0 ? 0 : matchIndex + 1}
          onNext={() => step(1)}
          onPrevious={() => step(-1)}
          onReplaceOne={doReplaceOne}
          onReplaceAll={doReplaceAll}
          onClose={() => {
            setFindOpen(false)
            setShowReplace(false)
            textRef.current?.focus()
          }}
          inputRef={findInputRef}
        />
      )}

      {error && (
        <div className="border-outline-variant bg-surface-container-low border-b px-3 py-1">
          <span className="font-ui text-error text-[11px]">{error}</span>
        </div>
      )}

      {markdown && showEditor && (
        <FormatToolbar
          onApply={applyFormatting}
          onInsertImage={() => void insertExistingImage()}
          imageBusy={imageBusy}
          disabled={!editorEl}
        />
      )}

      <div ref={attachPanes} className="relative flex min-h-0 flex-1 overflow-hidden">
        {showOutline && (
          <Outline
            headings={headings}
            activeLine={caretLineOf(content, caret)}
            onSelect={(heading) => goToHeading(heading.line, heading.offset)}
          />
        )}

        {/* Kept mounted (hidden) in preview-only mode, so the undo stack and the
            selection survive a trip to the preview. */}
        <div
          className={cn('min-h-0 min-w-0', !showEditor && 'hidden')}
          style={{ flex: `${showPreview ? settings.splitRatio : 1} 1 0%` }}
        >
          <textarea
            ref={attachEditor}
            className={cn(
              'focus-visible:ring-primary h-full w-full resize-none bg-transparent p-4 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset',
              // `whitespace-pre` + horizontal scroll is what "wrap off" means for a
              // log file; without it a 4000-character line is unreadable either way.
              wrap ? 'whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre'
            )}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setCaret(e.target.selectionStart)
            }}
            onKeyDown={(e) => {
              if (!markdown || !(e.ctrlKey || e.metaKey) || e.altKey) return
              const kind = keyToFormat(e)
              if (!kind) return
              e.preventDefault()
              // Load-bearing: the shell binds mod+K globally to the command palette on
              // `window`, so without this Ctrl+K inserted a link AND opened the palette.
              // React attaches at the root container, so stopping here keeps the event
              // from ever reaching the window listener.
              e.stopPropagation()
              applyFormatting(kind)
            }}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onSelect={syncCaret}
            onPaste={(e) => {
              if (!markdown) return
              const image = [...e.clipboardData.items].find((item) =>
                item.type.startsWith('image/')
              )
              const file = image?.getAsFile()
              if (!file) return
              e.preventDefault()
              void attachImageFile(file)
            }}
            onDragOver={(e) => {
              if (markdown && e.dataTransfer.types.includes('Files')) e.preventDefault()
            }}
            onDrop={(e) => {
              if (!markdown) return
              const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
              if (!file) return
              e.preventDefault()
              void attachImageFile(file)
            }}
            placeholder="Type here. Ctrl+S saves, Ctrl+F finds."
            spellCheck={false}
            wrap={wrap ? 'soft' : 'off'}
          />
        </div>

        {showEditor && showPreview && (
          <SplitDivider
            ratio={settings.splitRatio}
            containerWidth={paneBox.width}
            onDrag={dragRatio}
            onCommit={commitRatio}
          />
        )}

        {showPreview && (
          <div
            className="min-h-0 min-w-0"
            style={{ flex: `${showEditor ? 1 - settings.splitRatio : 1} 1 0%` }}
          >
            <ScrollArea className="h-full" viewportRef={attachPreview}>
              <MarkdownPreview
                text={content}
                root={root}
                docDir={docDir}
                headings={headings}
                onToggleTaskLine={toggleTaskLine}
                onOpenRelative={openRelative}
              />
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Status bar — the house recipe: line/col, counts, and the wrap toggle. */}
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex h-6 shrink-0 items-center gap-3 border-t px-3 font-mono text-[10px]">
        <span className="tabular-nums">
          Ln {pos.line}, Col {pos.column}
        </span>
        <span className="tabular-nums">{stats.lines} lines</span>
        <span className="tabular-nums">{stats.words} words</span>
        <span className="tabular-nums">{stats.chars} chars</span>
        <div className="flex-1" />
        <button
          onClick={() => setWrap((w) => !w)}
          aria-pressed={wrap}
          aria-label="Word wrap"
          title={wrap ? 'Word wrap on' : 'Word wrap off'}
          className={cn(
            'focus-visible:ring-primary flex items-center gap-1 px-1 outline-none focus-visible:ring-2 focus-visible:ring-inset',
            wrap ? 'text-on-surface' : 'text-on-surface-variant'
          )}
        >
          <WrapText size={11} />
          wrap {wrap ? 'on' : 'off'}
        </button>
      </div>

      {unsavedDialog}
      {conflictDialog}
    </div>
  )
}
