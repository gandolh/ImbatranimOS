import { api } from '../../../lib/axios'

export interface AuthStatus {
  needsSetup: boolean
  authenticated: boolean
  totpEnabled: boolean
}

export interface TotpEnrollment {
  secret: string
  uri: string
  qrDataUrl: string
}

export async function getStatus(): Promise<AuthStatus> {
  const res = await api.get<AuthStatus>('/auth/status')
  return res.data
}

export async function setupPassword(password: string): Promise<void> {
  await api.post('/auth/setup', { password })
}

export async function login(password: string, token?: string): Promise<void> {
  await api.post('/auth/login', { password, ...(token ? { token } : {}) })
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function enrollTotp(): Promise<TotpEnrollment> {
  const res = await api.post<TotpEnrollment>('/auth/totp/enroll')
  return res.data
}

export async function enableTotp(token: string): Promise<void> {
  await api.post('/auth/totp/enable', { token })
}

export async function disableTotp(password: string): Promise<void> {
  await api.post('/auth/totp/disable', { password })
}
