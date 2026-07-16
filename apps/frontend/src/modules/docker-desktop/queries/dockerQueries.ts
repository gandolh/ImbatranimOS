import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  fetchContainers,
  fetchLogs,
  restartContainer,
  removeContainer,
  startContainer,
  stopContainer,
} from '../api/dockerApi'

export function useContainersQuery() {
  return useQuery({
    queryKey: ['docker', 'containers'],
    queryFn: fetchContainers,
    refetchInterval: 5000,
  })
}

export function useContainerLogsQuery(id: string | null) {
  return useQuery({
    queryKey: ['docker', 'logs', id],
    queryFn: () => fetchLogs(id!),
    enabled: !!id,
    refetchInterval: 3000,
  })
}

export function useStartContainerMutation() {
  return useMutation({
    mutationFn: startContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers'] })
    },
  })
}

export function useStopContainerMutation() {
  return useMutation({
    mutationFn: stopContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers'] })
    },
  })
}

export function useRestartContainerMutation() {
  return useMutation({
    mutationFn: restartContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers'] })
    },
  })
}

export function useRemoveContainerMutation() {
  return useMutation({
    mutationFn: removeContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker', 'containers'] })
    },
  })
}
