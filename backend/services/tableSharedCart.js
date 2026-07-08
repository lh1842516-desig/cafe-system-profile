/**
 * سلة مشتركة لكل طاولة — تُحدَّث عبر REST + بث سوكت لجميع الأجهزة المتصلة.
 * صلاحيات: المضيف يعدّل أي سطر؛ الضيف يعدّل أسطر ownerClientId الخاصة به فقط.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const FILE = path.join(DATA_DIR, 'table-shared-carts.json');

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

function readAll() {
  const raw = readJson(FILE, { carts: {} });
  return raw && typeof raw.carts === 'object' && raw.carts !== null ? raw.carts : {};
}

function writeAll(carts) {
  writeJson(FILE, { carts });
}

function normalizeLine(line) {
  if (!line || typeof line !== 'object') return null;
  const lineId = String(line.lineId || '').trim();
  if (!lineId) return null;
  const ownerClientId = String(line.ownerClientId || '').trim();
  if (!ownerClientId) return null;
  const menuId = line.menuId != null ? String(line.menuId) : '';
  const name = line.name != null ? String(line.name) : '';
  const price = Number(line.price);
  const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
  const note = line.note != null ? String(line.note).trim() : '';
  const selectedOptions =
    line.selectedOptions && typeof line.selectedOptions === 'object' && !Array.isArray(line.selectedOptions)
      ? line.selectedOptions
      : {};
  const orderBatch = line.orderBatch != null ? Math.max(1, Math.floor(Number(line.orderBatch) || 1)) : 1;
  const key = line.key != null ? String(line.key) : '';
  const ownerLabel = line.ownerLabel != null ? String(line.ownerLabel).trim() : '';
  const id = line.id != null ? String(line.id).trim() : '';
  const fromServerOrder = !!line.fromServerOrder;
  return {
    lineId,
    ownerClientId,
    ownerLabel,
    menuId,
    name,
    price: Number.isFinite(price) ? price : 0,
    quantity,
    note,
    selectedOptions,
    orderBatch,
    key,
    id,
    fromServerOrder,
  };
}

function getCartSnapshot(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return [];
  const carts = readAll();
  const entry = carts[tid];
  const items = entry && Array.isArray(entry.items) ? entry.items : [];
  return items.map(function (x) {
    return normalizeLine(x);
  }).filter(Boolean);
}

function saveSnapshot(tableId, items) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  const carts = Object.assign({}, readAll());
  carts[tid] = {
    items: items.filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
  writeAll(carts);
}

function isClientInSession(accessSession, clientId) {
  const cid = String(clientId || '').trim();
  if (!cid || !accessSession) return false;
  const ids = Array.isArray(accessSession.activeUserIds) ? accessSession.activeUserIds : [];
  return ids.some(function (u) {
    return String(u) === cid;
  });
}

function isHost(accessSession, clientId) {
  const cid = String(clientId || '').trim();
  const h = accessSession && String(accessSession.hostClientId || '').trim();
  return !!cid && !!h && h === cid;
}

function canMutateLine(accessSession, clientId, line, isRemove) {
  void isRemove;
  if (!line) return false;
  const cid = String(clientId || '').trim();
  if (isHost(accessSession, clientId)) return true;
  return String(line.ownerClientId || '').trim() === cid;
}

/**
 * @param {string} tableId
 * @param {string} clientId
 * @param {object|null} accessSession — من tableSessions.getAccessSession
 * @param {Array<{ op: string, line?: object, lineId?: string }>} mutations
 * @returns {{ ok: boolean, code?: string, items?: object[] }}
 */
function applyMutations(tableId, clientId, accessSession, mutations) {
  const tid = String(tableId || '').trim();
  const cid = String(clientId || '').trim();
  if (!tid || !cid) return { ok: false, code: 'invalid_input' };
  if (!accessSession) return { ok: false, code: 'no_session' };
  if (!isClientInSession(accessSession, cid)) return { ok: false, code: 'not_in_session' };
  const host = isHost(accessSession, cid);
  let items = getCartSnapshot(tid).slice();

  const ops = Array.isArray(mutations) ? mutations : [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i] || {};
    const kind = String(op.op || '').trim().toLowerCase();
    if (kind === 'replaceall') {
      if (!host) return { ok: false, code: 'forbidden' };
      const raw = Array.isArray(op.items) ? op.items : [];
      items = [];
      for (let j = 0; j < raw.length; j += 1) {
        const nl = normalizeLine(raw[j]);
        if (nl && nl.quantity > 0) items.push(nl);
      }
      continue;
    }
    if (kind === 'clearall') {
      if (!host) return { ok: false, code: 'forbidden' };
      items = [];
      continue;
    }
    if (kind === 'remove') {
      const lid = String(op.lineId || '').trim();
      if (!lid) continue;
      const idx = items.findIndex(function (x) {
        return x && String(x.lineId) === lid;
      });
      if (idx < 0) continue;
      const line = items[idx];
      if (!canMutateLine(accessSession, cid, line, true)) return { ok: false, code: 'forbidden' };
      items.splice(idx, 1);
      continue;
    }
    if (kind === 'set') {
      const normalized = normalizeLine(op.line);
      if (!normalized || normalized.quantity <= 0) continue;
      if (!host && normalized.ownerClientId !== cid) return { ok: false, code: 'forbidden_owner' };
      const ix = items.findIndex(function (x) {
        return x && String(x.lineId) === String(normalized.lineId);
      });
      if (ix >= 0) {
        const prev = items[ix];
        if (!canMutateLine(accessSession, cid, prev, false)) return { ok: false, code: 'forbidden' };
        items[ix] = normalized;
      } else {
        items.push(normalized);
      }
      continue;
    }
  }

  saveSnapshot(tid, items);
  return { ok: true, items };
}

function clearTableCart(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return;
  saveSnapshot(tid, []);
}

module.exports = {
  getCartSnapshot,
  applyMutations,
  clearTableCart,
  normalizeLine,
};
