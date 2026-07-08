import type { ReactNode } from 'react'
import styles from './PageTransition.module.css'

interface PageTransitionProps {
  transitionKey: string
  children: ReactNode
}

export function PageTransition({ transitionKey, children }: PageTransitionProps) {
  return (
    <div key={transitionKey} className={styles.wrap}>
      {children}
    </div>
  )
}
