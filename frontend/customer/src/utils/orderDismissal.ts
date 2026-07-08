const dismissedOrderIds = new Set<string>()

export function dismissOrder(orderId: string) {
  const id = String(orderId || '').trim()
  if (id) dismissedOrderIds.add(id)
}

export function isOrderDismissed(orderId: string) {
  return dismissedOrderIds.has(String(orderId || '').trim())
}

export function findActiveTableOrder<T extends Record<string, unknown>>(list: T[]): T | undefined {
  return list.find((o) => {
    const id = String(o.id || '').trim()
    if (!id || isOrderDismissed(id)) return false
    if (o.closed === true || o.cancelledByCustomer) return false
    const st = String(o.status || '').toLowerCase()
    return !['completed', 'cancelled', 'paid', 'rejected'].includes(st)
  })
}
