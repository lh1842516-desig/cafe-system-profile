import { useTranslation } from '@/hooks/useTranslation'
import type { CoordinationMode } from '@/utils/sendCoordination'
import styles from './CoordinationDialog.module.css'

interface CoordinationDialogProps {
  open: boolean
  mode: CoordinationMode
  onWait: () => void
  onSendAlone: () => void
  onSendBundle: () => void
  onCancel: () => void
}

export function CoordinationDialog({
  open,
  mode,
  onWait,
  onSendAlone,
  onSendBundle,
  onCancel,
}: CoordinationDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  const bundleMode = mode === 'bundle_or_alone'

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className={styles.title}>{t('send_coord_title')}</h3>
        <p className={styles.message}>{t('send_coord_message')}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={bundleMode ? onSendBundle : onSendAlone}
          >
            {bundleMode ? t('send_coord_bundle_primary') : t('send_coord_alone')}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onWait}>
            {t('send_coord_wait')}
          </button>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
