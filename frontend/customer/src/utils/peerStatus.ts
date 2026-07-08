import type { UiKey } from '@/i18n/strings'
import type { UserStatus } from '@/types/table.types'

const VALID_STATUSES = new Set<UserStatus>([
  'choosing',
  'browsing',
  'ready',
  'ordered',
  'awaiting_prep',
  'kitchen_preparing',
  'kitchen_prepared',
])

/** توحيد حالة المتصل كما يرسلها الخادم */
export function normalizePeerStatus(raw: string): UserStatus {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'waiting') return 'awaiting_prep'
  if (s === 'ordered') return 'awaiting_prep'
  if (VALID_STATUSES.has(s as UserStatus)) return s as UserStatus
  return 'choosing'
}

export function isChoosingPeerStatus(status: UserStatus): boolean {
  return status === 'choosing' || status === 'browsing'
}

export function getPeerStatusKey(status: UserStatus, isSelf: boolean): UiKey {
  switch (status) {
    case 'ready':
      return isSelf ? 'peer_status_ready' : 'peer_status_ready_peer'
    case 'awaiting_prep':
      return isSelf ? 'peer_status_awaiting_self' : 'peer_status_awaiting_peer'
    case 'kitchen_preparing':
      return isSelf ? 'peer_status_preparing_self' : 'peer_status_preparing_peer'
    case 'kitchen_prepared':
      return isSelf ? 'peer_status_completed_self' : 'peer_status_completed_peer'
    case 'browsing':
      return 'peer_status_browsing'
    default:
      return 'peer_status_choosing'
  }
}

export function getPeerStatusLabel(
  status: UserStatus,
  isSelf: boolean,
  t: (key: UiKey) => string,
): string {
  return t(getPeerStatusKey(status, isSelf))
}
