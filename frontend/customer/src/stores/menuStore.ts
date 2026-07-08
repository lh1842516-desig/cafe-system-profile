import { create } from 'zustand'
import type { Category, Product } from '@/types/menu.types'
import { fetchCategories, fetchMenu } from '@/services/menuService'
import { isMenuCacheFresh, readMenuCache, writeMenuCache } from '@/utils/menuCache'
import { preloadCategoryImages, preloadProductImages } from '@/utils/imagePreload'

interface MenuStore {
  categories: Category[]
  products: Product[]
  loading: boolean
  productsLoading: boolean
  error: string | null
  selectedCategory: string | null
  load: () => Promise<void>
  refresh: (opts?: { silent?: boolean }) => Promise<void>
  setSelectedCategory: (name: string | null) => void
  productsInCategory: (category: string) => Product[]
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  categories: [],
  products: [],
  loading: false,
  productsLoading: false,
  error: null,
  selectedCategory: null,

  async load() {
    const cached = readMenuCache()
    if (cached?.categories?.length) {
      set({
        categories: cached.categories,
        products: Array.isArray(cached.products) ? cached.products : [],
        loading: false,
        productsLoading: false,
        error: null,
      })
      preloadCategoryImages(cached.categories.map((c) => c.imageUrl))
      const firstCat = cached.categories[0]?.name
      if (firstCat) {
        const firstProducts = (Array.isArray(cached.products) ? cached.products : []).filter(
          (p) => p.category === firstCat,
        )
        preloadProductImages(firstProducts.map((p) => p.imageUrl))
      }
      if (isMenuCacheFresh(cached.savedAt)) {
        void get().refresh({ silent: true })
        return
      }
    }
    await get().refresh()
  },

  async refresh(opts) {
    const hasCategories = get().categories.length > 0
    const silent = Boolean(opts?.silent && hasCategories)
    if (!silent) {
      set({ loading: !hasCategories, productsLoading: hasCategories, error: null })
    }
    try {
      const categories = await fetchCategories()
      set({ categories, loading: false, error: null })

      const products = await fetchMenu()
      set({ products, productsLoading: false, error: null })
      writeMenuCache(categories, products)
      preloadCategoryImages(categories.map((c) => c.imageUrl))
      const selected = get().selectedCategory
      const catName = selected || categories[0]?.name
      if (catName) {
        preloadProductImages(products.filter((p) => p.category === catName).map((p) => p.imageUrl))
      }
    } catch (err) {
      if (!hasCategories) {
        const msg = err instanceof Error ? err.message : 'تعذر تحميل القائمة'
        set({ error: msg, loading: false, productsLoading: false })
      }
    } finally {
      set({ loading: false, productsLoading: false })
    }
  },

  setSelectedCategory(name) {
    set({ selectedCategory: name })
    if (name) {
      const products = get().products.filter((p) => p.category === name)
      preloadProductImages(products.map((p) => p.imageUrl))
    }
  },

  productsInCategory(category) {
    return get().products.filter((p) => p.category === category)
  },
}))
