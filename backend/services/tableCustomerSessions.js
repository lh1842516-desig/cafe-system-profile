/**
 * جلسات زبائن الطاولة — كل عميل مستقل (اسم، سلة، حالة، سوكت).
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR } = require('../config');

const FILE = path.join(DATA_DIR, 'table-customer-sessions.json');
const MAX_NAME_LEN = 30;
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

const STATUS = {
  CHOOSING: 'choosing',
  READY: 'ready',
  /** قديم — يُعرض كانتظار تجهيز في الواجهة */
  ORDERED: 'ordered',
  AWAITING_PREP: 'awaiting_prep',
  KITCHEN_PREPARING: 'kitchen_preparing',
  KITCHEN_PREPARED: 'kitchen_prepared',
};

const CUSTOMER_SETTABLE_STATUSES = new Set([STATUS.CHOOSING, STATUS.READY, STATUS.ORDERED]);

const ALL_USER_STATUSES = new Set([
  STATUS.CHOOSING,
  STATUS.READY,
  STATUS.ORDERED,
  STATUS.AWAITING_PREP,
  STATUS.KITCHEN_PREPARING,
  STATUS.KITCHEN_PREPARED,
]);

function isKitchenPipelineStatus(st) {
  const s = String(st || '').toLowerCase();
  return (
    s === STATUS.AWAITING_PREP ||
    s === STATUS.KITCHEN_PREPARING ||
    s === STATUS.KITCHEN_PREPARED ||
    s === STATUS.ORDERED
  );
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, defaultValue) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, defaultValue);
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

function readTables() {
  const data = readJson(FILE, { tables: {} });
  return data && typeof data.tables === 'object' && data.tables !== null ? data.tables : {};
}

function writeTables(tables) {
  writeJson(FILE, { tables });
}

function pruneUser(user) {
  const connectedAt = Date.parse(user.connectedAt);
  if (Number.isNaN(connectedAt)) return false;
  return Date.now() - connectedAt < MAX_AGE_MS;
}

function pruneTables(tables) {
  const out = {};
  Object.keys(tables).forEach(function (tid) {
    const entry = tables[tid];
    if (!entry || !Array.isArray(entry.users)) return;
    const users = entry.users.filter(pruneUser);
    if (users.length) out[tid] = { users };
  });
  return out;
}

function getTableEntry(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return { users: [] };
  const tables = pruneTables(readTables());
  writeTables(tables);
  return tables[tid] || { users: [] };
}

function saveTableEntry(tableId, entry) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const tables = pruneTables(readTables());
  tables[tid] = entry;
  writeTables(tables);
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .slice(0, MAX_NAME_LEN);
}

function normalizeUser(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const statusRaw = String(src.status || STATUS.CHOOSING).trim().toLowerCase();
  const status = ALL_USER_STATUSES.has(statusRaw) ? statusRaw : STATUS.CHOOSING;
  return {
    sessionId: String(src.sessionId || '').trim(),
    customerName: normalizeName(src.customerName),
    status,
    cart: Array.isArray(src.cart) ? src.cart : [],
    connectedAt: String(src.connectedAt || new Date().toISOString()),
    socketId: src.socketId != null ? String(src.socketId).trim() : '',
    connected: src.connected !== false,
  };
}

function publicUserView(user) {
  return {
    sessionId: user.sessionId,
    customerName: user.customerName,
    status: user.status,
    connected: !!user.connected,
  };
}

function listPublicUsers(tableId) {
  const entry = getTableEntry(tableId);
  return entry.users.map(publicUserView);
}

/** للعرض — المتصلون فقط (بدون منقطعي السوكت خلال فترة السماح) */
function listConnectedPublicUsers(tableId) {
  return listPublicUsers(tableId).filter(function (u) {
    return u && u.connected !== false;
  });
}

function findUser(tableId, sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const entry = getTableEntry(tableId);
  const user = entry.users.find(function (u) {
    return String(u.sessionId) === sid;
  });
  return user ? normalizeUser(user) : null;
}

/**
 * @returns {{ ok: true, user: object, created: boolean } | { ok: false, code: string }}
 */
