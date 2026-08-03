/**
 * جلسات اختيار الطاولة (قبل إرسال الطلب) — inUse
 * occupied يُستنتج من وجود طلب مفتوح على الطاولة.
 * Supabase Single Source of Truth مع Memory Cache
 */
'use strict';
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../lib/supabase');

let _cafeId = null;
let _tableSessionsCache = [];
let _loaded = false;

function setCafeId(cid) {
  if (cid) _cafeId = cid;
}

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function normalizeSessionShape(session) {
  const src = session && typeof session === 'object' ? session : {};
  return {
    sessionId: String(src.sessionId || src.id || '').trim(),
    tableId: String(src.tableId || src.table_id || '').trim(),
    status: String(src.status || 'in_use').trim() || 'in_use',
    createdAt: String(src.createdAt || src.created_at || new Date().toISOString()),
  };
}

function prune(sessions) {
  const now = Date.now();
  return sessions.filter(function (s) {
    const t = Date.parse(s.createdAt);
    if (Number.isNaN(t)) return false;
    return now - t < MAX_AGE_MS;
  });
}

async function loadFromSupabase() {
  const cid = _cafeId || 'default';
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('table_sessions')
      .select('*');

    if (!error && data) {
      _tableSessionsCache = data.map(normalizeSessionShape);
    }
  } catch (err) {
    console.warn('[tableSessions] Error loading from Supabase:', err.message);
  }
  _loaded = true;
  return _tableSessionsCache;
}

function writeSessions(sessions) {
  _tableSessionsCache = Array.isArray(sessions) ? [...sessions] : [];

  const cid = _cafeId || 'default';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (!isUuid) return;

  const supabase = getClient();
  const rows = _tableSessionsCache.map(s => ({
    id: s.sessionId || uuidv4(),
    cafe_id: cid,
    table_id: s.tableId,
    status: s.status || 'in_use',
    created_at: s.createdAt || new Date().toISOString()
  })).filter(r => !!r.id && !!r.table_id);

  if (rows.length > 0) {
    Promise.resolve(supabase.from('table_sessions').upsert(rows, { onConflict: 'id,cafe_id' }))
      .catch(err => console.error('[tableSessions] Persist error:', err.message));
  }
}

function getSessions() {
  if (!_loaded) {
    loadFromSupabase().catch(() => {});
  }
  const raw = _tableSessionsCache.map(normalizeSessionShape);
  const pruned = prune(raw);
  if (pruned.length !== raw.length) writeSessions(pruned);
  return pruned;
}

function getSessionById(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  return getSessions().find(function (s) {
    return String(s.sessionId) === id;
  }) || null;
}

function getSessionByTable(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return null;
  return getSessions().find(function (s) {
    return String(s.tableId) === tid;
  }) || null;
}

function tableHasOpenOrder(tableId, getOpenOrdersForTable) {
  const list = typeof getOpenOrdersForTable === 'function' ? getOpenOrdersForTable(tableId) : [];
  return Array.isArray(list) && list.length > 0;
}

