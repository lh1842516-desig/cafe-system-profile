import type { OrderItem } from '@/types/order.types'

export function mapApiItemsToCart(items: unknown[]): OrderItem[] {
  if (!Array.isArray(items)) return []
  const out: OrderItem[] = []
  items.forEach((raw, idx) => {
    const row = raw as Record<string, unknown>
    const menuId = String(row.menuId || row.menuItemId || '').trim()
    const qty = Math.max(1, Math.floor(Number(row.quantity) || 1))
    if (!menuId) return
    const opts = row.selectedOptions
    let options: OrderItem['options']
    if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
      options = opts as Record<string, string | string[]>
    }
    out.push({
      id: `ci_edit_${idx}_${Date.now()}`,
      menuItemId: menuId,
      name: String(row.name || 'صنف'),
      price: Number(row.price) || 0,
      quantity: qty,
      options,
      notes: row.note ? String(row.note).trim() : undefined,
    })
  })
  return out
}
