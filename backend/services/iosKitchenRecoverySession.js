/**
 * جلسات استعادة iOS Safari بعد إرسال المطبخ — تُخزَّن على الخادم لمدة تعليق (ساعتان).
 * لا تُنشأ من أندرويد (لا يُمرَّر iosRecoveryToken مع send-kitchen).
 * تُبطَل عند إغلاق فاتورة الطاولة من الكاشير.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR } = require('../config');
const { getOrders } = require('../data/store');
const customerPersistentSession = require('./customerPersistentSession');

const FILE = path.join(DATA_DIR, 'ios-kitchen-recovery-sessions.json');
const TWO_H_MS = 2 * 60 * 60 * 1000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function norm(v) {
  return String(v != null ? v : '').trim();
}

function readStore() {
  ensureDir(path.dirname(FILE));
  if (!fs.existsSync(FILE)) {
    const empty = { byToken: {} };
    fs.writeFileSync(FILE, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data.byToken === 'object' ? data : { byToken: {} };
  } catch {
    return { byToken: {} };
  }
}

function writeStore(store) {
  ensureDir(path.dirname(FILE));
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8');
}

function findOpenOrder(tableId, orderId) {
  const tid = norm(tableId);
  const oid = norm(orderId);
  if (!tid || !oid) return null;
  const orders = getOrders();
  const o = orders.find((x) => x && String(x.id) === oid);
  if (!o || o.closed === true || norm(o.tableId) !== tid) return null;
  return o;
}

/**
 * @param {{ recoveryToken: string, customerId: string, peerSessionId: string, tableId: string, activeOrderId: string, customerName?: string }}
 */
function upsertFromKitchen(opts) {
  const recoveryToken = norm(opts && opts.recoveryToken);
  const customerId = norm(opts && opts.customerId);
  const peerSessionId = norm(opts && opts.peerSessionId);
  const tableId = norm(opts && opts.tableId);
  const activeOrderId = norm(opts && opts.activeOrderId);
  if (!recoveryToken || !customerId || !peerSessionId || !tableId || !activeOrderId) {
    return { ok: false, code: 'invalid_input' };
  }
  const o = findOpenOrder(tableId, activeOrderId);
  if (!o) return { ok: false, code: 'order_missing' };

  const store = readStore();
  const now = new Date().toISOString();
  const prev = store.byToken[recoveryToken] || {};
  const rec = {
    recoveryToken,
    customerId,
    peerSessionId,
    customerName: norm(opts && opts.customerName).slice(0, 80) || norm(prev.customerName).slice(0, 80),
    tableId,
    activeOrderId,
    status: 'active',
    suspendedAt: null,
    expiresAt: null,
    lastKnownState: norm(opts && opts.lastKnownState).slice(0, 500) || norm(prev.lastKnownState).slice(0, 500),
    lastSeen: now,
    createdAt: prev.createdAt || now,
    recoveryMode: 'ios_kitchen',
  };
  store.byToken[recoveryToken] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function markSuspended(recoveryToken) {
  const token = norm(recoveryToken);
  if (!token) return { ok: false, code: 'missing_token' };
  const store = readStore();
  const rec = store.byToken[token];
  if (!rec || rec.status !== 'active') return { ok: false, code: 'not_found' };
  const now = Date.now();
  rec.suspendedAt = new Date(now).toISOString();
  rec.expiresAt = new Date(now + TWO_H_MS).toISOString();
  rec.lastSeen = rec.suspendedAt;
  store.byToken[token] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function markResumed(recoveryToken) {
  const token = norm(recoveryToken);
  if (!token) return { ok: false, code: 'missing_token' };
  const store = readStore();
  const rec = store.byToken[token];
  if (!rec || rec.status !== 'active') return { ok: false, code: 'not_found' };
  rec.suspendedAt = null;
  rec.expiresAt = null;
  rec.lastSeen = new Date().toISOString();
  store.byToken[token] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function onSuccessfulRestore(recoveryToken) {
  return markResumed(recoveryToken);
}

/**
 * @returns {null} token غير معروف — يُكمّل المسار العادي
 * @returns {false} token معروف لكن غير صالح
 * @returns {object} حقول تُدمج في restoreCustomerSession
 */
function getValidatedAugmentForRestore(recoveryToken) {
  const token = norm(recoveryToken);
  if (!token) return null;
  const store = readStore();
  const rec = store.byToken[token];
  if (!rec) return null;
  if (rec.status !== 'active') return false;
  if (rec.expiresAt) {
    const ex = Date.parse(rec.expiresAt);
    if (Number.isFinite(ex) && Date.now() > ex) {
      rec.status = 'expired';
      store.byToken[token] = rec;
      writeStore(store);
      return false;
    }
  }
  let o = findOpenOrder(rec.tableId, rec.activeOrderId);
  if (!o && rec.peerSessionId) {
    o = customerPersistentSession.findOpenOrderForPeer(rec.tableId, rec.peerSessionId);
    if (o) {
      rec.activeOrderId = String(o.id);
      store.byToken[token] = rec;
      writeStore(store);
    }
  }
  if (!o) {
    rec.status = 'invalidated';
    store.byToken[token] = rec;
    writeStore(store);
    return false;
  }
  return {
    tableId: rec.tableId,
    customerId: rec.customerId,
    peerSessionId: rec.peerSessionId,
    activeOrderId: String(o.id),
    customerName: rec.customerName || (o.customerName != null ? String(o.customerName).trim() : ''),
  };
}

function invalidateTable(tableId) {
  const tid = norm(tableId);
  if (!tid) return 0;
  const store = readStore();
  let n = 0;
  Object.keys(store.byToken).forEach((k) => {
    const rec = store.byToken[k];
    if (rec && rec.status === 'active' && norm(rec.tableId) === tid) {
      rec.status = 'invalidated';
      rec.lastSeen = new Date().toISOString();
      n += 1;
    }
  });
  if (n) writeStore(store);
  return n;
}

function newRecoveryToken() {
  return uuidv4();
}

module.exports = {
  upsertFromKitchen,
  markSuspended,
  markResumed,
  onSuccessfulRestore,
  getValidatedAugmentForRestore,
  invalidateTable,
  newRecoveryToken,
  TWO_H_MS,
};
