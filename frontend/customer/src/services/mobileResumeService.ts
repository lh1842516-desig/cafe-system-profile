import { fetchOrderKitchenState, getBillStatus, joinTable } from '@/services/orderService'
import { restoreSession } from '@/services/sessionService'
import { emitTablePresence, getSocket } from '@/services/socketService'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { syncActiveOrderForSession } from '@/utils/activeOrderSync'
import { getOrCreateDeviceId } from '@/utils/deviceStorage'
import { syncBillStatusFromResponse } from '@/utils/billStatusSync'

/** مزامنة الحالة بعد العودة من الخلفية / bfcache / إعادة اتصال */
export async function resumeCustomerSession(opts?: { lightRestore?: boolean }) {
  const session = useSessionStore.getState()
  const { tableNumber, sessionId, userName, activeOrderId, customerId, hasActiveOrder } = session
  if (!tableNumber || !sessionId || !userName) return

  session.touchActive()
  emitTablePresence(tableNumber, sessionId, 'active')

  const orderStore = useOrderStore.getState()
  const orderId = String(orderStore.currentOrderId || activeOrderId || '').trim()

  // أعد الانضمام دائماً — بعد مهلة الانقطاع يُزال الزبون من الطاولة، وهذا يُعيده
  const sock = getSocket()
  if (!sock?.connected) {
    try {
      await joinTable(tableNumber, sessionId, userName, getOrCreateDeviceId())
    } catch {
      /* قد يكون منضمّاً مسبقاً */
    }
  }

  try {
    const billSt = await getBillStatus(tableNumber)
    syncBillStatusFromResponse(billSt)
  } catch {
    /* offline */
  }

  if (!orderId) {
    try {
      await syncActiveOrderForSession(tableNumber, sessionId)
    } catch {
      /* offline */
    }
  }

  // حدّث حالة الطلب، وامسح الجلسة فقط إذا أكّد الخادم أن الطلب مغلق/غير موجود.
  // لا نمسح أبداً بسبب أسباب تحقق الجلسة (peer/device) لأن الطلب النشط هو المرجع.
  if (orderId) {
    try {
      const st = await fetchOrderKitchenState(orderId)
      if (st.closed) {
        session.clearSession()
        orderStore.reset()
        return
      }
      orderStore.setCurrentOrder(orderId, st.status)
      if (['pending', 'waiting', 'preparing', 'ready'].includes(st.status)) {
        orderStore.requestStatusSheet()
      }
    } catch {
      /* أوفلاين — أبقِ الحالة المخزّنة */
    }
  }

  // تحديث سياق العميل (customerId) best-effort دون المساس بالجلسة عند فشل التحقق
  if (!opts?.lightRestore && (hasActiveOrder || activeOrderId || customerId)) {
    try {
      const result = await restoreSession({
        tableId: tableNumber,
        sessionId,
        customerId: customerId || undefined,
        activeOrderId: activeOrderId || orderId || undefined,
        deviceId: getOrCreateDeviceId(),
      })
      if (result.ok && result.target === 'menu') {
        session.applyRestore(result)
      }
    } catch {
      /* offline */
    }
  }
}

export async function backgroundCustomerSession() {
  const session = useSessionStore.getState()
  const { tableNumber, sessionId } = session
  if (!tableNumber || !sessionId) return
  emitTablePresence(tableNumber, sessionId, 'background')
}
