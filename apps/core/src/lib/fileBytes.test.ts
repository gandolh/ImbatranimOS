// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { FileConflictError, UploadTooLargeError } from '@imbatranim/ui'
import { api } from './axios'
import { fetchFileBytesWithVersion, uploadFileBytes } from './fileBytes'

/** Brief 155 — the version token rides every read and save of `system.fs`. */

type Scripted = { status: number; data?: unknown; headers?: Record<string, string> }

let script: Scripted
let seen: InternalAxiosRequestConfig | null
const original = api.defaults.adapter

const respond: AxiosAdapter = async (config) => {
  seen = config
  const response: AxiosResponse = {
    data: script.data ?? {},
    status: script.status,
    statusText: String(script.status),
    headers: script.headers ?? {},
    config,
  }
  if (script.status >= 400) {
    throw Object.assign(new Error(`Request failed with status code ${script.status}`), {
      config,
      response,
      isAxiosError: true,
    })
  }
  return response
}

beforeEach(() => {
  seen = null
  api.defaults.adapter = respond
})

afterEach(() => {
  api.defaults.adapter = original
})

describe('fetchFileBytesWithVersion', () => {
  it('returns the bytes and the X-File-Version header', async () => {
    script = { status: 200, data: new ArrayBuffer(3), headers: { 'x-file-version': '17-3' } }
    const { bytes, version } = await fetchFileBytesWithVersion('home', 'a.txt')
    expect(bytes.byteLength).toBe(3)
    expect(version).toBe('17-3')
  })

  it('is null when the backend sent no version', async () => {
    script = { status: 200, data: new ArrayBuffer(0) }
    expect((await fetchFileBytesWithVersion('home', 'a.txt')).version).toBeNull()
  })
})

describe('uploadFileBytes', () => {
  const form = () => seen!.data as FormData

  it('sends the expected token and resolves the new version', async () => {
    script = { status: 201, data: { path: 'a.txt', version: '18-4' } }
    const written = await uploadFileBytes('home', 'a.txt', new Uint8Array(4), 'a.txt', {
      expected: '17-3',
    })
    expect(form().get('expected')).toBe('17-3')
    expect(written.version).toBe('18-4')
  })

  it('sends no token when none is expected', async () => {
    script = { status: 201, data: { path: 'a.txt', version: '18-4' } }
    await uploadFileBytes('home', 'a.txt', new Uint8Array(4), 'a.txt')
    expect(form().has('expected')).toBe(false)
  })

  it('maps a 409 to FileConflictError carrying the current version', async () => {
    script = { status: 409, data: { statusCode: 409, current: '19-9' } }
    const err = await uploadFileBytes('home', 'a.txt', new Uint8Array(1), 'a.txt', {
      expected: '17-3',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FileConflictError)
    expect((err as FileConflictError).current).toBe('19-9')
  })

  it('a 409 for a file that is gone carries a null current', async () => {
    script = { status: 409, data: { statusCode: 409, current: null } }
    const err = await uploadFileBytes('home', 'a.txt', new Uint8Array(1), 'a.txt', {
      expected: '17-3',
    }).catch((e: unknown) => e)
    expect((err as FileConflictError).current).toBeNull()
  })

  it('still maps a 413 to UploadTooLargeError', async () => {
    script = { status: 413 }
    await expect(
      uploadFileBytes('home', 'a.txt', new Uint8Array(1), 'a.txt')
    ).rejects.toBeInstanceOf(UploadTooLargeError)
  })
})
