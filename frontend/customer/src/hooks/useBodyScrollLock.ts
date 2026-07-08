import { useEffect } from 'react'

const LOCK_CLASS = 'scroll-locked'

/** يمنع تمرير الصفحة الخلفية أثناء فتح درج/نافذة — بدون position:fixed لتجنب ضبابية iOS */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return

    const { body } = document
    body.classList.add(LOCK_CLASS)
    body.style.overflow = 'hidden'

    return () => {
      body.classList.remove(LOCK_CLASS)
      body.style.overflow = ''
    }
  }, [locked])
}
