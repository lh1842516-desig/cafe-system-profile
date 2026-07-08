import styles from './PageFallback.module.css'

export function PageFallback() {
  return (
    <div className={styles.shell} role="status" aria-label="جاري التحميل">
      <div className={styles.pulse} />
    </div>
  )
}
