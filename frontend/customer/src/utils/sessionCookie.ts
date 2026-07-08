/** نسخة احتياطية من كوكي الجلسة عبر document.cookie — لأن Set-Cookie من الخادم قد لا يُخزَّن على iOS/LAN */
const COOKIE_NAME = 'cf_cust'
const MAX_AGE_SEC = 12 * 60 * 60

export function saveSessionCookie(tableId: string, sessionId: string) {
  const tid = String(tableId || '').trim()
  const sid = String(sessionId || '').trim()
  if (!tid || !sid || typeof document === 'undefined') return
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(`${tid}~${sid}`)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

export function clearSessionCookie() {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
  } catch {
    /* ignore */
  }
}
