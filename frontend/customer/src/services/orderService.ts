import { api } from './api'
import type { OrderItem, OrderStatus } from '@/types/order.types'
import type { SentReceipt } from '@/types/receipt.types'
import { mapApiOrderToReceipt } from '@/utils/receiptHelpers'
import { mapKitchenStatus } from '@/utils/orderStatusConfig'

export async function claimTable(tableId: string) {
  const { data } = await api.post<{ session?: { sessionId?: string }; sessionId?: string }>(
    '/api/table-sessions/claim',
    { tableId },
  )
  return data?.session?.sessionId || data?.sessionId || null
}

export async function joinTable(
  tableId: string,
  sessionId: string,
  customerName: string,
  deviceId?: string,
) {
  const { data } = await api.post('/api/table-sessions/customer/join', {
    tableId,
    sessionId,
    customerName,
    ...(deviceId ? { deviceId } : {}),
  })
  return data
}

export async function leaveTable(tableId: string, sessionId: string) {
  await api.post('/api/table-sessions/customer/leave', { tableId, sessionId })
}

/** إبلاغ الخادم بمغادرة فورية عند إغلاق الصفحة (sendBeacon / keepalive) */
export function leaveTableBeacon(tableId: string, sessionId: string) {
  if (typeof window === 'undefined') return
  const url = `${window.location.origin}/api/table-sessions/customer/leave`
  const body = JSON.stringify({ tableId, sessionId })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      return
    }
  } catch {
    /* fallback */
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'include',
  })
}

export async function fetchTableUsers(tableId: string) {
  const { data } = await api.get<{ users: unknown[] }>(
    `/api/table-sessions/customer/users?tableId=${encodeURIComponent(tableId)}`,
  )
  return Array.isArray(data?.users) ? data.users : []
}

export async function setUserStatus(tableId: string, sessionId: string, status: string) {
  await api.post('/api/table-sessions/customer/status', { tableId, sessionId, status })
}

export async function requestBill(tableId: string, sessionId: string, tableLabel: string) {
  const { data } = await api.post('/api/table-sessions/bill-request', { tableId, sessionId, tableLabel })
  return data as {
    ok?: boolean
    isReminder?: boolean
    status?: BillStatusResponse
  }
}

export interface BillStatusResponse {
  requested?: boolean
  canRequest?: boolean
  cooldownActive?: boolean
  cooldownEndsAt?: string | null
  reminderAllowed?: boolean
  lastSentAt?: string | null
  requestedAt?: string | null
  eligibility?: { eligible?: boolean; reason?: string }
}

export async function getBillStatus(tableId: string): Promise<BillStatusResponse> {
  const { data } = await api.get<BillStatusResponse>(
    `/api/table-sessions/bill-status?tableId=${encodeURIComponent(tableId)}`,
  )
  return data
}

export async function requestCaptain(tableId: string, sessionId: string, tableLabel: string) {
  await api.post('/api/table-sessions/captain-request', { tableId, sessionId, tableLabel })
}

export interface SendKitchenPayload {
  tableId: string
  sessionId: string
  items: Array<{
    menuId: string
    quantity: number
    note?: string
    selectedOptions?: Record<string, string | string[]>
  }>
  bundleReadyPeers?: boolean
  sendAlone?: boolean
  deviceId?: string
  customerId?: string
}

export async function sendToKitchen(payload: SendKitchenPayload) {
  const { data } = await api.post('/api/table-sessions/customer/send-kitchen', payload)
  return data as {
    myOrderId?: string
    order?: { id?: string }
    orderId?: string
    placements?: Array<{ sessionId?: string; orderId?: string; customerId?: string }>
  }
}

export async function fetchKitchenStatus(orderId: string): Promise<OrderStatus> {
  const { data } = await api.get<{ status?: string; kitchenRaw?: string; awaitingCashierApproval?: boolean }>(
    `/api/orders/${encodeURIComponent(orderId)}/kitchen-status`,
  )
  return mapKitchenStatus(data?.kitchenRaw || data?.status || '', data?.awaitingCashierApproval)
}

