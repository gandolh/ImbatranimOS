import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** One MRU entry — enough to re-open via the same `openInTab(root, path)` path. */
export type RecentFile = {
  root: string
  path: string
  name: string
}

/** Short MRU, most-recent-first — matches the brief's "~last 10" ask. */
const MAX_RECENT = 10

type RecentFilesStore = {
  recent: RecentFile[]
  /** Push to front, de-duped by `{root, path}`, capped at {@link MAX_RECENT}. */
  addRecent: (file: RecentFile) => void
  /** Drop one entry — used when a listed file can no longer be opened. */
  removeRecent: (root: string, path: string) => void
  clearRecent: () => void
}

/**
 * Client-persisted "Open Recent" list for the code editor, following the same
 * `zustand` + `persist` convention as the other add-on stores (e.g. Clock's
 * `useClockStore`).
 */
export const useRecentFilesStore = create<RecentFilesStore>()(
  persist(
    (set) => ({
      recent: [],
      addRecent: (file) =>
        set((s) => ({
          recent: [
            file,
            ...s.recent.filter((r) => !(r.root === file.root && r.path === file.path)),
          ].slice(0, MAX_RECENT),
        })),
      removeRecent: (root, path) =>
        set((s) => ({
          recent: s.recent.filter((r) => !(r.root === root && r.path === path)),
        })),
      clearRecent: () => set({ recent: [] }),
    }),
    { name: 'imbatranimos:code-editor-recent' }
  )
)
