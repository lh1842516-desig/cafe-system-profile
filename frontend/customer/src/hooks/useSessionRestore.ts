import { useEffect } from 'react'
import { restoreSession } from '@/services/sessionService'
import { fetchOrderKitchenState, joinTable } from '@/services/orderService'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { getOrCreateDeviceId, saveLastTableId } from '@/utils/deviceStorage'
import { dismissOrder } from '@/utils/orderDismissal'
import { parseTableFromUrl, parseSessionFromUrl } from '@/utils/formatPrice'
import { readSession, readActiveOrderBackup } from '@/utils/sessionStorage'

function tableFromBoot(): string {
  const store = useSessionStore.getState()
  return parseTableFromUrl() || store.tableNumber || ''
}

function hasLocalIdentity(): boolean {
  const store = useSessionStore.getState()
  const tabSession = readSession()
  const hasTabIdentity = Boolean(
    tabSession.userName && tabSession.tableNumber && tabSession.sessionId,
  )
  const sessionFromUrl = parseSessionFromUrl()
  return Boolean(
    hasTabIdentity ||
      (store.userName && store.sessionId && (sessionFromUrl || tabSession.sessionId)),
  )
}

function hasActiveOrderLocally(): boolean {
  const store = useSessionStore.getState()
  return Boolean(store.hasActiveOrder || store.activeOrderId)
}

/**
 * قرار الشاشة عند الإقلاع البارد:
 * - طلب نشط محفوظ ⇒ المنيو فوراً + مزامنة بالخلفية.
 * - هوية محفوظة بلا طلب ⇒ المنيو فوراً (join بالخلفية).
 * - زائر QR جديد ⇒ ترحيب فوراً (device probe بالخلفية).
 * لا نمنع أول رسم بانتظار الشبكة — مهم جداً لسرعة الآيفون بعد مسح QR.
 */
export function useSessionRestore() {
  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled

    async function run() {
      if (!useSessionStore.getState().hydrated) {
        useSessionStore.getState().hydrate()
      }
      const store = useSessionStore.getState()
      const deviceId = getOrCreateDeviceId()
      const sessionFromUrl = parseSessionFromUrl()
      const tableId = tableFromBoot()
      if (tableId) saveLastTableId(tableId)

      const hasIdentity = hasLocalIdentity()
      const hasActiveOrder = hasActiveOrderLocally()

      try {
        if (hasActiveOrder && hasIdentity) {
          useSessionStore.getState().setAtWelcome(false)
          void restoreActiveOrder(deviceId, isCancelled)
          return
        }

        if (hasIdentity) {
          useSessionStore.getState().setAtWelcome(false)
          useSessionStore.getState().touchActive()
          void joinTable(store.tableNumber!, store.sessionId!, store.userName!, deviceId).catch(
            () => {},
          )
          return
        }

        const ao = readActiveOrderBackup()
        const aoMatchesTable = Boolean(
          ao.activeOrderId &&
            ao.sessionId &&
            (!ao.tableNumber || String(ao.tableNumber) === String(tableId || '').trim()),
        )

        if (sessionFromUrl || aoMatchesTable) {
          void applyAnonymousRestore(deviceId, isCancelled, tableId, sessionFromUrl || undefined)
          return
        }

        // خلفية فقط: إن وُجدت جلسة جهاز لنفس الآيفون ننتقل للقائمة
        void probeDeviceSessionInBackground(deviceId, tableId, isCancelled)
      } catch {
        /* تجاهل */
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])
}

async function probeDeviceSessionInBackground(
  deviceId: string,
  tableId: string,
  isCancelled: () => boolean,
) {
  const deviceProbe = await restoreSession({
    tableId: tableId || undefined,
    deviceId,
  }).catch(() => null)
  if (
    !deviceProbe?.ok ||
    deviceProbe.target !== 'menu' ||
    deviceProbe.reason !== 'device_session' ||
    isCancelled()
  ) {
    return
  }
  await finishMenuRestore(deviceProbe, deviceId, isCancelled)
}

