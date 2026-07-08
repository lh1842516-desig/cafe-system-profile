import type { ReceiptDisplayStatus, ReceiptLineItem, SentReceipt } from '@/types/receipt.types'
import type { Order } from '@/types/order.types'
import { mapKitchenStatus } from '@/utils/orderStatusConfig'

function lineTotal(items: ReceiptLineItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0)
}

function mapItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    const options = r.selectedOptions as Record<string, string | string[]> | undefined
    return {
      name: String(r.name || ''),
      price: Number(r.price) || 0,
      quantity: Number(r.quantity) || 1,
      note: r.note ? String(r.note) : r.notes ? String(r.notes) : undefined,
      options: options && typeof options === 'object' ? options : undefined,
    }
  })
}

function statusFromOrder(raw: Record<string, unknown>): ReceiptDisplayStatus {
  if (raw.cancelledByCustomer) return 'cancelled'
  if (raw.closed) return 'paid'
  const kitchenRaw = String(raw.kitchenStatus || raw.kitchenRaw || raw.status || '')
  return mapKitchenStatus(kitchenRaw, Boolean(raw.awaitingCashierApproval))
}

export function mapApiOrderToReceipt(raw: Record<string, unknown>): SentReceipt | null {
  const id = String(raw.id || '').trim()
  if (!id) return null

  const items = mapItems(raw.items)
  if (!items.length) return null

  return {
    id,
    displayId: String(raw.displayOrderId || raw.id || id),
    tableId: String(raw.tableId || ''),
    items,
    total: lineTotal(items),
    status: statusFromOrder(raw),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    customerName: raw.customerName ? String(raw.customerName) : undefined,
  }
}

/**
 * تحويل طلب قادم من الخادم إلى شكل Order المستخدم في متجر الطلبات (قائمة «طلباتي»).
 * يُبقي الطلبات المكتملة (جاهزة) ظاهرة؛ الاستبعاد يتم من الطرف المستدعي (المُغلقة/الملغاة).
 */
/** طلبات «طلباتي» — مكتملة/نشطة فقط، بلا ملغاة أو مُغلقة */
export function isEligibleForMyOrders(raw: Record<string, unknown>): boolean {
  if (raw.cancelledByCustomer) return false
  if (raw.closed === true) return false
  const st = String(raw.status || '').toLowerCase()
  return !['cancelled', 'paid'].includes(st)
}

export function mapApiOrderToStoreOrder(raw: Record<string, unknown>): Order | null {
  const id = String(raw.id || '').trim()
  if (!id) return null
  if (raw.cancelledByCustomer) return null
  const rawItems = Array.isArray(raw.items) ? (raw.items as unknown[]) : []
  const items = rawItems.map((row, idx) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.lineId || r.id || r.menuId || `line_${idx}`),
      menuItemId: String(r.menuId || r.menuItemId || ''),
      name: String(r.name || 'صنف'),
      price: Number(r.price) || 0,
      quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)),
    }
  })
  const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const total = itemsTotal || Number(raw.total) || 0
  const status = mapKitchenStatus(
    String(raw.kitchenStatus || raw.kitchenRaw || raw.status || ''),
    Boolean(raw.awaitingCashierApproval),
  )
  return {
    id,
    tableId: String(raw.tableId || ''),
    items,
    total,
    status,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    label: raw.displayOrderId ? String(raw.displayOrderId) : undefined,
  }
}

export function orderToReceipt(order: {
  id: string
  tableId: string
  items: Array<{
    name: string
    price: number
    quantity: number
    notes?: string
    options?: Record<string, string | string[]>
  }>
  total: number
  status: ReceiptDisplayStatus
  createdAt: string
  label?: string
}): SentReceipt {
  return {
    id: order.id,
    displayId: order.label || order.id,
    tableId: order.tableId,
    items: order.items.map((i) => ({
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      note: i.notes,
      options: i.options,
    })),
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
  }
}

export function formatReceiptDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export const RECEIPT_STATUS_LABEL: Record<ReceiptDisplayStatus, string> = {
  pending: 'بانتظار موافقة الكاشير',
  waiting: 'انتظار تجهيز',
  preparing: 'جاري التجهيز',
  ready: 'جاهز للاستلام',
  rejected: 'مرفوض',
  cancelled: 'طلب ملغي',
  paid: 'مكتمل / مدفوع',
}
