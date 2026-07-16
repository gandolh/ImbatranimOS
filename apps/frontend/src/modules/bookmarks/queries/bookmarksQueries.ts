import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  createGroup,
  createLink,
  deleteGroup,
  deleteLink,
  fetchGroups,
  updateGroup,
  updateLink,
} from '../api/bookmarksApi'

const groupsKey = ['bookmarks', 'groups'] as const

export function useBookmarkGroupsQuery() {
  return useQuery({
    queryKey: groupsKey,
    queryFn: fetchGroups,
  })
}

export function useCreateGroupMutation() {
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}

export function useUpdateGroupMutation() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; icon?: string } }) =>
      updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}

export function useDeleteGroupMutation() {
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}

export function useCreateLinkMutation() {
  return useMutation({
    mutationFn: createLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}

export function useUpdateLinkMutation() {
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: { title?: string; href?: string; icon?: string }
    }) => updateLink(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}

export function useDeleteLinkMutation() {
  return useMutation({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey })
    },
  })
}
