import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAbout, fetchProcesses, fetchStats, killProcess } from '../api/systemApi'

// 1–2s poll cadence lives here (react-query), per Brief 13 — backend endpoints
// stay cheap + stateless (aside from a small CPU-delta cache).
const POLL_MS = 1500

export const systemStatsKey = ['system-monitor', 'stats'] as const
export const systemProcessesKey = ['system-monitor', 'processes'] as const
export const systemAboutKey = ['system-monitor', 'about'] as const

export function useSystemStats() {
  return useQuery({
    queryKey: systemStatsKey,
    queryFn: fetchStats,
    refetchInterval: POLL_MS,
  })
}

export function useSystemProcesses(enabled = true) {
  return useQuery({
    queryKey: systemProcessesKey,
    queryFn: fetchProcesses,
    // Only poll while the processes tab is visible; otherwise the backend
    // spawns a `ps` child process every POLL_MS for a list nobody's viewing.
    refetchInterval: enabled ? POLL_MS : false,
    enabled,
  })
}

export function useSystemAbout() {
  return useQuery({
    queryKey: systemAboutKey,
    queryFn: fetchAbout,
    staleTime: Infinity, // hostname/kernel/version don't change during a session
  })
}

export function useKillProcessMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, signal }: { pid: number; signal?: string }) => killProcess(pid, signal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: systemProcessesKey })
    },
  })
}
