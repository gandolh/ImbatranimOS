import { api } from '@imbatranim/core'
import type { CommitResponse, DiffResponse, LogResponse, StatusResponse } from '../types'

// Wired against the backend GitModule contract (all authed by the global guard):
//   GET  /api/git/status?root=&path=
//   GET  /api/git/log?root=&path=&limit=
//   GET  /api/git/diff?root=&path=&staged=&file=
//   POST /api/git/stage    { root, path?, paths[] }
//   POST /api/git/unstage  { root, path?, paths[] }
//   POST /api/git/commit   { root, path?, message }

export async function fetchStatus(root: string, path: string): Promise<StatusResponse> {
  const res = await api.get<StatusResponse>('/git/status', { params: { root, path } })
  return res.data
}

export async function fetchLog(root: string, path: string, limit = 30): Promise<LogResponse> {
  const res = await api.get<LogResponse>('/git/log', { params: { root, path, limit } })
  return res.data
}

export async function fetchDiff(
  root: string,
  path: string,
  staged: boolean,
  file?: string
): Promise<DiffResponse> {
  const res = await api.get<DiffResponse>('/git/diff', {
    params: { root, path, staged, file },
  })
  return res.data
}

export async function stagePaths(
  root: string,
  path: string,
  paths: string[]
): Promise<StatusResponse> {
  const res = await api.post<StatusResponse>('/git/stage', { root, path, paths })
  return res.data
}

export async function unstagePaths(
  root: string,
  path: string,
  paths: string[]
): Promise<StatusResponse> {
  const res = await api.post<StatusResponse>('/git/unstage', { root, path, paths })
  return res.data
}

export async function commit(root: string, path: string, message: string): Promise<CommitResponse> {
  const res = await api.post<CommitResponse>('/git/commit', { root, path, message })
  return res.data
}
