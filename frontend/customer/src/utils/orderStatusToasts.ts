import type { UiKey } from '@/i18n/strings'
import type { OrderStatus } from '@/types/order.types'

export function getOrderStatusToastKeys(
  status: OrderStatus,
): { title: UiKey; sub?: UiKey } | null {
  switch (status) {
    case 'pending':
      return { title: 'status_toast_pending', sub: 'status_toast_pending_sub' }
    case 'waiting':
      return { title: 'status_toast_waiting', sub: 'status_toast_waiting_sub' }
    case 'preparing':
      return { title: 'status_toast_preparing', sub: 'status_toast_preparing_sub' }
    case 'ready':
      return { title: 'status_toast_ready', sub: 'status_toast_ready_sub' }
    case 'rejected':
      return { title: 'status_toast_rejected', sub: 'status_toast_rejected_sub' }
    default:
      return null
  }
}
