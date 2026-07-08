import type { BillStatusResponse } from '@/services/orderService'
import { useOrderStore } from '@/stores/orderStore'

export function syncBillStatusFromResponse(st: BillStatusResponse) {
  const lastSent = st.lastSentAt || st.requestedAt
  useOrderStore.getState().setBillState({
    requested: Boolean(st.requested),
    requestedAt: lastSent ? new Date(lastSent).getTime() : null,
    cooldownActive: Boolean(st.cooldownActive),
    reminderAllowed: Boolean(st.reminderAllowed),
  })
}

export function isTableOrderingBlocked(): boolean {
  return useOrderStore.getState().billRequested
}
