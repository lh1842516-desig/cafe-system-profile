import { useEffect, useRef } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { useSessionStore } from '@/stores/sessionStore'
import { useTableStore } from '@/stores/tableStore'
import { useToastStore } from '@/stores/toastStore'

/** إشعار عندما يضغط رفيق «انتظر» على نفس الطاولة */
export function usePeerWaitNotice() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const users = useTableStore((s) => s.users)
  const showToast = useToastStore((s) => s.show)
  const { t } = useTranslation()
  const prevRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!sessionId) return
    const prev = prevRef.current
    users.forEach((u) => {
      if (!u.sessionId || u.sessionId === sessionId) return
      const st = String(u.status || '').toLowerCase()
      const was = prev.get(u.sessionId)
      if (st === 'ready' && was !== 'ready') {
        showToast(
          t('peer_waiting_title', { name: u.customerName || 'زبون' }),
          t('peer_waiting_sub'),
        )
      }
      prev.set(u.sessionId, st)
    })
  }, [users, sessionId, showToast, t])
}
