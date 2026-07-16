import { api } from '../../../lib/axios'
import type { DockerContainer } from '../types'

export async function fetchContainers(): Promise<DockerContainer[]> {
  const res = await api.get<DockerContainer[]>('/docker/containers')
  return res.data
}

export async function startContainer(id: string): Promise<void> {
  await api.post(`/docker/containers/${id}/start`)
}

export async function stopContainer(id: string): Promise<void> {
  await api.post(`/docker/containers/${id}/stop`)
}

export async function restartContainer(id: string): Promise<void> {
  await api.post(`/docker/containers/${id}/restart`)
}

export async function removeContainer(id: string): Promise<void> {
  await api.delete(`/docker/containers/${id}`)
}

export async function fetchLogs(id: string, limit: number = 200): Promise<string> {
  const res = await api.get<string>(`/docker/containers/${id}/logs`, { params: { limit } })
  return res.data
}
