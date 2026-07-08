import { useCallback } from 'react'
import { useOrderStore } from '@/stores/orderStore'
import { fetchKitchenStatus } from '@/services/orderService'

export function useOrderStatus() {
  const currentOrderId = useOrderStore((s) => s.currentOrderId)
  const currentOrderStatus = useOrderStore((s) => s.currentOrderStatus)
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus)

  const syncStatus = useCallback(async () => {
    if (!currentOrderId) return
    try {
      const status = await fetchKitchenStatus(currentOrderId)
      updateOrderStatus(currentOrderId, status)
    } catch {
      /* يُحدَّث لاحقاً عبر السوكِت */
    }
  }, [currentOrderId, updateOrderStatus])

  return { currentOrderId, currentOrderStatus, syncStatus }
}
