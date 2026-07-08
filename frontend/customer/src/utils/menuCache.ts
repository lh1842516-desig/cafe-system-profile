import type { Category, Product } from '@/types/menu.types'

const CACHE_KEY = 'cf_menu_cache_v1'
const CACHE_TTL_MS = 10 * 60 * 1000

interface MenuCachePayload {
  categories: Category[]
  products: Product[]
  savedAt: number
}

export function readMenuCache(): MenuCachePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MenuCachePayload
    if (!Array.isArray(parsed.categories)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeMenuCache(categories: Category[], products: Product[]) {
  const payload: MenuCachePayload = { categories, products, savedAt: Date.now() }
  try {
    const json = JSON.stringify(payload)
    sessionStorage.setItem(CACHE_KEY, json)
    localStorage.setItem(CACHE_KEY, json)
  } catch {
    /* quota */
  }
}

export function isMenuCacheFresh(savedAt: number) {
  return Date.now() - savedAt < CACHE_TTL_MS
}
