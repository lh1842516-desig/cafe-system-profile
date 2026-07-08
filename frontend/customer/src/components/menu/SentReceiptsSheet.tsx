import { useCallback, useEffect, useState } from 'react'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { EmptyState } from '@/components/shared/EmptyState'
import { ReceiptDialog } from '@/components/drawer/ReceiptDialog'
import { useTranslation } from '@/hooks/useTranslation'
import { fetchSentReceipts } from '@/services/orderService'
import { useSessionStore } from '@/stores/sessionStore'
import type { SentReceipt } from '@/types/receipt.types'
import { RECEIPT_STATUS_LABEL, formatReceiptDate } from '@/utils/receiptHelpers'
import { formatPrice } from '@/utils/formatPrice'
import styles from './SentReceiptsSheet.module.css'

interface SentReceiptsSheetProps {
  open: boolean
  onClose: () => void
}

export function SentReceiptsSheet({ open, onClose }: SentReceiptsSheetProps) {
  const { t } = useTranslation()
  const tableNumber = useSessionStore((s) => s.tableNumber)
  const sessionId = useSessionStore((s) => s.sessionId)

  const [receipts, setReceipts] = useState<SentReceipt[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SentReceipt | null>(null)

  const load = useCallback(async () => {
    if (!tableNumber || !sessionId) return
    setLoading(true)
    try {
      const list = await fetchSentReceipts(tableNumber, sessionId)
      setReceipts(list)
    } finally {
      setLoading(false)
    }
  }, [tableNumber, sessionId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={t('receipts_btn')}>
        {loading ? (
          <p className={styles.loading}>{t('loading')}</p>
        ) : !receipts.length ? (
          <EmptyState message={t('receipts_empty')} />
        ) : (
          <div className={styles.list}>
            {receipts.map((r) => (
              <button
                key={r.id}
                type="button"
                className={styles.card}
                onClick={() => setSelected(r)}
              >
                <div className={styles.cardTop}>
                  <span className={styles.cardId}>#{r.displayId}</span>
                  <span className={styles.cardStatus}>{RECEIPT_STATUS_LABEL[r.status]}</span>
                </div>
                <div className={styles.cardMeta}>{formatReceiptDate(r.createdAt)}</div>
                <div className={styles.cardTotal}>{formatPrice(r.total)}</div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      <ReceiptDialog open={Boolean(selected)} receipt={selected} onClose={() => setSelected(null)} />
    </>
  )
}

/** زر فتح شيت الوصولات — يُستخدم داخل السلة */
export function SentReceiptsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className={styles.receiptsBtn} onClick={onClick}>
      <span>📋</span>
      {t('receipts_btn')}
    </button>
  )
}
