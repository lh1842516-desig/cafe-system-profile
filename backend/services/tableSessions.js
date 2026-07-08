/**
 * جلسات اختيار الطاولة (قبل إرسال الطلب) — inUse
 * occupied يُستنتج من وجود طلب مفتوح على الطاولة.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR } = require('../config');

const FILE = path.join(DATA_DIR, 'table-sessions.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, defaultValue) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function readData() {
  const data = readJson(FILE, { sessions: [] });
  return Array.isArray(data.sessions) ? data.sessions : [];
}

function writeSessions(sessions) {
  writeJson(FILE, { sessions });
}

function prune(sessions) {
  const now = Date.now();
  return sessions.filter(function (s) {
    const t = Date.parse(s.createdAt);
    if (Number.isNaN(t)) return false;
    return now - t < MAX_AGE_MS;
  });
}

function getSessions() {
  const raw = readData().map(normalizeSessionShape);
  const pruned = prune(raw);
  if (pruned.length !== raw.length) writeSessions(pruned);
  return pruned;
}

function normalizeSessionShape(session) {
  const src = session && typeof session === 'object' ? session : {};
  return {
    sessionId: String(src.sessionId || '').trim(),
    tableId: String(src.tableId || '').trim(),
    status: String(src.status || 'in_use').trim() || 'in_use',
    createdAt: String(src.createdAt || new Date().toISOString()),
  };
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

/**
 * @param {object} [options]
 * @param {boolean} [options.sharedJoin] — انضمام زبون إضافي عبر QR (لا يُرفض بسبب طلبات مفتوحة لزبائن آخرين على نفس الطاولة)
 */
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

module.exports = {
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
};
