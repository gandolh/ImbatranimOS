import { api } from '../../../lib/axios'
import type { ReplConfig } from '../types'

export async function fetchConfigs(): Promise<ReplConfig[]> {
  const res = await api.get<ReplConfig[]>('/repl/configs')
  return res.data
}

export async function createConfig(
  data: Omit<ReplConfig, 'id' | 'created_at'>,
): Promise<ReplConfig> {
  const res = await api.post<ReplConfig>('/repl/configs', data)
  return res.data
}

export async function updateConfig(
  id: number,
  data: Partial<Omit<ReplConfig, 'id' | 'created_at'>>,
): Promise<ReplConfig> {
  const res = await api.patch<ReplConfig>(`/repl/configs/${id}`, data)
  return res.data
}

export async function deleteConfig(id: number): Promise<void> {
  await api.delete(`/repl/configs/${id}`)
}

export async function createSession(configId: number): Promise<{ sessionId: string }> {
  const res = await api.post<{ sessionId: string }>('/repl/sessions', { configId })
  return res.data
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/repl/sessions/${sessionId}`)
}

export async function sendInput(
  sessionId: string,
  command: string,
): Promise<{ output: string }> {
  const res = await api.post<{ output: string }>(`/repl/sessions/${sessionId}/input`, {
    command,
  })
  return res.data
}
