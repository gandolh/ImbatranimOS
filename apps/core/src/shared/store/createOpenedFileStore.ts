import { create, type UseBoundStore, type StoreApi } from 'zustand'

export type OpenedFile = { root: string; path: string }

/**
 * windowId → the file that window is editing. The open payload is latched here
 * (a zustand setter, not React setState) so consuming the one-shot intent
 * happens outside React's render/effect state churn — the same pattern the
 * viewers use, and StrictMode-safe.
 */
type OpenedFileState = {
  fileMap: Record<string, OpenedFile>
  setFile: (windowId: string, file: OpenedFile) => void
  clearFile: (windowId: string) => void
}

/**
 * Build a fresh, isolated opened-file store. Each add-on (or the shared
 * {@link useOpenIntent} hook) owns exactly one instance so their per-window
 * file maps never collide.
 */
export function createOpenedFileStore(): UseBoundStore<StoreApi<OpenedFileState>> {
  return create<OpenedFileState>((set) => ({
    fileMap: {},
    setFile: (windowId, file) =>
      set((state) => ({ fileMap: { ...state.fileMap, [windowId]: file } })),
    clearFile: (windowId) =>
      set((state) => {
        const { [windowId]: _, ...rest } = state.fileMap
        return { fileMap: rest }
      }),
  }))
}
