import { create } from 'zustand'

type NotepadState = {
  editorMap: Record<string, string> // windowId -> filePath
  setEditor: (windowId: string, path: string) => void
  clearEditor: (windowId: string) => void
}

export const useNotepadStore = create<NotepadState>((set) => ({
  editorMap: {},
  setEditor: (windowId, path) =>
    set((state) => ({
      editorMap: { ...state.editorMap, [windowId]: path },
    })),
  clearEditor: (windowId) =>
    set((state) => {
      const { [windowId]: _, ...rest } = state.editorMap
      return { editorMap: rest }
    }),
}))
