import { create } from 'zustand'
import type { CafeSettings } from '@/types/cafe.types'
import { fetchCafeSettings } from '@/services/cafeService'
import { isCafeCacheFresh, readCafeCache, writeCafeCache } from '@/utils/cafeCache'

interface CafeStore {
  settings: CafeSettings
  loading: boolean
  error: string | null
  load: () => Promise<void>
  setSettings: (settings: CafeSettings) => void
}

export const useCafeStore = create<CafeStore>((set) => ({
  settings: { cafeName: 'الكافيه', logoUrl: null },
  loading: false,
  error: null,

  async load() {
    const cached = readCafeCache()
    if (cached?.settings) {
      set({ settings: cached.settings, loading: false, error: null })
      if (isCafeCacheFresh(cached.savedAt)) {
        // حدّث بالخلفية دون إبقاء الواجهة معلقة
        void fetchCafeSettings()
          .then((settings) => {
            writeCafeCache(settings)
            set({ settings, error: null })
          })
          .catch(() => {})
        return
      }
    } else {
      set({ loading: true, error: null })
    }
    try {
      const settings = await fetchCafeSettings()
      writeCafeCache(settings)
      set({ settings, error: null })
    } catch (err) {
      if (!cached?.settings) {
        const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات المقهى'
        set({ error: msg })
      }
    } finally {
      set({ loading: false })
    }
  },

  setSettings(settings) {
    writeCafeCache(settings)
    set({ settings })
  },
}))
