import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  message: string
  icon?: ReactNode
}

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <p>{message}</p>
    </div>
  )
}
