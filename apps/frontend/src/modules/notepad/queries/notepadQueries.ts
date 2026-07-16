import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  createDirectory,
  createFile,
  deleteDirectory,
  deleteFile,
  fetchNotes,
  fetchRecent,
  readFile,
  updateFile,
  upsertRecent,
} from '../api/notepadApi'

export function useNotesQuery(path: string = '') {
  return useQuery({
    queryKey: ['notes', 'list', path],
    queryFn: () => fetchNotes(path),
  })
}

export function useNoteFileQuery(path: string | undefined) {
  return useQuery({
    queryKey: ['notes', 'file', path],
    queryFn: () => readFile(path!),
    enabled: !!path,
  })
}

export function useRecentFilesQuery() {
  return useQuery({
    queryKey: ['notes', 'recent'],
    queryFn: fetchRecent,
  })
}

export function useCreateFileMutation() {
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content?: string }) => createFile(path, content),
    onSuccess: (_) => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
    },
  })
}

export function useUpdateFileMutation() {
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => updateFile(path, content),
    onSuccess: (data) => {
      queryClient.setQueryData(['notes', 'file', data.path], data)
    },
  })
}

export function useDeleteFileMutation() {
  return useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['notes', 'recent'] })
    },
  })
}

export function useCreateDirectoryMutation() {
  return useMutation({
    mutationFn: createDirectory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
    },
  })
}

export function useDeleteDirectoryMutation() {
  return useMutation({
    mutationFn: deleteDirectory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
    },
  })
}

export function useUpsertRecentMutation() {
  return useMutation({
    mutationFn: upsertRecent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', 'recent'] })
    },
  })
}
