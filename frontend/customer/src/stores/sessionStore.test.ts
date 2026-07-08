import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './sessionStore'

describe('sessionStore', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'sessionStorage',
      {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    )
    vi.stubGlobal(
      'localStorage',
      {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    )
    useSessionStore.setState({
      userName: 'أحمد',
      tableNumber: '3',
      sessionId: 'sess-test',
      activeOrderId: 'order-99',
      hasActiveOrder: true,
      customerId: 'cust-1',
      hydrated: true,
      atWelcome: false,
    })
  })

  it('clearOrderContext removes active order from state', () => {
    useSessionStore.getState().clearOrderContext()
    expect(useSessionStore.getState().activeOrderId).toBeNull()
    expect(useSessionStore.getState().hasActiveOrder).toBe(false)
  })
})
