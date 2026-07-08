import { create } from 'zustand'
import type { Order, OrderStatus } from '@/types/order.types'

interface OrderStore {
  orders: Order[]
  currentOrderId: string | null
  currentOrderStatus: OrderStatus | null
  billRequested: boolean
  billRequestedAt: number | null
  billCooldownActive: boolean
  billReminderAllowed: boolean
  statusSheetSignal: number
  setCurrentOrder: (id: string, status: OrderStatus) => void
  updateOrderStatus: (id: string, status: OrderStatus) => void
  addOrder: (order: Order) => void
  setOrders: (orders: Order[]) => void
  removeOrder: (id: string) => void
  setBillRequested: (requested: boolean) => void
  setBillState: (state: {
    requested: boolean
    requestedAt: number | null
    cooldownActive: boolean
    reminderAllowed: boolean
  }) => void
  requestStatusSheet: () => void
  reset: () => void
}

export const useOrderStore = create<OrderStore>((set) => ({
  orders: [],
  currentOrderId: null,
  currentOrderStatus: null,
  billRequested: false,
  billRequestedAt: null,
  billCooldownActive: false,
  billReminderAllowed: false,
  statusSheetSignal: 0,

  setCurrentOrder(id, status) {
    set({ currentOrderId: id, currentOrderStatus: status })
  },

  updateOrderStatus(id, status) {
    set((s) => ({
      currentOrderId: s.currentOrderId === id || !s.currentOrderId ? id : s.currentOrderId,
      currentOrderStatus: s.currentOrderId === id || !s.currentOrderId ? status : s.currentOrderStatus,
      orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
    }))
  },

  addOrder(order) {
    set((s) => ({
      orders: [...s.orders, order],
      currentOrderId: order.id,
      currentOrderStatus: order.status,
    }))
  },

  setOrders(orders) {
    set((s) => ({
      // نحافظ على حالة الطلب الحالي إن كانت أحدث من نسخة الخادم
      orders: orders.map((o) =>
        o.id === s.currentOrderId && s.currentOrderStatus
          ? { ...o, status: s.currentOrderStatus }
          : o,
      ),
    }))
  },

  removeOrder(id) {
    set((s) => ({
      orders: s.orders.filter((o) => o.id !== id),
      currentOrderId: s.currentOrderId === id ? null : s.currentOrderId,
      currentOrderStatus: s.currentOrderId === id ? null : s.currentOrderStatus,
    }))
  },

  setBillRequested(requested) {
    set({
      billRequested: requested,
      billRequestedAt: requested ? Date.now() : null,
      billCooldownActive: requested,
      billReminderAllowed: false,
    })
  },

  setBillState(state) {
    set({
      billRequested: state.requested,
      billRequestedAt: state.requestedAt,
      billCooldownActive: state.cooldownActive,
      billReminderAllowed: state.reminderAllowed,
    })
  },

  requestStatusSheet() {
    set((s) => ({ statusSheetSignal: s.statusSheetSignal + 1 }))
  },

  reset() {
    set({
      orders: [],
      currentOrderId: null,
      currentOrderStatus: null,
      billRequested: false,
      billRequestedAt: null,
      billCooldownActive: false,
      billReminderAllowed: false,
      statusSheetSignal: 0,
    })
  },
}))
