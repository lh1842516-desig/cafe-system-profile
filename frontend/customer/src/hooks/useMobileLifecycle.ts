import { useEffect, useRef } from 'react'
import { useSessionGuard } from '@/hooks/useSessionGuard'
import { backgroundCustomerSession, resumeCustomerSession } from '@/services/mobileResumeService'
import { leaveTableBeacon } from '@/services/orderService'
import { disconnectSocket } from '@/services/socketService'
import { resumeDeviceSession, suspendDeviceSession } from '@/services/sessionService'
import { useSessionStore } from '@/stores/sessionStore'
import { getOrCreateDeviceId, isAndroidLike, isIosSafariLike } from '@/utils/deviceStorage'

/**
 * دورة حياة الجوال — iOS و Android
 * - iOS: suspend/resume جلسة الجهاز (ساعتان)
 * - Android: مزامنة kitchen-status عند العودة (يمنع الحالة القديمة)
 * - كلاهما: pageshow/bfcache + presence + استعادة خفيفة
 */
export function useMobileLifecycle() {
  const { checkSession } = useSessionGuard()
  const hasActiveOrder = useSessionStore((s) => s.hasActiveOrder)
  const activeOrderId = useSessionStore((s) => s.activeOrderId)
  const userName = useSessionStore((s) => s.userName)
  const busyRef = useRef(false)

  useEffect(() => {
    const ios = isIosSafariLike()
    const android = isAndroidLike()
    const hasOrder = Boolean(hasActiveOrder || activeOrderId)

    async function onForeground() {
      if (busyRef.current) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      busyRef.current = true
      try {
        checkSession()
        if (!userName) return

        if (ios && hasOrder) {
          try {
            await resumeDeviceSession(getOrCreateDeviceId())
          } catch {
            /* device session may not exist yet */
          }
        }

        await resumeCustomerSession({ lightRestore: !hasOrder })
      } finally {
        busyRef.current = false
      }
    }

    async function onBackground() {
      if (!userName) return
      await backgroundCustomerSession()
      if (ios && hasOrder) {
        try {
          await suspendDeviceSession(getOrCreateDeviceId())
        } catch {
          /* ignore */
        }
      }
    }

    function onPageHide(ev: PageTransitionEvent) {
      if (ev.persisted) return
      const { tableNumber, sessionId } = useSessionStore.getState()
      if (!tableNumber || !sessionId) return
      leaveTableBeacon(tableNumber, sessionId)
      disconnectSocket()
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void onForeground()
        return
      }
      void onBackground()
    }

    function onPageShow(ev: PageTransitionEvent) {
      if (ev.persisted || android) {
        void onForeground()
      }
    }

    function onOnline() {
      void onForeground()
    }

    function onFocus() {
      if (document.visibilityState === 'visible') {
        void onForeground()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
    }
  }, [checkSession, hasActiveOrder, activeOrderId, userName])
}
