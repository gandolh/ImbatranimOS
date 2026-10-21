import { PROTOCOL_VERSION, SHARED_KIT_VERSION } from '@imbatranim/ui'
import type { MarketplaceApp } from '../../shared/registry/marketplace'

/**
 * The sentences a window shows instead of an app that cannot run here, or
 * null when it can. Checked before anything is leased, fetched or added to
 * the page.
 */

/** An app that needs a newer system protocol than this desktop speaks (brief 120). */
export function protocolRefusal(
  app: Pick<MarketplaceApp, 'name' | 'minSystemVersion'>
): string | null {
  return PROTOCOL_VERSION < app.minSystemVersion
    ? `${app.name} needs system protocol ${app.minSystemVersion}; this desktop speaks ${PROTOCOL_VERSION}`
    : null
}

/**
 * A kit app built against another shared kit than this desktop's (brief
 * 163). Either way round: an older kit app may use an export this desktop
 * removed, a newer one an export it does not have yet.
 */
export function kitRefusal(app: Pick<MarketplaceApp, 'name' | 'sharedKit'>): string | null {
  if (app.sharedKit == null || app.sharedKit === SHARED_KIT_VERSION) return null
  return `${app.name} was built for shared kit ${app.sharedKit}, and this desktop has shared kit ${SHARED_KIT_VERSION}. It needs an update built for kit ${SHARED_KIT_VERSION}.`
}