async function restoreActiveOrder(deviceId: string, isCancelled: () => boolean) {
  const store = useSessionStore.getState()
  const orderStore = useOrderStore.getState()
  const table = store.tableNumber || ''
  const sid = store.sessionId || ''
  const name = store.userName || ''
  const orderId = String(store.activeOrderId || '')

  if (table) saveLastTableId(table)

  // أظهر المنيو فوراً — مزامنة الحالة بالخلفية
  useSessionStore.getState().setAtWelcome(false)
  useSessionStore.getState().touchActive()
  if (orderId) {
    orderStore.setCurrentOrder(orderId, 'pending')
  }

  if (table && sid && name) {
    void joinTable(table, sid, name, deviceId).catch(() => {})
  }

  if (orderId) {
    try {
      const st = await fetchOrderKitchenState(orderId)
      if (isCancelled()) return
      if (st.closed) {
        dismissOrder(orderId)
        orderStore.removeOrder(orderId)
        useSessionStore.getState().clearOrderContext()
      } else {
        orderStore.setCurrentOrder(orderId, st.status)
      }
    } catch {
      /* أبقِ pending */
    }
  }

  try {
    const result = await restoreSession({
      tableId: table || undefined,
      sessionId: sid || undefined,
      customerId: store.customerId || undefined,
      activeOrderId: orderId || undefined,
      deviceId,
    })
    if (!isCancelled() && result.ok && result.target === 'menu') {
      useSessionStore.getState().applyRestore(result)
    }
  } catch {
    /* تجاهل */
  }
}

async function applyAnonymousRestore(
  deviceId: string,
  isCancelled: () => boolean,
  tableId: string,
  urlSession?: string,
) {
  const tableNorm = String(tableId || '').trim()
  const ao = readActiveOrderBackup()
  const aoMatchesTable = Boolean(
    ao.activeOrderId &&
      ao.sessionId &&
      (!ao.tableNumber || String(ao.tableNumber) === tableNorm),
  )

  // 1) جلسة الجهاز المسجّلة (نفس الزبون بعد إرسال المطبخ)
  const deviceProbe = await restoreSession({
    tableId: tableNorm || undefined,
    deviceId,
  }).catch(() => null)
  if (
    deviceProbe?.ok &&
    deviceProbe.target === 'menu' &&
    deviceProbe.reason === 'device_session' &&
    !isCancelled()
  ) {
    await finishMenuRestore(deviceProbe, deviceId, isCancelled)
    return
  }

  // 2) استعادة iOS عبر نسخة الطلب النشط المحفوظة
  if (aoMatchesTable) {
    const aoRestore = await restoreSession({
      tableId: tableNorm || undefined,
      deviceId,
      sessionId: urlSession || ao.sessionId || undefined,
      activeOrderId: ao.activeOrderId || undefined,
      customerId: ao.customerId || undefined,
    }).catch(() => null)
    if (aoRestore?.ok && aoRestore.target === 'menu' && !isCancelled()) {
      await finishMenuRestore(aoRestore, deviceId, isCancelled)
      return
    }
  }

  // 3) رابط يحمل ?s= — استعادة لنفس الجلسة فقط
  if (urlSession) {
    const urlRestore = await restoreSession({
      tableId: tableNorm || undefined,
      sessionId: urlSession,
      deviceId,
    }).catch(() => null)
    if (urlRestore?.ok && urlRestore.target === 'menu' && !isCancelled()) {
      await finishMenuRestore(urlRestore, deviceId, isCancelled)
    }
  }
}

async function finishMenuRestore(
  result: NonNullable<Awaited<ReturnType<typeof restoreSession>>>,
  deviceId: string,
  isCancelled: () => boolean,
) {
  useSessionStore.getState().applyRestore(result)
  useSessionStore.getState().setAtWelcome(false)
  const s = useSessionStore.getState()
  if (s.tableNumber) saveLastTableId(s.tableNumber)
  if (s.tableNumber && s.sessionId && s.userName) {
    joinTable(s.tableNumber, s.sessionId, s.userName, deviceId).catch(() => {})
  }
  const orderId = String(s.activeOrderId || '')
  if (orderId) {
    try {
      const st = await fetchOrderKitchenState(orderId)
      if (isCancelled()) return
      if (st.closed) {
        dismissOrder(orderId)
        useOrderStore.getState().removeOrder(orderId)
        useSessionStore.getState().clearOrderContext()
      } else {
        useOrderStore.getState().setCurrentOrder(orderId, st.status)
      }
    } catch {
      useOrderStore.getState().setCurrentOrder(orderId, 'pending')
    }
  }
}
