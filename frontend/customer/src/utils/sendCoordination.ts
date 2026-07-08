import type { TableUser } from '@/types/table.types'
import { isChoosingPeerStatus } from '@/utils/peerStatus'

export type CoordinationMode = 'wait_or_alone' | 'bundle_or_alone'

/** أكثر من متصل واحد على الطاولة */
export function hasMultipleTableUsers(users: TableUser[]): boolean {
  return users.filter((u) => u.connected !== false).length > 1
}

/** متصلون ما زالوا يختارون منتجات */
export function getChoosingPeers(users: TableUser[], sessionId: string): TableUser[] {
  return users.filter((u) => {
    if (u.sessionId === sessionId || u.connected === false) return false
    return isChoosingPeerStatus(u.status)
  })
}

/** زبائن آخرون بحالة «جاهز» — ينتظرون الإرسال المشترك */
export function getReadyPeers(users: TableUser[], sessionId: string): TableUser[] {
  return users.filter((u) => {
    if (u.sessionId === sessionId || u.connected === false) return false
    return String(u.status || '').toLowerCase() === 'ready'
  })
}

export function hasReadyPeers(users: TableUser[], sessionId: string): boolean {
  return getReadyPeers(users, sessionId).length > 0
}

export function getCoordinationMode(users: TableUser[], sessionId: string): CoordinationMode {
  if (hasReadyPeers(users, sessionId)) return 'bundle_or_alone'
  return 'wait_or_alone'
}

/**
 * هل يُعرض مربع التنسيق؟ — فقط عند وجود متصل آخر ما زال يختار.
 * إن كان الجميع جاهزين (أو لا يوجد متصلون آخرون) يُرسل مشتركاً تلقائياً.
 */
export function shouldShowCoordinationDialog(users: TableUser[], sessionId: string): boolean {
  if (!hasMultipleTableUsers(users)) return false
  return getChoosingPeers(users, sessionId).length > 0
}
