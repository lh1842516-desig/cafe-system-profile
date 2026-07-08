import { useCallback, useEffect } from 'react'
import { fetchTableUsers } from '@/services/orderService'
import { emitTableEmoji, getSocket } from '@/services/socketService'
import { useSessionStore } from '@/stores/sessionStore'
import { useTableStore } from '@/stores/tableStore'
import { normalizePeerStatus } from '@/utils/peerStatus'

export function useTableUsers() {
  const tableNumber = useSessionStore((s) => s.tableNumber)
  const sessionId = useSessionStore((s) => s.sessionId)
  const users = useTableStore((s) => s.users)
  const setUsers = useTableStore((s) => s.setUsers)

  const refresh = useCallback(async () => {
    if (!tableNumber) return
    const raw = await fetchTableUsers(tableNumber)
    setUsers(
      (raw as Record<string, unknown>[]).map((u) => ({
        sessionId: String(u.sessionId || ''),
        customerName: String(u.customerName || u.name || ''),
        status: normalizePeerStatus(String(u.status || 'choosing')),
        emoji: u.emoji ? String(u.emoji) : null,
        connected: u.connected !== false,
      })),
    )
  }, [tableNumber, setUsers])

  const sendEmoji = useCallback(
    (emoji: string, emojiId?: string) => {
      if (!tableNumber || !sessionId) return
      emitTableEmoji(tableNumber, sessionId, emoji, emojiId)
    },
    [tableNumber, sessionId],
  )

  useEffect(() => {
    void refresh()
    const poll = () => {
      if (getSocket()?.connected) return
      void refresh()
    }
    const t = setInterval(poll, 15000)
    return () => clearInterval(t)
  }, [refresh])

  return { users, refresh, sendEmoji }
}
