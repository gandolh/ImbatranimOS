import { api } from '@imbatranim/core'
import type { HttpMethod, ProxyResponse } from '../types'

/**
 * Send a request through the authed backend proxy. The browser cannot fetch
 * arbitrary origins directly (CSP `connect-src` is same-origin + CORS), so the
 * request is relayed by POST /api/http/request, which returns the response with
 * a base64-encoded body. All SSRF guardrails live server-side.
 */
export async function sendProxyRequest(input: {
  method: HttpMethod
  url: string
  headers?: Record<string, string>
  body?: string
}): Promise<ProxyResponse> {
  const res = await api.post<ProxyResponse>('/http/request', input)
  return res.data
}
