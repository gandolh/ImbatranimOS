import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  createStickyNote,
  deleteStickyNote,
  fetchStickyNotes,
  updateStickyNote,
} from '../api/stickyNotesApi'

const QUERY_KEY = ['sticky-notes'] as const

export function useStickyNotesQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchStickyNotes,
  })
}

export function useCreateStickyNoteMutation() {
  return useMutation({
    mutationFn: createStickyNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useUpdateStickyNoteMutation() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ content: string; pos_x: number; pos_y: number }> }) =>
      updateStickyNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useDeleteStickyNoteMutation() {
  return useMutation({
    mutationFn: (id: number) => deleteStickyNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
