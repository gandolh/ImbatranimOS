import { create } from 'zustand'

type StickyNoteEditorStore = {
  // windowId -> noteId
  editorMap: Record<string, number>
  setEditor: (windowId: string, noteId: number) => void
  clearEditor: (windowId: string) => void
}

export const useStickyNoteEditorStore = create<StickyNoteEditorStore>((set) => ({
  editorMap: {},
  setEditor: (windowId, noteId) =>
    set((s) => ({ editorMap: { ...s.editorMap, [windowId]: noteId } })),
  clearEditor: (windowId) =>
    set((s) => {
      const { [windowId]: _removed, ...rest } = s.editorMap
      return { editorMap: rest }
    }),
}))
