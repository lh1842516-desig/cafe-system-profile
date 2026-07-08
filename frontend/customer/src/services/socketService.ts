import { io, type Socket } from 'socket.io-client'
import { useCafeStore } from '@/stores/cafeStore'
import { useCartStore } from '@/stores/cartStore'
import { useMenuStore } from '@/stores/menuStore'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useTableStore } from '@/stores/tableStore'
import { useToastStore } from '@/stores/toastStore'
import { UI_AR } from '@/i18n/strings'
import { getEmojiLabel } from '@/utils/emojiConfig'
import { fetchKitchenStatus, getBillStatus } from '@/services/orderService'
import { syncActiveOrderForSession } from '@/utils/activeOrderSync'
import { syncBillStatusFromResponse } from '@/utils/billStatusSync'
import { mapKitchenStatus } from '@/utils/orderStatusConfig'
import { clearLastTableId } from '@/utils/deviceStorage'
import type { TableUser } from '@/types/table.types'
import { normalizePeerStatus } from '@/utils/peerStatus'

function mapSocketUser(raw: Record<string, unknown>): TableUser {
  return {
    sessionId: String(raw.sessionId || ''),
    customerName: String(raw.customerName || raw.name || ''),
    status: normalizePeerStatus(String(raw.status || 'choosing')),
    connected: raw.connected !== false,
    emoji: raw.emoji ? String(raw.emoji) : null,
  }
}

function applyPlacedOrder(orderId: string, kitchenBatchId?: string | null, customerId?: string | null) {
  const orderStore = useOrderStore.getState()
  orderStore.setCurrentOrder(orderId, 'pending')
  orderStore.requestStatusSheet()
  useSessionStore.getState().setOrderContext(orderId, customerId)
  useSessionStore.getState().setActiveOrder(true)
  useCartStore.getState().clear()
  if (kitchenBatchId) {
    useToastStore.getState().show('تم إرسال طلبات الجميع', 'وصل مشترك مع باقي الطاولة')
  }
  fetchKitchenStatus(orderId)
    .then((status) => orderStore.updateOrderStatus(orderId, status))
    .catch(() => {})
}

let socket: Socket | null = null
let monitorSocket: Socket | null = null
let serverOfflineNotified = false

const SOCKET_OPTS = {
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 400,
  reconnectionDelayMax: 2000,
  timeout: 8000,
}

let onlineListenersBound = false

function bindOnlineOfflineListeners() {
  if (onlineListenersBound || typeof window === 'undefined') return
  onlineListenersBound = true
  window.addEventListener('offline', () => {
    notifyServerOffline()
  })
  window.addEventListener('online', () => {
    socket?.connect()
    monitorSocket?.connect()
  })
}

function notifyServerOffline() {
  if (serverOfflineNotified) return
  serverOfflineNotified = true
  useToastStore.getState().show(UI_AR.server_offline_title, UI_AR.server_offline_sub, {
    duration: 10000,
    tone: 'warning',
  })
}

function notifyServerOnline() {
  if (!serverOfflineNotified) return
  serverOfflineNotified = false
  useToastStore.getState().show(UI_AR.server_online_title, UI_AR.server_online_sub, {
    duration: 6000,
    tone: 'success',
  })
}

function bindConnectionStatusListeners(sock: Socket) {
  sock.on('connect', () => {
    notifyServerOnline()
  })
  sock.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return
    notifyServerOffline()
  })
  sock.on('connect_error', () => {
    notifyServerOffline()
  })
}

function teardownSocket(sock: Socket | null) {
  if (!sock) return
  sock.removeAllListeners()
  sock.disconnect()
}

function normTableId(t: string) {
  const s = String(t || '').trim()
  if (/^\d+$/.test(s)) return String(Number(s))
  return s
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  teardownSocket(socket)
  socket = null
}

export function stopConnectionMonitor() {
  teardownSocket(monitorSocket)
  monitorSocket = null
}

/** اتصال خفيف لمراقبة حالة السيرفر وتحديثات القائمة (صفحة الترحيب وغيرها بلا جلسة كاملة). */
export function initConnectionMonitor() {
  if (socket?.connected) return monitorSocket
  if (monitorSocket?.connected) return monitorSocket

  stopConnectionMonitor()
  monitorSocket = io(window.location.origin, SOCKET_OPTS)
  bindOnlineOfflineListeners()
  bindConnectionStatusListeners(monitorSocket)

  monitorSocket.on('menu-updated', () => {
    useMenuStore.getState().refresh()
  })

  monitorSocket.on('cafe-settings-updated', (payload) => {
    useCafeStore.getState().setSettings({
      cafeName: payload?.cafeName || 'الكافيه',
      logoUrl: payload?.logoUrl ?? null,
      requireCashierKitchenApproval: payload?.requireCashierKitchenApproval,
    })
  })

  return monitorSocket
}

