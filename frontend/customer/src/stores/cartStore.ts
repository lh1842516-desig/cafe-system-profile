import { create } from 'zustand'
import type { OrderItem } from '@/types/order.types'

function calcTotal(items: OrderItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0)
}

interface CartStore {
  items: OrderItem[]
  addItem: (item: Omit<OrderItem, 'id'>) => void
  updateQty: (id: string, delta: number) => void
  removeItem: (id: string) => void
  clear: () => void
  setItems: (items: OrderItem[]) => void
  total: () => number
  count: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem(item) {
    const id = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    set({ items: [...get().items, { ...item, id }] })
  },

  updateQty(id, delta) {
    set({
      items: get()
        .items.map((i) =>
          i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i,
        )
        .filter((i) => i.quantity > 0),
    })
  },

  removeItem(id) {
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  clear() {
    set({ items: [] })
  },

  setItems(items: OrderItem[]) {
    set({ items: [...items] })
  },

  total() {
    return calcTotal(get().items)
  },

  count() {
    return get().items.reduce((n, i) => n + i.quantity, 0)
  },
}))
