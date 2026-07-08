export type OrderStatus = 'pending' | 'waiting' | 'preparing' | 'ready' | 'rejected'

export interface OrderItem {
  id: string
  menuItemId: string
  name: string
  price: number
  quantity: number
  options?: Record<string, string | string[]>
  notes?: string
}

export interface Order {
  id: string
  tableId: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  createdAt: string
  label?: string
}
