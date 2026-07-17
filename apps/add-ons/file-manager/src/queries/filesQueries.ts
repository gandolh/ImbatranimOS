import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  copyEntry,
  createDirectory,
  deleteEntry,
  listDirectory,
  moveEntry,
  readContent,
  uploadFile,
  writeContent,
} from '../api/filesApi'

export function fsListKey(root: string, path: string) {
  return ['fs-list', root, path] as const
}

export function useDirectoryQuery(root: string, path: string) {
  return useQuery({
    queryKey: fsListKey(root, path),
    queryFn: () => listDirectory(root, path),
  })
}

export function fsPreviewContentKey(root: string, path: string) {
  return ['fs-preview-content', root, path] as const
}

/**
 * Text/code preview content. Keyed per-path so switching the selection never
 * shows another file's content — react-query just resolves the previous
 * in-flight request into its own (now-inactive) cache entry instead of
 * overwriting what's on screen.
 */
export function usePreviewContentQuery(root: string, path: string | null, enabled: boolean) {
  return useQuery({
    queryKey: fsPreviewContentKey(root, path ?? ''),
    queryFn: () => readContent(root, path as string),
    enabled: enabled && path !== null,
    staleTime: 30_000,
  })
}

export function useCreateDirectoryMutation(root: string, path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (folderName: string) => {
      const fullPath = path ? `${path}/${folderName}` : folderName
      return createDirectory(root, fullPath)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, path) })
    },
  })
}

export function useDeleteEntryMutation(root: string, currentPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryPath: string) => deleteEntry(root, entryPath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) })
    },
  })
}

export function useMoveEntryMutation(root: string, currentPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moveEntry(root, from, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) })
    },
  })
}

export function useCopyEntryMutation(root: string, currentPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => copyEntry(root, from, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) })
    },
  })
}

export function useWriteContentMutation(root: string, currentPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      writeContent(root, path, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) })
    },
  })
}

export function useUploadFileMutation(root: string, currentPath: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, file }: { path: string; file: File }) => uploadFile(root, path, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fsListKey(root, currentPath) })
    },
  })
}
