export interface SessionState {
  userName: string | null
  tableNumber: string | null
  sessionId: string | null
  tableSessionId: string | null
  customerId: string | null
  activeOrderId: string | null
  enteredAt: number | null
  lastActiveAt: number | null
  hasActiveOrder: boolean
}

export interface RestoreSessionResult {
  ok: boolean
  target: 'welcome' | 'menu'
  route?: string
  customerId?: string
  peerSessionId?: string
  sessionId?: string
  customerName?: string
  tableId?: string
  activeOrderId?: string
  orderId?: string
  status?: string
  reason?: string
  deviceId?: string
}
