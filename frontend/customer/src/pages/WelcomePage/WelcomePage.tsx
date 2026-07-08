import { useEffect, useState, startTransition } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from '@/hooks/useTranslation'
import { claimTable, joinTable } from '@/services/orderService'
import { useCafeStore } from '@/stores/cafeStore'
import { useMenuStore } from '@/stores/menuStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useToastStore } from '@/stores/toastStore'
import { getOrCreateDeviceId, readLastTableId, saveLastTableId } from '@/utils/deviceStorage'
import { normTableId, parseTableFromUrl, parseSessionFromUrl } from '@/utils/formatPrice'
import {
  createFreshSessionId,
  hasTabSessionIdentity,
  clearActiveOrderBackup,
} from '@/utils/sessionStorage'
import { clearSessionCookie } from '@/utils/sessionCookie'
import { prefetchMenuPage } from '@/utils/prefetchRoutes'
import styles from './WelcomePage.module.css'

const RESERVED_PATHS = new Set(['menu', 'order-status', 'assets'])

function resolveTableId(paramTable?: string): string {
  const fromParam = paramTable && !RESERVED_PATHS.has(paramTable.toLowerCase())
    ? normTableId(paramTable)
    : ''
  return fromParam || parseTableFromUrl() || readLastTableId()
}

export function WelcomePage() {
  const { tableId: routeTable } = useParams()
  const { t } = useTranslation()
  const settings = useCafeStore((s) => s.settings)
  const setUser = useSessionStore((s) => s.setUser)
  const setAtWelcome = useSessionStore((s) => s.setAtWelcome)
  const touchActive = useSessionStore((s) => s.touchActive)
  const savedName = useSessionStore((s) => s.userName)
  const savedSessionId = useSessionStore((s) => s.sessionId)
  const savedTable = useSessionStore((s) => s.tableNumber)
  const showToast = useToastStore((s) => s.show)

  const tableId = resolveTableId(routeTable)
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (tableId) saveLastTableId(tableId)
    // مسح QR جديد بلا جلسة تبويب — لا نُبقي كوكي/طلب زبون سابق على نفس المتصفح
    if (!hasTabSessionIdentity() && !parseSessionFromUrl()) {
      clearSessionCookie()
      clearActiveOrderBackup()
    }
    void useMenuStore.getState().load()
    prefetchMenuPage()
  }, [tableId])

  const canResumeWithoutName = Boolean(
    hasTabSessionIdentity() &&
      savedName &&
      savedSessionId &&
      tableId &&
      (!savedTable || savedTable === tableId),
  )

  function enterMenu() {
    startTransition(() => {
      setAtWelcome(false)
      touchActive()
    })
  }

  async function handleCta() {
    if (canResumeWithoutName) {
      setBusy(true)
      enterMenu()
      try {
        await joinTable(tableId, savedSessionId!, savedName!, getOrCreateDeviceId())
      } catch {
        /* قد يكون منضمّاً مسبقاً */
      } finally {
        setBusy(false)
      }
      return
    }
    setJoinOpen(true)
  }

  async function handleJoin() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!tableId) {
      showToast('رقم الطاولة غير موجود في الرابط')
      return
    }
    setBusy(true)
    try {
      clearSessionCookie()
      clearActiveOrderBackup()
      const sessionId = createFreshSessionId()
      let tableSessionId: string | null = null
      try {
        tableSessionId = await claimTable(tableId)
      } catch {
        /* table may already be claimed */
      }
      await joinTable(tableId, sessionId, trimmed, getOrCreateDeviceId())
      setUser(trimmed, tableId, tableSessionId)
      setJoinOpen(false)
      enterMenu()
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error || '')
          : ''
      showToast(msg || 'تعذر الانضمام للطاولة، حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.logoWrap}>
          <div className={styles.logoBox}>
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" className={styles.logo} />
            ) : (
              <span className={styles.logoPlaceholder} aria-hidden>☕</span>
            )}
          </div>
        </div>

        <div className={styles.welcomeText}>
          <h1 className={styles.heading}>
            {t('welcome_sub')}{' '}
            <span className={styles.cafeName}>{settings.cafeName}</span>
          </h1>
          <p className={styles.tagline}>{t('welcome_tagline')}</p>
        </div>

        <button type="button" className={styles.cta} onClick={handleCta} disabled={busy || !tableId}>
          {t('welcome_cta')}
        </button>
        {!tableId && <p className={styles.qrHint}>{t('scan_qr_hint')}</p>}
      </div>

      {joinOpen && (
        <div className={styles.joinOverlay} onClick={() => setJoinOpen(false)}>
          <div className={styles.joinCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.tableBadge}>
              <span className={styles.tableBadgeLabel}>طاولة</span>
              <span className={styles.tableBadgeNum}>{tableId || '—'}</span>
            </div>

            <h2 className={styles.joinTitle}>مرحباً</h2>
            <p className={styles.joinSub}>اكتب اسمك ليتعرف عليك أصدقاؤك على الطاولة</p>

            <input
              className={styles.joinInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اكتب اسمك"
              autoFocus
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoin()
              }}
            />

            <div className={styles.joinActions}>
              <button type="button" className={styles.joinCancel} onClick={() => setJoinOpen(false)}>
                {t('join_cancel')}
              </button>
              <button
                type="button"
                className={styles.joinSubmit}
                disabled={busy || !name.trim()}
                onClick={handleJoin}
              >
                {t('join_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
