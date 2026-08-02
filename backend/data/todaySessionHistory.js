/**
 * سجل جلسات «طلبات اليوم» — Supabase Single Source of Truth مع Memory Cache
 */
'use strict';
const { getClient } = require('../lib/supabase');

let _cafeId = null;
let _sessionsCache = [];
let _loaded = false;

function setCafeId(cid) {
  if (cid) _cafeId = cid;
}

async function loadFromSupabase(cafeId) {
  const cid = cafeId || _cafeId || 'default';
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('today_session_history')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      _sessionsCache = data.map(r => r.data || r).filter(Boolean);
    }
  } catch (err) {
    console.warn('[todaySessionHistory] Error loading history:', err.message);
  }
  _loaded = true;
  return _sessionsCache;
}

function readAll() {
  if (!_loaded) {
    loadFromSupabase().catch(() => {});
  }
  return _sessionsCache;
}

function writeAll(sessions) {
  _sessionsCache = Array.isArray(sessions) ? [...sessions] : [];
  // Background persist to Supabase
  const cid = _cafeId || 'default';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (!isUuid) return;

  const supabase = getClient();
  const rows = _sessionsCache.map(s => {
    const sessionKey = s.orderIdsKey || s.id || `session_${Date.now()}_${Math.random()}`;
    return {
      cafe_id: cid,
      session_key: sessionKey,
      cash_session_id: s.cashSessionId || null,
      open_date: s.openDate || null,
      data: s,
      created_at: s.createdAt || new Date().toISOString()
    };
  });

  if (rows.length > 0) {
    supabase.from('today_session_history').upsert(rows, { onConflict: 'cafe_id,session_key' })
      .catch(err => console.error('[todaySessionHistory] Persist error:', err.message));
  }
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

// Initial load call
loadFromSupabase().catch(() => {});

module.exports = {
  setCafeId,
  readAll,
  writeAll,
  orderIdsKey,
  findByOrderIdsKey,
  findById,
  listForCashSession,
  appendSession,
};