function joinTable(tableId, sessionId, customerName, socketId) {
  const tid = String(tableId || '').trim();
  const sidIn = String(sessionId || '').trim();
  const name = normalizeName(customerName);
  if (!tid || !name) return { ok: false, code: 'invalid_input' };

  const tables = pruneTables(readTables());
  const entry = tables[tid] || { users: [] };
  let users = entry.users.map(normalizeUser);
  const now = new Date().toISOString();
  let created = false;

  function patchConnected(base) {
    return normalizeUser(
      Object.assign({}, base, {
        customerName: name,
        socketId: socketId != null ? String(socketId).trim() : base.socketId,
        connectedAt: now,
        connected: true,
      })
    );
  }

  let user = null;

  if (sidIn) {
    const bySid = users.findIndex(function (u) {
      return String(u.sessionId) === sidIn;
    });
    if (bySid >= 0) {
      user = patchConnected(users[bySid]);
      users[bySid] = user;
    }
  }

  /* إعادة دخول بنفس الاسم (مثلاً رجوع للترحيب ثم «اطلب الآن») — دمج بدل تكرار السجل */
  if (!user && name) {
    const activeSameName = users.filter(function (u) {
      return normalizeName(u.customerName) === name && !isKitchenPipelineStatus(u.status);
    });
    if (activeSameName.length) {
      const pick = activeSameName.reduce(function (best, u) {
        const t = Date.parse(u.connectedAt) || 0;
        const bt = Date.parse(best.connectedAt) || 0;
        return t >= bt ? u : best;
      });
      const oldSid = String(pick.sessionId);
      if (sidIn && oldSid !== sidIn) {
        users = users.filter(function (u) {
          return String(u.sessionId) !== oldSid;
        });
        user = patchConnected(Object.assign({}, pick, { sessionId: sidIn }));
        users.push(user);
      } else {
        const idx = users.findIndex(function (u) {
          return String(u.sessionId) === oldSid;
        });
        user = patchConnected(pick);
        if (idx >= 0) users[idx] = user;
      }
      const keepSid = String(user.sessionId);
      users = users.filter(function (u) {
        if (normalizeName(u.customerName) !== name) return true;
        if (isKitchenPipelineStatus(u.status)) return true;
        return String(u.sessionId) === keepSid;
      });
    }
  }

  if (!user) {
    user = normalizeUser({
      sessionId: sidIn || uuidv4(),
      customerName: name,
      status: STATUS.CHOOSING,
      cart: [],
      connectedAt: now,
      socketId: socketId != null ? String(socketId).trim() : '',
      connected: true,
    });
    users.push(user);
    created = true;
  }

  tables[tid] = { users };
  writeTables(tables);
  return { ok: true, user, created };
}

function touchPresence(tableId, sessionId, socketId, connected) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return null;
  const tables = pruneTables(readTables());
  const entry = tables[tid];
  if (!entry || !Array.isArray(entry.users)) return null;
  const idx = entry.users.findIndex(function (u) {
    return String(u.sessionId) === sid;
  });
  if (idx < 0) return null;
  const prev = normalizeUser(entry.users[idx]);
  const next = Object.assign({}, prev, {
    socketId: socketId != null ? String(socketId).trim() : prev.socketId,
    connected: connected !== false,
    connectedAt: new Date().toISOString(),
  });
  entry.users[idx] = next;
  tables[tid] = entry;
  writeTables(tables);
  return next;
}

function leaveTable(tableId, sessionId) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return false;
  const tables = pruneTables(readTables());
  const entry = tables[tid];
  if (!entry || !Array.isArray(entry.users)) return false;
  const before = entry.users.length;
  entry.users = entry.users.filter(function (u) {
    return String(u.sessionId) !== sid;
  });
  if (entry.users.length === before) return false;
  if (entry.users.length) tables[tid] = entry;
  else delete tables[tid];
  writeTables(tables);
  return true;
}

function setUserStatus(tableId, sessionId, status, opts) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  const st = String(status || '').trim().toLowerCase();
  if (!tid || !sid) return { ok: false, code: 'invalid_input' };
  const allowInternal = !!(opts && opts.internal);
  const allowed = allowInternal ? ALL_USER_STATUSES : CUSTOMER_SETTABLE_STATUSES;
  if (!allowed.has(st)) {
    return { ok: false, code: 'invalid_status' };
  }
  const tables = pruneTables(readTables());
  const entry = tables[tid];
  if (!entry) return { ok: false, code: 'not_found' };
  const idx = entry.users.findIndex(function (u) {
    return String(u.sessionId) === sid;
  });
  if (idx < 0) return { ok: false, code: 'not_found' };
  entry.users[idx] = Object.assign({}, normalizeUser(entry.users[idx]), { status: st });
  tables[tid] = entry;
  writeTables(tables);
  return { ok: true, user: normalizeUser(entry.users[idx]) };
}

function getCartSnapshot(tableId, sessionId) {
  const user = findUser(tableId, sessionId);
  if (!user) return [];
  return user.cart.map(function (line) {
    return Object.assign({}, line);
  });
}

function saveUserCart(tableId, sessionId, cart) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return { ok: false, code: 'invalid_input' };
  const tables = pruneTables(readTables());
  const entry = tables[tid];
  if (!entry) return { ok: false, code: 'not_found' };
  const idx = entry.users.findIndex(function (u) {
    return String(u.sessionId) === sid;
  });
  if (idx < 0) return { ok: false, code: 'not_found' };
  entry.users[idx] = Object.assign({}, normalizeUser(entry.users[idx]), {
    cart: Array.isArray(cart) ? cart : [],
  });
  tables[tid] = entry;
  writeTables(tables);
  return { ok: true, cart: entry.users[idx].cart };
}

function clearTableUsers(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const tables = pruneTables(readTables());
  delete tables[tid];
  writeTables(tables);
}

function connectedCount(tableId) {
  const entry = getTableEntry(tableId);
  return entry.users.filter(function (u) {
    return u.connected !== false;
  }).length;
}

function listReadyUsersExcept(tableId, exceptSessionId) {
  const tid = String(tableId || '').trim();
  const except = String(exceptSessionId || '').trim();
  const entry = getTableEntry(tid);
  return entry.users
    .map(normalizeUser)
    .filter(function (u) {
      return u.status === STATUS.READY && String(u.sessionId) !== except;
    });
}

module.exports = {
  STATUS,
  isKitchenPipelineStatus,
  joinTable,
  leaveTable,
  touchPresence,
  setUserStatus,
  findUser,
  listPublicUsers,
  listConnectedPublicUsers,
  getCartSnapshot,
  saveUserCart,
  clearTableUsers,
  connectedCount,
  listReadyUsersExcept,
  normalizeName,
  publicUserView,
};
