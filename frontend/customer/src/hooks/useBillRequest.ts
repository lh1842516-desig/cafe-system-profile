import { useCallback } from 'react'
import { getBillStatus, requestBill } from '@/services/orderService'
import { syncBillStatusFromResponse } from '@/utils/billStatusSync'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'

export type BillClickAction = 'blocked' | 'cooldown' | 'first' | 'reminder'

export function useBillRequest() {
  const tableNumber = useSessionStore((s) => s.tableNumber)
  const sessionId = useSessionStore((s) => s.sessionId)
  const currentOrderId = useOrderStore((s) => s.currentOrderId)
  const currentOrderStatus = useOrderStore((s) => s.currentOrderStatus)
  const billRequested = useOrderStore((s) => s.billRequested)
  const billCooldownActive = useOrderStore((s) => s.billCooldownActive)

  const refreshBillStatus = useCallback(async () => {
    if (!tableNumber) return null
    const st = await getBillStatus(tableNumber)
    syncBillStatusFromResponse(st)
    return st
  }, [tableNumber])

  const resolveBillClick = useCallback(async (): Promise<BillClickAction> => {
    if (!tableNumber) return 'blocked'
    const st = await getBillStatus(tableNumber)
    syncBillStatusFromResponse(st)

    if (st.requested) {
      if (st.cooldownActive) return 'cooldown'
      if (st.reminderAllowed) return 'reminder'
      return 'cooldown'
    }

    const eligible = st.eligibility?.eligible
    if (!eligible) return 'blocked'
    if (!currentOrderId || currentOrderStatus === 'rejected') return 'blocked'
    return 'first'
  }, [tableNumber, currentOrderId, currentOrderStatus])

  const submitBillRequest = useCallback(async () => {
    if (!tableNumber || !sessionId) throw new Error('no_session')
    try {
      const result = await requestBill(tableNumber, sessionId, tableNumber)
      if (result?.status) syncBillStatusFromResponse(result.status)
      else syncBillStatusFromResponse({ requested: true, cooldownActive: true, lastSentAt: new Date().toISOString() })
      return result
    } catch (err) {
      const code =
        (err as { code?: string }).code ||
        (err as { response?: { data?: { code?: string } } }).response?.data?.code
      if (code === 'bill_cooldown') {
        await refreshBillStatus()
        throw Object.assign(new Error('cooldown'), { code: 'bill_cooldown' })
      }
      throw err
    }
  }, [tableNumber, sessionId, refreshBillStatus])

  return {
    billRequested,
    billCooldownActive,
    refreshBillStatus,
    resolveBillClick,
    submitBillRequest,
  }
}
