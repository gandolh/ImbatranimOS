import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  createConfig,
  deleteConfig,
  fetchConfigs,
  updateConfig,
} from '../api/replApi'
import type { ReplConfig } from '../types'

const configsKey = ['repl', 'configs'] as const

export function useReplConfigsQuery() {
  return useQuery({
    queryKey: configsKey,
    queryFn: fetchConfigs,
  })
}

export function useCreateConfigMutation() {
  return useMutation({
    mutationFn: createConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configsKey }),
  })
}

export function useUpdateConfigMutation() {
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Partial<Omit<ReplConfig, 'id' | 'created_at'>>
    }) => updateConfig(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configsKey }),
  })
}

export function useDeleteConfigMutation() {
  return useMutation({
    mutationFn: deleteConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configsKey }),
  })
}
