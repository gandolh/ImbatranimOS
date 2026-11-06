import { api } from '../lib/axios'

/** The running copy a file is given to: its app, and its window's id (or a windowless copy's). */
export type GrantTarget = { appId: string; instanceId: string }

/** What the OS's dialogs say they give: a file (which may not exist yet, a Save as) or a folder. */
export type GrantExpect = 'file' | 'folder'

/** The grants each running copy is still waiting on, by instance id. */
const pending = new Map<string, Set<Promise<void>>>()

/**
 * Give a running copy of an app a file or a folder: the OS's half of the
 * backend's grant table (`/api/files/grants`). An app sees the user's files
 * only as they are given to it, by an open the OS makes (Files, Start's
 * recent files, Open With) or by a pick in the OS's dialog.
 *
 * The call goes out as the user, through the shared client: the OS gives it.
 * Made with the app's own token it would be the app handing on what it
 * holds, which the backend refuses for anything the app doesn't hold yet.
 *
 * Never rejects. A grant that fails leaves the app refused with a 403 that
 * names the path, which it shows; the open itself goes ahead.
 */
export function grantFile(
  target: GrantTarget,
  given: { root: string; path: string },
  expect?: GrantExpect
): Promise<void> {
  const body: Record<string, string> = {
    instanceId: target.instanceId,
    appId: target.appId,
    root: given.root,
    path: given.path,
  }
  if (expect !== undefined) body.expect = expect
  const call: Promise<void> = Promise.resolve()
    .then(() => api.post('/files/grants', body))
    .then(
      () => undefined,
      (err: unknown) => {
        console.warn(`[system] ${target.appId} was not given ${given.root}:${given.path}`, err)
      }
    )
  let waiting = pending.get(target.instanceId)
  if (!waiting) {
    waiting = new Set()
    pending.set(target.instanceId, waiting)
  }
  waiting.add(call)
  void call.finally(() => {
    waiting.delete(call)
    if (waiting.size === 0 && pending.get(target.instanceId) === waiting) {
      pending.delete(target.instanceId)
    }
  })
  return call
}

/**
 * Resolves once every grant made so far for this copy has settled. Its calls
 * wait on it, so an app that reads the file it was opened with as it mounts
 * finds the grant already made.
 */
export function grantsSettled(instanceId: string): Promise<void> {
  const waiting = pending.get(instanceId)
  if (!waiting || waiting.size === 0) return Promise.resolve()
  return Promise.all(waiting).then(() => undefined)
}
