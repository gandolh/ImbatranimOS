/** Best-effort human message from an axios-style error without importing axios. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as {
      response?: { data?: { message?: unknown } }
      message?: unknown
    }
    const apiMsg = anyErr.response?.data?.message
    if (typeof apiMsg === 'string') return apiMsg
    if (Array.isArray(apiMsg) && typeof apiMsg[0] === 'string') return apiMsg[0]
    if (typeof anyErr.message === 'string') return anyErr.message
  }
  return fallback
}
