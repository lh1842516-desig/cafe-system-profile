import { useToastStore } from '@/stores/toastStore'
import styles from './Toast.module.css'

export function Toast() {
  const message = useToastStore((s) => s.message)
  const sub = useToastStore((s) => s.sub)
  const tone = useToastStore((s) => s.tone)
  if (!message) return null

  if (sub || tone !== 'default') {
    const icon = tone === 'warning' ? '⚠️' : tone === 'success' ? '✅' : '🔔'
    const toneClass =
      tone === 'warning' ? styles.toastWarning : tone === 'success' ? styles.toastSuccess : styles.toastLight
    return (
      <div className={`${styles.toast} ${toneClass}`} role="status" aria-live="assertive">
        <span className={styles.bell}>{icon}</span>
        <div>
          <div className={styles.title}>{message}</div>
          {sub && <div className={styles.sub}>{sub}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  )
}
