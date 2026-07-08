/**
 * جلسة زبون دائمة بعد أول إرسال للمطبخ — تُبطل عند إغلاق فاتورة الطاولة من الكاشير.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR } = require('../config');
const { getOrders, getOrdersBlockingTableClaim } = require('../data/store');

const FILE = path.join(DATA_DIR, 'customer-persistent-sessions.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  ensureDir(path.dirname(FILE));
  if (!fs.existsSync(FILE)) {
    const empty = { byCustomerId: {} };
    fs.writeFileSync(FILE, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data.byCustomerId === 'object' ? data : { byCustomerId: {} };
  } catch {
    return { byCustomerId: {} };
  }
}

function writeStore(store) {
  ensureDir(path.dirname(FILE));
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8');
}

function normId(v) {
  return String(v != null ? v : '').trim();
}

function findOpenOrderForPeer(tableId, peerSessionId) {
  const tid = normId(tableId);
  const sid = normId(peerSessionId);
  if (!tid || !sid) return null;
  const orders = getOrders();
  for (let i = 0; i < orders.length; i += 1) {
    const o = orders[i];
    if (!o || o.closed === true) continue;
    if (normId(o.tableId) !== tid) continue;
    if (o.customerSessionId == null) continue;
    if (normId(o.customerSessionId) !== sid) continue;
    return o;
  }
  return null;
}

/**
 * @param {{ customerId?: string, peerSessionId: string, customerName: string, tableId: string, activeOrderId: string }}
 */
function registerSession(opts) {
  const peerSessionId = normId(opts && opts.peerSessionId);
  const tableId = normId(opts && opts.tableId);
  const activeOrderId = normId(opts && opts.activeOrderId);
  const customerName = normId(opts && opts.customerName).slice(0, 30);
  if (!peerSessionId || !tableId || !activeOrderId) {
    return { ok: false, code: 'invalid_input' };
  }

  let customerId = normId(opts && opts.customerId);
  if (!customerId) customerId = 'cust_' + uuidv4().replace(/-/g, '').slice(0, 12);

  const now = new Date().toISOString();
  const store = readStore();
  const prev = store.byCustomerId[customerId];
  const rec = {
    customerId,
    peerSessionId,
    customerName: customerName || (prev && prev.customerName) || '',
    tableId,
    activeOrderId,
    status: 'active',
    createdAt: (prev && prev.createdAt) || now,
    lastSeen: now,
  };
  store.byCustomerId[customerId] = rec;
  writeStore(store);
  return { ok: true, session: rec };
}

function touchSession(customerId) {
  const cid = normId(customerId);
  if (!cid) return null;
  const store = readStore();
  const rec = store.byCustomerId[cid];
  if (!rec || rec.status !== 'active') return null;
  rec.lastSeen = new Date().toISOString();
  store.byCustomerId[cid] = rec;
  writeStore(store);
  return rec;
}

/**
 * @param {{ customerId?: string, peerSessionId?: string, tableId: string, activeOrderId?: string }}
 */
function validateSession(opts) {
  const tableId = normId(opts && opts.tableId);
  if (!tableId) {
    return { valid: false, reason: 'missing_table' };
  }

  const customerId = normId(opts && opts.customerId);
  const peerSessionId = normId(opts && opts.peerSessionId);
  const orderHint = normId(opts && opts.activeOrderId);

  let rec = null;
  const store = readStore();

  if (customerId && store.byCustomerId[customerId]) {
    rec = store.byCustomerId[customerId];
  } else if (peerSessionId) {
    rec = Object.values(store.byCustomerId).find(
      (s) => s && s.status === 'active' && normId(s.peerSessionId) === peerSessionId
    );
  }

  if (!rec || rec.status !== 'active') {
    if (orderHint) {
      const ordersEarly = getOrders();
      const oEarly = ordersEarly.find((o) => o && String(o.id) === orderHint);
      if (oEarly && normId(oEarly.tableId) === tableId && oEarly.closed !== true) {
        const peerFromOrder =
          oEarly.customerSessionId != null ? normId(oEarly.customerSessionId) : '';
        if (!peerSessionId || peerFromOrder === peerSessionId || !peerFromOrder) {
          return {
            valid: true,
            customerId: customerId || '',
            peerSessionId: peerFromOrder || peerSessionId,
            customerName:
              oEarly.customerName != null ? String(oEarly.customerName).trim() : '',
            tableId,
            activeOrderId: String(oEarly.id),
          };
        }
      }
    }
    return { valid: false, reason: 'no_persistent_session' };
  }

  if (normId(rec.tableId) !== tableId) {
    return { valid: false, reason: 'table_mismatch' };
  }

  if (peerSessionId && normId(rec.peerSessionId) !== peerSessionId) {
    return { valid: false, reason: 'peer_session_mismatch' };
  }

  const oid = orderHint || normId(rec.activeOrderId);
  const orders = getOrders();
  const order = oid ? orders.find((o) => o && String(o.id) === oid) : null;

  if (order && normId(order.tableId) === tableId && order.closed !== true) {
    touchSession(rec.customerId);
    return {
      valid: true,
      customerId: rec.customerId,
      peerSessionId: rec.peerSessionId,
      customerName: rec.customerName,
      tableId: rec.tableId,
      activeOrderId: String(order.id),
    };
  }

  const open = findOpenOrderForPeer(tableId, rec.peerSessionId);
  if (open) {
    rec.activeOrderId = String(open.id);
    rec.lastSeen = new Date().toISOString();
    store.byCustomerId[rec.customerId] = rec;
    writeStore(store);
    return {
      valid: true,
      customerId: rec.customerId,
      peerSessionId: rec.peerSessionId,
      customerName: rec.customerName,
      tableId: rec.tableId,
      activeOrderId: String(open.id),
    };
  }

  const blocking = getOrdersBlockingTableClaim(tableId);
  if (blocking.length > 0 && normId(rec.peerSessionId)) {
    const mine = blocking.find(
      (o) => o.customerSessionId != null && normId(o.customerSessionId) === normId(rec.peerSessionId)
    );
    if (mine) {
      rec.activeOrderId = String(mine.id);
      rec.lastSeen = new Date().toISOString();
      store.byCustomerId[rec.customerId] = rec;
      writeStore(store);
      return {
        valid: true,
        customerId: rec.customerId,
        peerSessionId: rec.peerSessionId,
        customerName: rec.customerName,
        tableId: rec.tableId,
        activeOrderId: String(mine.id),
      };
    }
  }

  closeSession(rec.customerId);
  return { valid: false, reason: 'order_closed_or_missing' };
}

function closeSession(customerId) {
  const cid = normId(customerId);
  if (!cid) return false;
  const store = readStore();
  if (!store.byCustomerId[cid]) return false;
  store.byCustomerId[cid].status = 'closed';
  store.byCustomerId[cid].lastSeen = new Date().toISOString();
  writeStore(store);
  return true;
}

/** إغلاق كل جلسات الطاولة عند إغلاق الفاتورة من الكاشير */
function closeSessionsForTable(tableId) {
  const tid = normId(tableId);
  if (!tid) return 0;
  const store = readStore();
  let n = 0;
  Object.keys(store.byCustomerId).forEach((cid) => {
    const rec = store.byCustomerId[cid];
    if (rec && rec.status === 'active' && normId(rec.tableId) === tid) {
      rec.status = 'closed';
      rec.lastSeen = new Date().toISOString();
      n += 1;
    }
  });
  if (n) writeStore(store);
  return n;
}

module.exports = {
  registerSession,
  validateSession,
  touchSession,
  closeSession,
  closeSessionsForTable,
  findOpenOrderForPeer,
};