function claimTable(tableId, getOpenOrdersForTable, resumeOrderId, options) {
  const tid = String(tableId || '').trim();
  if (!tid) return { ok: false, code: 'in_use' };
  const sharedJoin = !!(options && options.sharedJoin);

  const blocking =
    typeof getOpenOrdersForTable === 'function' ? getOpenOrdersForTable(tid) : [];
  const resume = String(resumeOrderId || '').trim();

  function upsertBrowseSession(sessions, preferExisting) {
    const idx = sessions.findIndex((s) => String(s.tableId) === tid);
    if (idx >= 0 && preferExisting) {
      const cur = sessions[idx];
      const session = Object.assign({}, cur, {
        sessionId: String(cur.sessionId || '').trim() || uuidv4(),
        status: 'in_use',
      });
      const next = sessions.slice();
      next[idx] = session;
      writeSessions(next);
      return session;
    }
    const session = {
      sessionId: uuidv4(),
      tableId: tid,
      status: 'in_use',
      createdAt: new Date().toISOString(),
    };
    const next = sessions.filter((s) => String(s.tableId) !== tid).concat([session]);
    writeSessions(next);
    return session;
  }

  if (blocking.length > 0 && sharedJoin) {
    const sessions = getSessions();
    const session = upsertBrowseSession(sessions, true);
    return { ok: true, session, sharedJoin: true };
  }

  if (blocking.length > 0) {
    const resumeHit = resume && blocking.some((o) => String(o.id) === resume);
    if (!resumeHit) {
      return { ok: false, code: 'occupied' };
    }
    const sessions = getSessions().filter((s) => String(s.tableId) !== tid);
    const session = upsertBrowseSession(sessions, false);
    return { ok: true, session, resumed: true };
  }

  let sessions = getSessions();
  const existing = sessions.find(function (s) {
    return String(s.tableId) === tid;
  });
  if (existing) {
    const sid = String(existing.sessionId || '').trim();
    if (!sid) {
      const session = upsertBrowseSession(sessions, true);
      return { ok: true, session };
    }
    return { ok: true, session: existing };
  }

  const session = upsertBrowseSession(sessions, false);
  return { ok: true, session };
}

function releaseSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return false;
  const sessions = getSessions();
  const next = sessions.filter(function (s) {
    return String(s.sessionId) !== id;
  });
  if (next.length === sessions.length) return false;
  writeSessions(next);

  const cid = _cafeId || 'default';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (isUuid) {
    const supabase = getClient();
    Promise.resolve(supabase.from('table_sessions').delete().eq('id', id).eq('cafe_id', cid)).catch(() => {});
  }
  return true;
}

function releaseByTableId(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => String(s.tableId) === tid);
  if (idx < 0) return;
  const current = sessions[idx];
  const nextSession = Object.assign({}, current, {
    sessionId: '',
    status: 'occupied',
  });
  const next = sessions.slice();
  next[idx] = nextSession;
  writeSessions(next);
}

function createSessionAfterCancel(tableId, getOpenOrdersForTable) {
  const tid = String(tableId || '').trim();
  if (!tid) return null;
  if (tableHasOpenOrder(tid, getOpenOrdersForTable)) return null;
  let sessions = getSessions().filter(function (s) {
    return String(s.tableId) !== tid;
  });
  const session = {
    sessionId: uuidv4(),
    tableId: tid,
    status: 'in_use',
    createdAt: new Date().toISOString(),
  };
  sessions.push(session);
  writeSessions(sessions);
  return session;
}

function resetTableAccess(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => String(s.tableId) === tid);
  if (idx < 0) return;
  const current = sessions[idx];
  const reset = Object.assign({}, current, {
    sessionId: '',
    status: 'available',
  });
  const next = sessions.slice();
  next[idx] = reset;
  writeSessions(next);
}

function removeSessionsForTable(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return false;
  const sessions = getSessions();
  const next = sessions.filter(function (s) {
    return String(s.tableId) !== tid;
  });
  if (next.length === sessions.length) return false;
  writeSessions(next);
  return true;
}

const billRequestedMap = new Map();

function setTableBillRequested(cafeId, tableId, isRequested) {
  const cid = String(cafeId || '').trim();
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const key = cid + ':' + tid;
  if (isRequested) {
    billRequestedMap.set(key, true);
  } else {
    billRequestedMap.delete(key);
  }
}

function isTableBillRequested(cafeId, tableId) {
  const cid = String(cafeId || '').trim();
  const tid = String(tableId || '').trim();
  if (!tid) return false;
  return billRequestedMap.get(cid + ':' + tid) === true;
}

loadFromSupabase().catch(() => {});

module.exports = {
  setCafeId,
  getSessions,
  getSessionById,
  getSessionByTable,
  claimTable,
  releaseSession,
  releaseByTableId,
  tableHasOpenOrder,
  createSessionAfterCancel,
  resetTableAccess,
  removeSessionsForTable,
  setTableBillRequested,
  isTableBillRequested,
};