export function initSocket(tableId: string, sessionId: string) {
  const tid = normTableId(tableId)
  if (!tid || !sessionId) return null

  if (socket?.connected) {
    const q = socket.io.opts.query as Record<string, string>
    if (q?.cf_table === tid && q?.cf_session === sessionId) return socket
    disconnectSocket()
  }

  stopConnectionMonitor()

  socket = io(window.location.origin, {
    ...SOCKET_OPTS,
    query: { cf_table: tid, cf_session: sessionId },
  })

  bindOnlineOfflineListeners()
  bindConnectionStatusListeners(socket)

  socket.on('connect', () => {
    getBillStatus(tid)
      .then((st) => syncBillStatusFromResponse(st))
      .catch(() => {})
    if (!useOrderStore.getState().currentOrderId) {
      syncActiveOrderForSession(tid, sessionId).catch(() => {})
    }
    emitTablePresence(tid, sessionId, 'active')
    const orderId = useOrderStore.getState().currentOrderId
    if (orderId) {
      fetchKitchenStatus(orderId)
        .then((status) => useOrderStore.getState().updateOrderStatus(orderId, status))
        .catch(() => {})
    }
  })

  socket.on('cafe-settings-updated', (payload) => {
    useCafeStore.getState().setSettings({
      cafeName: payload?.cafeName || 'الكافيه',
      logoUrl: payload?.logoUrl ?? null,
      requireCashierKitchenApproval: payload?.requireCashierKitchenApproval,
    })
  })

  socket.on('menu-updated', () => {
    useMenuStore.getState().refresh()
  })

  socket.on('table_users_updated', (payload) => {
    if (normTableId(payload?.tableId) !== tid) return
    const raw = Array.isArray(payload?.users) ? payload.users : []
    const users = (raw as Record<string, unknown>[]).map(mapSocketUser)
    useTableStore.getState().setUsers(users)
  })

  socket.on('table_emoji_reaction', (payload) => {
    if (normTableId(payload?.tableId) !== tid) return
    const emoji = String(payload?.emoji || '')
    useTableStore.getState().triggerEmoji({
      sessionId: String(payload?.sessionId || ''),
      emoji,
      label: getEmojiLabel(emoji),
      at: Number(payload?.at) || Date.now(),
    })
  })

  socket.on('kitchen-updated', async (payload) => {
    const orderId = String(payload?.orderId || '')
    const current = useOrderStore.getState().currentOrderId
    if (!orderId || (current && orderId !== current)) return
    try {
      const status = await fetchKitchenStatus(orderId)
      useOrderStore.getState().updateOrderStatus(orderId, status)
    } catch {
      const status = mapKitchenStatus(String(payload?.status || ''))
      useOrderStore.getState().updateOrderStatus(orderId, status)
    }
  })

  socket.on('order_ready', (payload) => {
    const orderId = String(payload?.orderId || '')
    if (!orderId) return
    useOrderStore.getState().updateOrderStatus(orderId, 'ready')
  })

  socket.on('new-order', (order) => {
    const orderId = String(order?.id || '')
    if (!orderId) return
    useOrderStore.getState().updateOrderStatus(orderId, 'waiting')
    useSessionStore.getState().setActiveOrder(true)
  })

  socket.on('cashier-approval-pending', (payload) => {
    const orderId = String(payload?.orderId || '')
    if (!orderId) return
    const current = useOrderStore.getState().currentOrderId
    if (current && current !== orderId) return
    useOrderStore.getState().setCurrentOrder(orderId, 'pending')
    useOrderStore.getState().requestStatusSheet()
    fetchKitchenStatus(orderId)
      .then((status) => useOrderStore.getState().updateOrderStatus(orderId, status))
      .catch(() => {})
  })

  socket.on('cashier-approval-rejected', (payload) => {
    const orderId = String(payload?.orderId || '')
    if (!orderId) return
    const current = useOrderStore.getState().currentOrderId
    if (current && current !== orderId) return
    useOrderStore.getState().updateOrderStatus(orderId, 'rejected')
    useOrderStore.getState().requestStatusSheet()
  })

  socket.on('customer_orders_placed', (payload) => {
    if (normTableId(payload?.tableId) !== tid) return
    const placements = Array.isArray(payload?.placements) ? payload.placements : []
    const kitchenBatchId = payload?.kitchenBatchId ? String(payload.kitchenBatchId) : null
    const mine = placements.find((p: { sessionId?: string; customerId?: string }) => String(p?.sessionId) === sessionId)
    const orderId = mine?.orderId != null ? String(mine.orderId) : ''
    if (!orderId) return
    applyPlacedOrder(orderId, kitchenBatchId, mine?.customerId ? String(mine.customerId) : null)
  })

  socket.on('bill-request-updated', (payload) => {
    if (normTableId(payload?.tableId) !== tid) return
    const requested = Boolean(payload?.requested)
    if (!requested) {
      useOrderStore.getState().setBillState({
        requested: false,
        requestedAt: null,
        cooldownActive: false,
        reminderAllowed: false,
      })
      return
    }
    useOrderStore.getState().setBillState({
      requested: true,
      requestedAt: Date.now(),
      cooldownActive: true,
      reminderAllowed: false,
    })
  })

  socket.on('table_bill_closed', (payload) => {
    if (normTableId(payload?.tableId) !== tid) return
    clearLastTableId()
    useSessionStore.getState().clearSession()
    useOrderStore.getState().reset()
    useTableStore.getState().reset()
  })

  return socket
}

export function emitTablePresence(
  tableId: string,
  sessionId: string,
  connectionState: 'active' | 'background' | 'hidden' | 'paused',
) {
  socket?.emit('customer_table_presence', { tableId, sessionId, connectionState })
}

export function emitTableEmoji(
  tableId: string,
  sessionId: string,
  emoji: string,
  emojiId?: string,
) {
  socket?.emit('customer_table_emoji', { tableId, sessionId, emoji, emojiId })
}

export function emitCaptainRequest(tableId: string, sessionId: string, tableLabel: string) {
  socket?.emit('customer_captain_request', { tableId, sessionId, tableLabel })
}

export function emitBillRequest(tableId: string, sessionId: string, tableLabel: string) {
  socket?.emit('customer_bill_request', { tableId, sessionId, tableLabel })
}

