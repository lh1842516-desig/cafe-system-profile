import { create } from 'zustand'
import type { RestoreSessionResult, SessionState } from '@/types/session.types'
import {
  clearSessionStorage,
  readSession,
  readBackup,
  readActiveOrderBackup,
  replaceSession,
  writeSession,
  writeActiveOrderBackup,
  clearActiveOrderBackup,
  getOrCreateSessionId,
  touchLastActive,
} from '@/utils/sessionStorage'
import { saveSessionCookie, clearSessionCookie } from '@/utils/sessionCookie'
import { persistSessionInUrl, clearSessionFromUrl, parseSessionFromUrl } from '@/utils/formatPrice'

interface SessionStore extends SessionState {
  hydrated: boolean
  /** نيّة العودة الصريحة لصفحة الترحيب (زر العودة) — في الذاكرة فقط، لا تُحفظ */
  atWelcome: boolean
  hydrate: () => void
  setUser: (name: string, tableNumber: string, tableSessionId?: string | null) => void
  setActiveOrder: (active: boolean) => void
  clearOrderContext: () => void
  setOrderContext: (orderId: string, customerId?: string | null) => void
  applyRestore: (result: RestoreSessionResult) => void
  touchActive: () => void
  setAtWelcome: (v: boolean) => void
  clearSession: () => void
  ensureSessionId: () => string
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  userName: null,
  tableNumber: null,
  sessionId: null,
  tableSessionId: null,
  customerId: null,
  activeOrderId: null,
  enteredAt: null,
  lastActiveAt: null,
  hasActiveOrder: false,
  hydrated: false,
  atWelcome: false,

  hydrate() {
    const ss = readSession()
    const urlSession = parseSessionFromUrl()
    const ssHasIdentity = Boolean(ss.userName && ss.tableNumber && ss.sessionId)
    // لا نحمّل هوية زبون آخر من localStorage عند مسح QR جديد (تبويب بلا جلسة ولا ?s=)
    const allowPersistentRestore = ssHasIdentity || Boolean(urlSession)

    if (!allowPersistentRestore) {
      set({
        userName: null,
        tableNumber: null,
        sessionId: urlSession || null,
        tableSessionId: null,
        customerId: null,
        activeOrderId: null,
        enteredAt: null,
        lastActiveAt: null,
        hasActiveOrder: false,
        hydrated: true,
        atWelcome: false,
      })
      return
    }

    const bk = readBackup()
    const ao = readActiveOrderBackup()
    const aoHasOrder = Boolean(ao.hasActiveOrder || ao.activeOrderId)
    const bkHasActiveOrder = Boolean(bk.hasActiveOrder || bk.activeOrderId)
    // أولوية: نسخة الطلب النشط المنفصلة (تنجو أحياناً حين يُمسح الباقي على iOS)
    const saved = aoHasOrder
      ? { ...bk, ...ss, ...ao }
      : ssHasIdentity
        ? ss
        : bkHasActiveOrder
          ? bk
          : ss
    if (!ssHasIdentity && (bkHasActiveOrder || aoHasOrder)) {
      replaceSession(saved)
    }
    set({
      userName: saved.userName ?? null,
      tableNumber: saved.tableNumber ?? null,
      sessionId: saved.sessionId ?? null,
      tableSessionId: saved.tableSessionId ?? null,
      customerId: saved.customerId ?? null,
      activeOrderId: saved.activeOrderId ?? null,
      enteredAt: saved.enteredAt ?? null,
      lastActiveAt: saved.lastActiveAt ?? null,
      hasActiveOrder: Boolean(saved.hasActiveOrder),
      hydrated: true,
      atWelcome: false,
    })
  },

  setUser(name, tableNumber, tableSessionId = null) {
    const sessionId = get().sessionId || getOrCreateSessionId()
    const now = Date.now()
    const patch = {
      userName: name.trim(),
      tableNumber,
      sessionId,
      tableSessionId,
      enteredAt: now,
      lastActiveAt: now,
    }
    writeSession(patch)
    set({ ...patch, atWelcome: false })
    saveSessionCookie(tableNumber, sessionId)
    persistSessionInUrl(tableNumber, sessionId)
  },

  setActiveOrder(active) {
    writeSession({ hasActiveOrder: active })
    set({ hasActiveOrder: active })
  },

  clearOrderContext() {
    clearActiveOrderBackup()
    writeSession({ activeOrderId: null, hasActiveOrder: false })
    set({ activeOrderId: null, hasActiveOrder: false })
  },

  setOrderContext(orderId, customerId) {
    const oid = String(orderId || '').trim()
    if (!oid) return
    const cid = customerId != null ? String(customerId).trim() : get().customerId
    writeSession({
      activeOrderId: oid,
      hasActiveOrder: true,
      ...(cid ? { customerId: cid } : {}),
    })
    const st = get()
    writeActiveOrderBackup({
      userName: st.userName,
      tableNumber: st.tableNumber,
      sessionId: st.sessionId,
      activeOrderId: oid,
      customerId: cid || st.customerId,
      hasActiveOrder: true,
    })
    if (st.tableNumber && st.sessionId) {
      saveSessionCookie(st.tableNumber, st.sessionId)
      persistSessionInUrl(st.tableNumber, st.sessionId)
    }
    set({
      activeOrderId: oid,
      hasActiveOrder: true,
      ...(cid ? { customerId: cid } : {}),
    })
  },

  applyRestore(result) {
    const sid = String(result.peerSessionId || result.sessionId || get().sessionId || '').trim()
    const name = String(result.customerName || get().userName || '').trim()
    const table = String(result.tableId || get().tableNumber || '').trim()
    const orderId = String(result.activeOrderId || result.orderId || '').trim()
    const customerId = String(result.customerId || get().customerId || '').trim()
    const now = Date.now()
    const patch: Partial<SessionState> = {
      userName: name || get().userName,
      tableNumber: table || get().tableNumber,
      sessionId: sid || get().sessionId,
      customerId: customerId || null,
      activeOrderId: orderId || null,
      lastActiveAt: now,
      enteredAt: get().enteredAt || now,
      hasActiveOrder: Boolean(orderId),
    }
    writeSession(patch)
    set(patch)
    if (patch.tableNumber && patch.sessionId) {
      saveSessionCookie(patch.tableNumber, patch.sessionId)
      persistSessionInUrl(patch.tableNumber, patch.sessionId)
    }
  },

  touchActive() {
    touchLastActive()
    set({ lastActiveAt: Date.now() })
  },

  setAtWelcome(v) {
    set({ atWelcome: v })
  },

  clearSession() {
    clearSessionStorage()
    clearSessionCookie()
    clearSessionFromUrl()
    set({
      userName: null,
      tableNumber: null,
      sessionId: null,
      tableSessionId: null,
      customerId: null,
      activeOrderId: null,
      enteredAt: null,
      lastActiveAt: null,
      hasActiveOrder: false,
      atWelcome: false,
    })
  },

  ensureSessionId() {
    const id = get().sessionId || getOrCreateSessionId()
    if (!get().sessionId) set({ sessionId: id })
    return id
  },
}))
