/**
 * جلسة جهاز الزبون (iOS Safari) — المصدر الأساسي للاستعادة بعد إرسال المطبخ.
 * المفتاح: deviceId ثابت من localStorage على iPhone فقط.
 * المؤقت (ساعتان) يبدأ عند suspend ويتوقف عند resume.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getOrders } = require('../data/store');
const customerPersistentSession = require('./customerPersistentSession');

const FILE = path.join(DATA_DIR, 'customer-device-sessions.json');
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
    const empty = { byDeviceId: {} };
    fs.writeFileSync(FILE, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data.byDeviceId === 'object' ? data : { byDeviceId: {} };
  } catch {
    return { byDeviceId: {} };
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

function resolveOpenOrderForRecord(rec) {
  let o = findOpenOrder(rec.tableId, rec.activeOrderId);
  if (!o && rec.peerSessionId) {
    o = customerPersistentSession.findOpenOrderForPeer(rec.tableId, rec.peerSessionId);
    if (o) rec.activeOrderId = String(o.id);
  }
  return o;
}

function isExpired(rec) {
  if (!rec || !rec.expiresAt) return false;
  const ex = Date.parse(rec.expiresAt);
  return Number.isFinite(ex) && Date.now() > ex;
}

function toPublicRecord(rec) {
  if (!rec) return null;
  return {
    deviceId: rec.deviceId,
    customerId: rec.customerId,
    peerSessionId: rec.peerSessionId,
    tableId: rec.tableId,
    customerName: rec.customerName,
    activeOrderId: rec.activeOrderId,
    lastSeen: rec.lastSeen,
    expiresAt: rec.expiresAt,
    status: rec.status,
  };
}

/**
 * بعد أول إرسال للمطبخ (iOS فقط — يُستدعى عند وجود deviceId).
 */
