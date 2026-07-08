import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'confirm' | 'alert' | 'success'
  alertLabel?: string
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'نعم',
  cancelLabel = 'لا',
  onConfirm,
  onCancel,
  variant = 'confirm',
  alertLabel = 'حسناً',
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className={styles.overlay} onClick={variant === 'alert' ? onCancel : undefined}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {variant === 'alert' && <div className={styles.icon}>!</div>}
        {variant === 'success' && <div className={styles.iconSuccess}>✓</div>}
        <h3 className={styles.title}>{title}</h3>
        {message && <p className={styles.message}>{message}</p>}
        {variant === 'alert' || variant === 'success' ? (
          <button type="button" className={styles.btnFull} onClick={onCancel}>
            {alertLabel}
          </button>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className={styles.btnPrimary} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
