import { create } from 'zustand'

export type ToastTone = 'default' | 'warning' | 'success'

interface ToastOptions {
  duration?: number
  tone?: ToastTone
}

interface ToastStore {
  message: string | null
  sub: string | null
  tone: ToastTone
  show: (message: string, sub?: string, options?: ToastOptions) => void
  hide: () => void
}

let hideTimer: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastStore>((set) => ({
  message: null,
  sub: null,
  tone: 'default',
  show(message, sub, options) {
    const duration = options?.duration ?? 4000
    const tone = options?.tone ?? 'default'
    if (hideTimer) clearTimeout(hideTimer)
    set({ message, sub: sub ?? null, tone })
    hideTimer = setTimeout(() => {
      set({ message: null, sub: null, tone: 'default' })
      hideTimer = null
    }, duration)
  },
  hide() {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
    set({ message: null, sub: null, tone: 'default' })
  },
}))
