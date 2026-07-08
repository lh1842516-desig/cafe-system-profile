import { useEffect, useMemo } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import {
  disconnectSocket,
  initConnectionMonitor,
  initSocket,
  stopConnectionMonitor,
} from '@/services/socketService'

/**
 * يُشغّل سوكت الجلسة الكامل على المنيو/حالة الطلب،
 * أو مراقبة اتصال خفيفة على الترحيب وباقي الشاشات.
 */
export function useAppSocket() {
  const tableNumber = useSessionStore((s) => s.tableNumber)
  const sessionId = useSessionStore((s) => s.sessionId)
  const userName = useSessionStore((s) => s.userName)
  const atWelcome = useSessionStore((s) => s.atWelcome)

  const useFullSocket = useMemo(() => {
    return Boolean(tableNumber && sessionId && userName && !atWelcome)
  }, [tableNumber, sessionId, userName, atWelcome])

  useEffect(() => {
    if (useFullSocket) {
      stopConnectionMonitor()
      initSocket(tableNumber!, sessionId!)
      return () => {
        disconnectSocket()
        initConnectionMonitor()
      }
    }

    initConnectionMonitor()
    return () => stopConnectionMonitor()
  }, [useFullSocket, tableNumber, sessionId])
}
