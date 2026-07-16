import { useEffect } from 'react'
import { FileBrowser } from './components/FileBrowser'
import { NoteEditor } from './components/NoteEditor'
import { useNotepadStore } from './store/notepadStore'
import { useUpsertRecentMutation } from './queries/notepadQueries'
import { useWindowStore } from '../../shared/store/windowStore'
import { useIntentStore } from '../../shared/store/intentStore'

export function Notepad({ windowId }: { windowId: string }) {
  const intent = useIntentStore((s) => s.consumeIntent(windowId)) as
    | { openPath?: string }
    | undefined
  const filePath = useNotepadStore((s) => s.editorMap[windowId])
  const setEditor = useNotepadStore((s) => s.setEditor)
  const clearEditor = useNotepadStore((s) => s.clearEditor)
  const openWindow = useWindowStore((s) => s.openWindow)
  const upsertRecent = useUpsertRecentMutation()

  useEffect(() => {
    if (intent?.openPath && !filePath) {
      setEditor(windowId, intent.openPath)
      upsertRecent.mutate(intent.openPath)
    }
  }, [intent, filePath, windowId, setEditor, upsertRecent])

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
