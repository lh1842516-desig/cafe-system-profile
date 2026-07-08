import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/hooks/useTranslation'
import { useOrderStatus } from '@/hooks/useOrderStatus'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { ORDER_STATUS_CONFIG } from '@/utils/orderStatusConfig'
import { prefetchWelcomePage } from '@/utils/prefetchRoutes'
import styles from './OrderStatusPage.module.css'

const CHEF: Record<string, string> = {
  pending: '👨‍🍳',
  waiting: '👨‍🍳📋',
  preparing: '👨‍🍳🍳',
  ready: '✅👨‍🍳',
  rejected: '😔',
}

export function OrderStatusPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const tableNumber = useSessionStore((s) => s.tableNumber)
  const currentOrderId = useOrderStore((s) => s.currentOrderId)
  const currentOrderStatus = useOrderStore((s) => s.currentOrderStatus)
  const { syncStatus } = useOrderStatus()

  useEffect(() => {
    void syncStatus()
    prefetchWelcomePage()
  }, [syncStatus])

  const cfg = currentOrderStatus ? ORDER_STATUS_CONFIG[currentOrderStatus] : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <h1 className={styles.title}>{t('order_status_title')}</h1>
        <button type="button" className={styles.backBtn} onClick={() => { prefetchWelcomePage(); navigate(`/${tableNumber}`) }}>
          {t('categories')} ›
        </button>
      </header>

      {!currentOrderId || !cfg ? (
        <div className={styles.empty}>
          <div className={styles.emptyChef}>👨‍🍳</div>
          <h2 style={{ fontWeight: 800, marginBottom: 8 }}>{t('order_status_empty')}</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('order_status_empty_sub')}</p>
        </div>
      ) : (
        <>
          <div className={styles.hero} style={{ background: cfg.gradient }}>
            <div className={styles.chef}>{currentOrderStatus ? CHEF[currentOrderStatus] || '👨‍🍳' : '👨‍🍳'}</div>
            <div className={styles.heroTitle}>{cfg.label}</div>
            {currentOrderStatus === 'ready' && <p>{cfg.sublabel}</p>}
          </div>
          <div className={styles.info}>
            <div className={styles.infoLabel}>الحالة الحالية</div>
            <div className={styles.infoStatus} style={{ color: cfg.accent }}>
              {cfg.infoLabel ?? cfg.label}
            </div>
            {currentOrderStatus === 'ready' && <div className={styles.infoSub}>{cfg.infoSub ?? cfg.sublabel}</div>}
            <div className={styles.infoId}>
              طلب #{tableNumber}-{String(currentOrderId).slice(-3).padStart(3, '0')}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
