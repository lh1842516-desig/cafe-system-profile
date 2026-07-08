import type { OrderStatus } from './order.types'

export type ReceiptDisplayStatus = OrderStatus | 'cancelled' | 'paid'

export interface ReceiptLineItem {
  name: string
  price: number
  quantity: number
  note?: string
  options?: Record<string, string | string[]>
}

export interface SentReceipt {
  id: string
  displayId: string
  tableId: string
  items: ReceiptLineItem[]
  total: number
  status: ReceiptDisplayStatus
  createdAt: string
  customerName?: string
}
