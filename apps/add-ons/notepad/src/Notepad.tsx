import { useEffect, useRef } from 'react'
import { FileBrowser } from './components/FileBrowser'
import { NoteEditor } from './components/NoteEditor'
import { useNotepadStore } from './store/notepadStore'
import { useUpsertRecentMutation } from './queries/notepadQueries'
import { useWindowStore } from '@imbatranim/core'
import { useIntentStore } from '@imbatranim/core'

export function Notepad({ windowId }: { windowId: string }) {
  const filePath = useNotepadStore((s) => s.editorMap[windowId])
  const setEditor = useNotepadStore((s) => s.setEditor)
  const clearEditor = useNotepadStore((s) => s.clearEditor)
  const openWindow = useWindowStore((s) => s.openWindow)
  const upsertRecent = useUpsertRecentMutation()

  // Drain the one-shot open intent exactly once in a ref-guarded effect — never
  // in a render selector, because StrictMode double-renders would drain it twice
  // and open-from-Files would arrive empty.
  const consumedRef = useRef(false)
  useEffect(() => {
    if (consumedRef.current) return
    consumedRef.current = true
    const intent = useIntentStore.getState().consumeIntent(windowId) as
      | { openPath?: string }
      | undefined
    if (intent?.openPath && !filePath) {
      setEditor(windowId, intent.openPath)
      upsertRecent.mutate(intent.openPath)
    }
  }, [windowId, filePath, setEditor, upsertRecent])

  function handleOpenFile(path: string, inNewWindow: boolean = true) {
    upsertRecent.mutate(path)

    if (inNewWindow) {
      const newWindowId = openWindow(
        'notepad',
        path.split('/').pop() || 'Notepad',
        { width: 600, height: 500 },
        { width: 400, height: 300 }
      )
      setEditor(newWindowId, path)
    } else {
      setEditor(windowId, path)
    }
  }

  if (filePath) {
    return <NoteEditor path={filePath} onBack={() => clearEditor(windowId)} />
  }

  return <FileBrowser onOpenFile={(path) => handleOpenFile(path, true)} />
}
