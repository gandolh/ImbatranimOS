import { lazy } from 'react'
import { Send } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { APP_NAME } from './appName'

export const manifest: AddonManifest = {
  id: 'rest-api-client',
  name: APP_NAME,
  description:
    'Compose HTTP requests, send them through the authed backend proxy, and inspect responses',
  meta: ['rest', 'http', 'api', 'client', 'postman', 'insomnia', 'curl', 'request', 'fetch'],
  icon: Send,
  component: lazy(() => import('./RestApiClient').then((m) => ({ default: m.RestApiClient }))),
  // Single-instance: one request workspace, its collections/history persisted
  // to the home FS.
  multiInstance: false,
  defaultSize: { width: 900, height: 620 },
  minSize: { width: 560, height: 380 },
}
