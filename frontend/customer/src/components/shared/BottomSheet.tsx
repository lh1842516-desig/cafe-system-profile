import type { ReactNode } from 'react'
import styles from './BottomSheet.module.css'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  showHandle?: boolean
}

export function BottomSheet({ open, onClose, title, children, showHandle = true }: BottomSheetProps) {
  if (!open) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div className={styles.sheet} role="dialog" aria-modal="true">
        {showHandle && <div className={styles.handle} />}
        <div className={styles.header}>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="إغلاق">
            ×
          </button>
          {title ? <h2 className={styles.title}>{title}</h2> : <span />}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  )
}
