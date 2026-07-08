export function formatPrice(amount: number): string {
  const n = Number(amount) || 0
  return `IQD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function normTableId(value: string | null | undefined): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (/^\d+$/.test(s)) return String(Number(s))
  return s
}

const RESERVED_SEGMENTS = ['menu', 'order-status', 'assets']

export function parseTableFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = normTableId(params.get('table') || params.get('tableId') || '')
    if (fromQuery) return fromQuery

    const path = window.location.pathname
    // أول مقطع بعد /customer/ (يدعم /customer/5 و /customer/5/order-status)
    const matchCustomer = path.match(/\/customer\/([^/?#]+)/)
    if (matchCustomer?.[1]) {
      const seg = decodeURIComponent(matchCustomer[1])
      if (seg && !RESERVED_SEGMENTS.includes(seg.toLowerCase())) {
        return normTableId(seg)
      }
    }

    // بلا basename: أول مقطع رقمي
    const matchBare = path.match(/^\/([^/?#]+)/)
    if (matchBare?.[1]) {
      const seg = decodeURIComponent(matchBare[1])
      if (seg && !RESERVED_SEGMENTS.includes(seg.toLowerCase()) && /^\d+$/.test(seg)) {
        return normTableId(seg)
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

/** معرّف الجلسة من الرابط (?s=) — ينجو من قتل iOS حين يُمسح كل التخزين */
export function parseSessionFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search)
    return String(params.get('s') || params.get('sessionId') || '').trim()
  } catch {
    return ''
  }
}

/** يحفظ الجلسة في الرابط لاستعادتها بعد قتل المتصفح (سجل Safari يحتفظ بالرابط كاملاً) */
export function persistSessionInUrl(tableId: string, sessionId: string) {
  if (typeof window === 'undefined') return
  const tid = normTableId(tableId)
  const sid = String(sessionId || '').trim()
  if (!tid || !sid) return
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('s', sid)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}

export function clearSessionFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('s')
    url.searchParams.delete('sessionId')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}
