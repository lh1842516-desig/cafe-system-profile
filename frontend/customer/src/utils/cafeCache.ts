import type { CafeSettings } from '@/types/cafe.types'

const CACHE_KEY = 'cf_cafe_settings_v1'
const CACHE_TTL_MS = 30 * 60 * 1000

interface CafeCachePayload {
  settings: CafeSettings
  savedAt: number
}

export function readCafeCache(): CafeCachePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CafeCachePayload
    if (!parsed.settings || typeof parsed.settings.cafeName !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeCafeCache(settings: CafeSettings) {
  const payload: CafeCachePayload = { settings, savedAt: Date.now() }
  try {
    const json = JSON.stringify(payload)
    sessionStorage.setItem(CACHE_KEY, json)
    localStorage.setItem(CACHE_KEY, json)
  } catch {
    /* quota */
  }
}

export function isCafeCacheFresh(savedAt: number) {
  return Date.now() - savedAt < CACHE_TTL_MS
}
