import { useCallback } from 'react'
import { useSessionStore } from '@/stores/sessionStore'

export type ScreenTarget = 'welcome' | 'menu'

export function useSessionGuard() {
  const hydrated = useSessionStore((s) => s.hydrated)
  const userName = useSessionStore((s) => s.userName)
  const hasActiveOrder = useSessionStore((s) => s.hasActiveOrder)
  const activeOrderId = useSessionStore((s) => s.activeOrderId)
  const atWelcome = useSessionStore((s) => s.atWelcome)
  const touchActive = useSessionStore((s) => s.touchActive)

  const resolveScreen = useCallback((): ScreenTarget => {
    if (!userName) return 'welcome'
    if (hasActiveOrder || activeOrderId) return 'menu'
    if (atWelcome) return 'welcome'
    return 'menu'
  }, [userName, hasActiveOrder, activeOrderId, atWelcome])

  const checkSession = useCallback(() => {
    touchActive()
  }, [touchActive])

  return { hydrated, resolveScreen, checkSession, touchActive }
}
