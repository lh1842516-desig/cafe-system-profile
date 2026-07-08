import type { SentReceipt } from '@/types/receipt.types'
import { formatPrice } from '@/utils/formatPrice'
import {
  RECEIPT_STATUS_LABEL,
  formatReceiptDate,
} from '@/utils/receiptHelpers'
import { useTranslation } from '@/hooks/useTranslation'
import styles from './ReceiptDialog.module.css'

interface ReceiptDialogProps {
  open: boolean
  receipt: SentReceipt | null
  onClose: () => void
}

function formatOptions(options?: Record<string, string | string[]>) {
  if (!options || !Object.keys(options).length) return ''
  return Object.entries(options)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('، ') : v}`)
    .join(' · ')
}

export function ReceiptDialog({ open, receipt, onClose }: ReceiptDialogProps) {
  const { t } = useTranslation()
  if (!open || !receipt) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>{t('receipt_title')}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('receipt_close')}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.meta}>
            <div>
              {t('receipt_table')}: <strong>{receipt.tableId}</strong>
            </div>
            <div>
              طلب: <strong>#{receipt.displayId}</strong>
            </div>
            <div>
              {t('receipt_date')}: <strong>{formatReceiptDate(receipt.createdAt)}</strong>
            </div>
            <div>
              {t('receipt_status')}:{' '}
              <span className={styles.status}>{RECEIPT_STATUS_LABEL[receipt.status]}</span>
            </div>
          </div>

          <div className={styles.items}>
            {receipt.items.map((item, idx) => {
              const opts = formatOptions(item.options)
              return (
                <div key={`${item.name}-${idx}`} className={styles.itemRow}>
                  <div>
                    <div className={styles.itemName}>
                      {item.name} × {item.quantity}
                    </div>
                    {(item.note || opts) && (
                      <div className={styles.itemSub}>
                        {[opts, item.note].filter(Boolean).join(' — ')}
                      </div>
                    )}
                  </div>
                  <div className={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</div>
                </div>
              )
            })}
          </div>

          <div className={styles.totalRow}>
            <span>{t('cart_total')}</span>
            <span className={styles.totalValue}>{formatPrice(receipt.total)}</span>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnClose} onClick={onClose}>
            {t('receipt_close')}
          </button>
        </div>
      </div>
    </div>
  )
}