/**
 * حالة الطلب مع تمييز الإغلاق (لتحديد هل ما زال الطلب نشطاً بعد العودة).
 * - closed=true ⇒ الطلب مغلق أو غير موجود (404) ⇒ يُعامل كمنتهٍ.
 * - gone=false مع خطأ شبكة ⇒ لا نمسح الجلسة (قد يكون المستخدم غير متصل).
 */
export async function fetchOrderKitchenState(
  orderId: string,
): Promise<{ status: OrderStatus; closed: boolean }> {
  try {
    const { data } = await api.get<{
      status?: string
      kitchenRaw?: string
      awaitingCashierApproval?: boolean
      closed?: boolean
    }>(`/api/orders/${encodeURIComponent(orderId)}/kitchen-status`)
    if (data?.closed) return { status: 'ready', closed: true }
    return {
      status: mapKitchenStatus(data?.kitchenRaw || data?.status || '', data?.awaitingCashierApproval),
      closed: false,
    }
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 404) return { status: 'ready', closed: true }
    throw err
  }
}

export async function cancelOrderByCustomer(orderId: string, tableId: string) {
  await api.post(`/api/orders/${encodeURIComponent(orderId)}/cancel-by-customer`, { tableId })
}

export async function fetchOrderDetail(orderId: string, tableId: string) {
  const { data } = await api.get<Record<string, unknown>>(
    `/api/orders/${encodeURIComponent(orderId)}?tableId=${encodeURIComponent(tableId)}`,
  )
  return data
}

export async function beginOrderEdit(orderId: string, tableId: string) {
  await api.post(`/api/orders/${encodeURIComponent(orderId)}/begin-edit`, { tableId })
}

export async function cancelOrderEdit(orderId: string, tableId: string) {
  await api.post(`/api/orders/${encodeURIComponent(orderId)}/cancel-edit`, { tableId })
}

export async function replaceOrderItems(orderId: string, tableId: string, items: OrderItem[]) {
  const { data } = await api.post(`/api/orders/${encodeURIComponent(orderId)}/items`, {
    tableId,
    items: toOrderItems(items),
    replace: true,
  })
  return data
}

export async function fetchOrdersForTable(tableId: string, sessionId: string) {
  const { data } = await api.get<Array<Record<string, unknown>>>(
    `/api/orders/table/${encodeURIComponent(tableId)}`,
  )
  const list = Array.isArray(data) ? data : []
  return list.filter((o) => {
    const cs = o.customerSessionId != null ? String(o.customerSessionId) : ''
    return !cs || cs === sessionId
  })
}

/** كل طلبات الطاولة بما فيها المُغلقة والملغاة — لعرض الوصولات المرسلة */
export async function fetchAllOrdersForTable(tableId: string, sessionId: string) {
  const { data } = await api.get<Array<Record<string, unknown>>>(
    `/api/orders/table/${encodeURIComponent(tableId)}/all`,
  )
  const list = Array.isArray(data) ? data : []
  return list.filter((o) => {
    const cs = o.customerSessionId != null ? String(o.customerSessionId) : ''
    return !cs || cs === sessionId
  })
}

export async function fetchSentReceipts(tableId: string, sessionId: string): Promise<SentReceipt[]> {
  const list = await fetchAllOrdersForTable(tableId, sessionId)
  return list
    .map((o) => mapApiOrderToReceipt(o))
    .filter((r): r is SentReceipt => Boolean(r))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function syncCartToServer(
  tableId: string,
  sessionId: string,
  items: OrderItem[],
) {
  const lines = items.map((i) => ({
    lineId: i.id,
    menuId: i.menuItemId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    note: i.notes ? String(i.notes).trim() : '',
    selectedOptions: i.options && typeof i.options === 'object' ? i.options : {},
  }))
  await api.post('/api/table-sessions/customer/cart/mutate', {
    tableId,
    sessionId,
    mutations: [{ op: 'replaceAll', items: lines }],
  })
}

export function toOrderItems(items: OrderItem[]) {
  return items.map((i) => ({
    menuId: i.menuItemId,
    quantity: i.quantity,
    note: i.notes ? String(i.notes).trim() : '',
    selectedOptions: i.options && typeof i.options === 'object' ? i.options : {},
  }))
}
