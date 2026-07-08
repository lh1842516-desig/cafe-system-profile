const DEVICE_KEY = 'cf_customer_device_id_v1'
const LAST_TABLE_KEY = 'cf_customer_last_table_v1'

export function readDeviceId(): string | null {
  try {
    const id = localStorage.getItem(DEVICE_KEY)
    return id && id.trim() ? id.trim() : null
  } catch {
    return null
  }
}

export function getOrCreateDeviceId(): string {
  const existing = readDeviceId()
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? `dev_${crypto.randomUUID().replace(/-/g, '')}`
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    /* private mode */
  }
  return id
}

export function isIosSafariLike(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isAndroidLike(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent || '')
}

export function isMobileLike(): boolean {
  return isIosSafariLike() || isAndroidLike()
}

/** رقم الطاولة الأخير — يبقى في المتصفح حتى بعد مسح الجلسة، ليُعرض في شاشة الترحيب */
export function readLastTableId(): string {
  try {
    return (localStorage.getItem(LAST_TABLE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function saveLastTableId(tableId: string) {
  const tid = String(tableId || '').trim()
  if (!tid) return
  try {
    localStorage.setItem(LAST_TABLE_KEY, tid)
  } catch {
    /* private mode */
  }
}

export function clearLastTableId() {
  try {
    localStorage.removeItem(LAST_TABLE_KEY)
  } catch {
    /* ignore */
  }
}
