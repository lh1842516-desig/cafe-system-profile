import { api } from './api'
import type { RestoreSessionResult } from '@/types/session.types'

export interface RestoreSessionParams {
  tableId?: string
  sessionId?: string
  customerId?: string
  activeOrderId?: string
  deviceId?: string
  /** مسح QR جديد — لا نستعيد جلسة زبون آخر من الكوكي/الطاولة */
  freshScan?: boolean
}

export async function restoreSession(params: RestoreSessionParams): Promise<RestoreSessionResult> {
  const q = new URLSearchParams()
  if (params.tableId) q.set('tableId', params.tableId)
  if (params.sessionId) q.set('sessionId', params.sessionId)
  if (params.customerId) q.set('customerId', params.customerId)
  if (params.activeOrderId) q.set('activeOrderId', params.activeOrderId)
  if (params.deviceId) q.set('deviceId', params.deviceId)
  if (params.freshScan) q.set('freshScan', '1')

  const { data } = await api.get<RestoreSessionResult>(`/api/customer/session/restore?${q.toString()}`)
  return data
}

export async function suspendDeviceSession(deviceId: string) {
  await api.post('/api/customer/session/suspend', { deviceId })
}

export async function resumeDeviceSession(deviceId: string) {
  await api.post('/api/customer/session/resume', { deviceId })
}