function registerFromKitchen(opts) {
  const deviceId = norm(opts && opts.deviceId);
  const customerId = norm(opts && opts.customerId);
  const peerSessionId = norm(opts && opts.peerSessionId);
  const tableId = norm(opts && opts.tableId);
  const activeOrderId = norm(opts && opts.activeOrderId);
  if (!deviceId || !customerId || !peerSessionId || !tableId || !activeOrderId) {
    return { ok: false, code: 'invalid_input' };
  }
  const o = findOpenOrder(tableId, activeOrderId);
  if (!o) return { ok: false, code: 'order_missing' };

  const store = readStore();
  const now = new Date().toISOString();
  const prev = store.byDeviceId[deviceId] || {};
  const rec = {
    deviceId,
    customerId,
    peerSessionId,
    customerName: norm(opts && opts.customerName).slice(0, 80) || norm(prev.customerName).slice(0, 80),
    tableId,
    activeOrderId,
    status: 'active',
    suspendedAt: null,
    expiresAt: null,
    lastSeen: now,
    createdAt: prev.createdAt || now,
    recoveryMode: 'ios_device',
  };
  store.byDeviceId[deviceId] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

/** تحديث نشاط عند join / reconnect */
function touchDevice(opts) {
  const deviceId = norm(opts && opts.deviceId);
  if (!deviceId) return { ok: false, code: 'missing_device' };
  const store = readStore();
  const rec = store.byDeviceId[deviceId];
  if (!rec || rec.status !== 'active') return { ok: false, code: 'not_found' };
  if (isExpired(rec)) {
    rec.status = 'expired';
    store.byDeviceId[deviceId] = rec;
    writeStore(store);
    return { ok: false, code: 'expired' };
  }
  const tid = norm(opts && opts.tableId);
  const peer = norm(opts && opts.peerSessionId);
  const name = norm(opts && opts.customerName);
  if (tid) rec.tableId = tid;
  if (peer) rec.peerSessionId = peer;
  if (name) rec.customerName = name.slice(0, 80);
  rec.lastSeen = new Date().toISOString();
  rec.suspendedAt = null;
  rec.expiresAt = null;
  store.byDeviceId[deviceId] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function markSuspended(deviceId) {
  const did = norm(deviceId);
  if (!did) return { ok: false, code: 'missing_device' };
  const store = readStore();
  const rec = store.byDeviceId[did];
  if (!rec || rec.status !== 'active') return { ok: false, code: 'not_found' };
  const now = Date.now();
  rec.suspendedAt = new Date(now).toISOString();
  rec.expiresAt = new Date(now + TWO_H_MS).toISOString();
  rec.lastSeen = rec.suspendedAt;
  store.byDeviceId[did] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function markResumed(deviceId) {
  const did = norm(deviceId);
  if (!did) return { ok: false, code: 'missing_device' };
  const store = readStore();
  const rec = store.byDeviceId[did];
  if (!rec || rec.status !== 'active') return { ok: false, code: 'not_found' };
  rec.suspendedAt = null;
  rec.expiresAt = null;
  rec.lastSeen = new Date().toISOString();
  store.byDeviceId[did] = rec;
  writeStore(store);
  return { ok: true, record: rec };
}

function onSuccessfulRestore(deviceId) {
  return markResumed(deviceId);
}

/**
 * @returns {null} لا جلسة جهاز
 * @returns {false} منتهية أو غير صالحة
 * @returns {object} حقول الدمج لـ restoreCustomerSession
 */
function getRestoreAugment(deviceId, tableIdHint) {
  const did = norm(deviceId);
  if (!did) return null;
  const store = readStore();
  const rec = store.byDeviceId[did];
  if (!rec) return null;
  if (rec.status !== 'active') return false;
  if (isExpired(rec)) {
    rec.status = 'expired';
    store.byDeviceId[did] = rec;
    writeStore(store);
    return false;
  }
  const hint = norm(tableIdHint);
  if (hint && norm(rec.tableId) !== hint) {
    /* نفس الجهاز بعد قتل Safari — جلسة الجهاز أولى من رابط QR قديم */
  }
  const o = resolveOpenOrderForRecord(rec);
  if (!o) {
    rec.status = 'invalidated';
    store.byDeviceId[did] = rec;
    writeStore(store);
    return false;
  }
  store.byDeviceId[did] = rec;
  writeStore(store);
  return {
    tableId: rec.tableId,
    customerId: rec.customerId,
    peerSessionId: rec.peerSessionId,
    activeOrderId: String(o.id),
    customerName: rec.customerName || (o.customerName != null ? String(o.customerName).trim() : ''),
    deviceId: did,
  };
}

function invalidateDevice(deviceId) {
  const did = norm(deviceId);
  if (!did) return false;
  const store = readStore();
  const rec = store.byDeviceId[did];
  if (!rec) return false;
  rec.status = 'invalidated';
  rec.lastSeen = new Date().toISOString();
  store.byDeviceId[did] = rec;
  writeStore(store);
  return true;
}

function invalidateTable(tableId) {
  const tid = norm(tableId);
  if (!tid) return 0;
  const store = readStore();
  let n = 0;
  Object.keys(store.byDeviceId).forEach((k) => {
    const rec = store.byDeviceId[k];
    if (rec && rec.status === 'active' && norm(rec.tableId) === tid) {
      rec.status = 'invalidated';
      rec.lastSeen = new Date().toISOString();
      n += 1;
    }
  });
  if (n) writeStore(store);
  return n;
}

function getByDeviceId(deviceId) {
  const did = norm(deviceId);
  if (!did) return null;
  const rec = readStore().byDeviceId[did];
  return rec ? toPublicRecord(rec) : null;
}

module.exports = {
  registerFromKitchen,
  touchDevice,
  markSuspended,
  markResumed,
  onSuccessfulRestore,
  getRestoreAugment,
  invalidateDevice,
  invalidateTable,
  getByDeviceId,
  TWO_H_MS,
};
