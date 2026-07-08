const SESSION_KEY = 'cf_customer_session_v2'
const BACKUP_KEY = 'cf_customer_session_backup_v2'
/** مفتاح منفصل يُكتب فقط عند إرسال طلب — أولوية الاستعادة بعد قتل المتصفح */
const ACTIVE_ORDER_KEY = 'cf_active_order_v1'

import type { SessionState } from '@/types/session.types'

export type ActiveOrderBackup = Pick<
  SessionState,
  'userName' | 'tableNumber' | 'sessionId' | 'activeOrderId' | 'customerId' | 'hasActiveOrder'
>

function read(storage: Storage, key: string): Partial<SessionState> {
  try {
    const raw = storage.getItem(key)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<SessionState>
  } catch {
    return {}
  }
}

function write(storage: Storage, key: string, value: Partial<SessionState>) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota */
  }
}

/** جلسة نفس التبويب — تُمسح عند إغلاق التبويب (مهم للتمييز بين البقاء والإغلاق) */
export function readSession(): Partial<SessionState> {
  return read(sessionStorage, SESSION_KEY)
}

/** نسخة دائمة في localStorage — تنجو من إغلاق التبويب/قتل Safari (لاستعادة الطلب النشط فقط) */
export function readBackup(): Partial<SessionState> {
  return read(localStorage, BACKUP_KEY)
}

export function writeSession(partial: Partial<SessionState>) {
  write(sessionStorage, SESSION_KEY, { ...read(sessionStorage, SESSION_KEY), ...partial })
  write(localStorage, BACKUP_KEY, { ...read(localStorage, BACKUP_KEY), ...partial })
}

/** كتابة الجلسة كاملة في نفس التبويب (تُستخدم عند استعادة طلب نشط من النسخة الدائمة) */
export function replaceSession(value: Partial<SessionState>) {
  write(sessionStorage, SESSION_KEY, value)
  write(localStorage, BACKUP_KEY, value)
}

export function clearSessionStorage() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(BACKUP_KEY)
  } catch {
    /* ignore */
  }
  clearActiveOrderBackup()
}

export function hasTabSessionIdentity(): boolean {
  const ss = readSession()
  return Boolean(ss.userName && ss.tableNumber && ss.sessionId)
}

export function getOrCreateSessionId(): string {
  const saved = readSession().sessionId || readBackup().sessionId
  if (saved) return saved
  return createFreshSessionId()
}

/** معرّف جلسة جديد دائماً — عند انضمام زبون جديد باسم جديد */
export function createFreshSessionId(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  writeSession({ sessionId: id })
  return id
}

export function touchLastActive() {
  writeSession({ lastActiveAt: Date.now() })
}

export function writeActiveOrderBackup(data: ActiveOrderBackup) {
  const oid = String(data.activeOrderId || '').trim()
  if (!oid) return
  try {
    localStorage.setItem(
      ACTIVE_ORDER_KEY,
      JSON.stringify({
        userName: data.userName ?? null,
        tableNumber: data.tableNumber ?? null,
        sessionId: data.sessionId ?? null,
        activeOrderId: oid,
        customerId: data.customerId ?? null,
        hasActiveOrder: true,
      }),
    )
  } catch {
    /* ignore */
  }
}

export function readActiveOrderBackup(): Partial<SessionState> {
  try {
    const raw = localStorage.getItem(ACTIVE_ORDER_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<SessionState>
  } catch {
    return {}
  }
}

export function clearActiveOrderBackup() {
  try {
    localStorage.removeItem(ACTIVE_ORDER_KEY)
  } catch {
    /* ignore */
  }
}
