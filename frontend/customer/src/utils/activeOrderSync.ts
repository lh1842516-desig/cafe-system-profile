import { fetchKitchenStatus, fetchOrdersForTable } from '@/services/orderService'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { findActiveTableOrder } from '@/utils/orderDismissal'

/** يزامن الطلب النشط من الخادم — مفيد بعد إرسال مشترك والمستخدم كان منقطعاً */
export async function syncActiveOrderForSession(tableNumber: string, sessionId: string) {
  const list = await fetchOrdersForTable(tableNumber, sessionId)
  const active = findActiveTableOrder(list)
  if (!active?.id) return null

  const orderId = String(active.id)
  const customerId = active.customerId != null ? String(active.customerId) : undefined

  useSessionStore.getState().setOrderContext(orderId, customerId)

  try {
    const status = await fetchKitchenStatus(orderId)
    useOrderStore.getState().setCurrentOrder(orderId, status)
    return orderId
  } catch {
    useOrderStore.getState().setCurrentOrder(orderId, 'pending')
    return orderId
  }
}
