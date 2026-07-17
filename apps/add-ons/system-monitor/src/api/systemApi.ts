import { api } from '@imbatranim/core'

// Mirrors apps/backend/src/modules/system/system.service.ts response shapes.

export type CpuStats = {
  percent: number
  cores: number
}

export type MemoryStats = {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  percent: number
}

export type DiskStats = {
  path: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  percent: number
}

export type SystemStats = {
  cpu: CpuStats
  memory: MemoryStats
  disk: DiskStats
}

export type ProcessInfo = {
  pid: number
  uid: number
  name: string
  cpuPercent: number
  memPercent: number
  memBytes: number
}

export type AboutInfo = {
  hostname: string
  kernel: string
  platform: string
  arch: string
  uptimeSeconds: number
  imageVersion: string
}

export type KillResult = {
  pid: number
  signaled: boolean
}

export async function fetchStats(): Promise<SystemStats> {
  const res = await api.get<SystemStats>('/system/stats')
  return res.data
}

export async function fetchProcesses(): Promise<ProcessInfo[]> {
  const res = await api.get<ProcessInfo[]>('/system/processes')
  return res.data
}

export async function fetchAbout(): Promise<AboutInfo> {
  const res = await api.get<AboutInfo>('/system/about')
  return res.data
}

export async function killProcess(pid: number, signal?: string): Promise<KillResult> {
  const res = await api.post<KillResult>(`/system/processes/${pid}/kill`, signal ? { signal } : {})
  return res.data
}
