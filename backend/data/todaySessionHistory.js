/**
 * سجل جلسات «طلبات اليوم» — ملف JSON واحد.
 * يُنشأ سجل واحد لكل دفعة إغلاق (طاولة مدفوعة / طلب سفري مغلق).
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const HISTORY_FILE = path.join(DATA_DIR, 'today-session-history.json');

function ensureFile() {
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ sessions: [] }, null, 2), 'utf8');
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(raw.sessions) ? raw.sessions : [];
  } catch {
    return [];
  }
}

function writeAll(sessions) {
  ensureFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ sessions: sessions || [] }, null, 2), 'utf8');
}

function orderIdsKey(orderIds) {
  return (orderIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort()
    .join('|');
}

function findByOrderIdsKey(key, cashSessionId) {
  if (!key) return null;
  const sid =
    cashSessionId != null && String(cashSessionId).trim()
      ? String(cashSessionId).trim()
      : '';
  return (
    readAll().find((s) => {
      if (!s || s.orderIdsKey !== key) return false;
      if (sid) return String(s.cashSessionId || '') === sid;
      return true;
    }) || null
  );
}

function findById(id) {
  const sid = String(id || '').trim();
  if (!sid) return null;
  return readAll().find((s) => s && String(s.id) === sid) || null;
}

function listForCashSession(cashSessionId, openDate) {
  const sid = String(cashSessionId || '').trim();
  const od = String(openDate || '').trim();
  return readAll().filter((s) => {
    if (!s) return false;
    if (sid && s.cashSessionId) return String(s.cashSessionId) === sid;
    if (od && s.openDate) return String(s.openDate) === od;
    return false;
  });
}

function appendSession(session) {
  const list = readAll();
  list.push(session);
  writeAll(list);
  return session;
}

module.exports = {
  HISTORY_FILE,
  readAll,
  writeAll,
  orderIdsKey,
  findByOrderIdsKey,
  findById,
  listForCashSession,
  appendSession,
};
