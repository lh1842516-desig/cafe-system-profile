import { useCallback } from 'react'
import { UI_AR, type UiKey } from '@/i18n/strings'

export function useTranslation() {
  const t = useCallback((key: UiKey, vars?: Record<string, string>): string => {
    let text: string = UI_AR[key]
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v)
      })
    }
    return text
  }, [])

  return { t }
}
