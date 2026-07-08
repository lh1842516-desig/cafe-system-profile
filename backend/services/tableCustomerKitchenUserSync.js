/**
 * مزامنة حالة المتصلين (FAB) مع حالة المطبخ لكل طلب / دفعة kitchenBatchId.
 */
const { getOrders } = require('../data/store');
const { getKitchenStatus, normalizeKitchenStatusRead } = require('../data/kitchen');
const tableCustomerSessions = require('./tableCustomerSessions');
const { emitTableUsersUpdated } = require('./tableRealtime');

const STATUS = tableCustomerSessions.STATUS;
const PREPARED_RESET_MS = 2800;

/** @type {Map<string, NodeJS.Timeout>} */
const preparedResetTimers = new Map();

function timerKey(tableId, sessionId) {
  return `${String(tableId || '').trim()}\t${String(sessionId || '').trim()}`;
}

function userStatusFromKitchen(kitchenRaw) {
  const s = normalizeKitchenStatusRead(kitchenRaw);
  if (s === 'preparing' || s === 'editing') return STATUS.KITCHEN_PREPARING;
  if (s === 'completed') return STATUS.KITCHEN_PREPARED;
  if (s === 'held') return STATUS.AWAITING_PREP;
  return STATUS.AWAITING_PREP;
}

function relatedOrders(order) {
  if (!order) return [];
  const orders = getOrders();
  const bid = order.kitchenBatchId != null ? String(order.kitchenBatchId).trim() : '';
  if (!bid) return [order];
  const group = orders.filter(function (o) {
    return o && String(o.kitchenBatchId || '').trim() === bid;
  });
  return group.length ? group : [order];
}

function emitUsersForTable(io, tableId) {
  if (!io) return;
  const tid = String(tableId || '').trim();
  if (!tid) return;
  let users = tableCustomerSessions.listConnectedPublicUsers(tid);
  try {
    users = enrichUsersFromKitchenOrders(tid, users);
  } catch (_) {}
  const count = tableCustomerSessions.connectedCount(tid);
  emitTableUsersUpdated(io, { tableId: tid, users, count });
  try {
    const { broadcastUsers } = require('./tableCustomerSocket');
    broadcastUsers(io, tid);
  } catch (_) {}
}

function scheduleChoosingAfterPrepared(tableId, sessionId, io) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return;
  const key = timerKey(tid, sid);
  const prev = preparedResetTimers.get(key);
  if (prev) {
    try {
      clearTimeout(prev);
    } catch (_) {}
  }
  const timer = setTimeout(function () {
    preparedResetTimers.delete(key);
    tableCustomerSessions.setUserStatus(tid, sid, STATUS.CHOOSING, { internal: true });
    emitUsersForTable(io, tid);
  }, PREPARED_RESET_MS);
  preparedResetTimers.set(key, timer);
}

/**
 * @param {import('socket.io').Server|null} io
 * @param {string} orderId
 * @param {string} [kitchenStatusOverride] قيمة مطبخ خام (new|preparing|completed|editing)
 */
function syncUsersForKitchenOrder(io, orderId, kitchenStatusOverride) {
  const oid = String(orderId || '').trim();
  if (!oid) return;
  const orders = getOrders();
  const order = orders.find(function (o) {
    return o && String(o.id) === oid;
  });
  if (!order || order.tableId == null) return;

  const tableId = String(order.tableId);
  let kRaw = kitchenStatusOverride;
  if (kRaw == null || kRaw === '') {
    const ks = getKitchenStatus(oid);
    kRaw = ks && ks.status != null ? ks.status : 'new';
  }
  const userSt = userStatusFromKitchen(kRaw);
  const group = relatedOrders(order);

  group.forEach(function (o) {
    const sid = o.customerSessionId != null ? String(o.customerSessionId).trim() : '';
    if (!sid) return;
    tableCustomerSessions.setUserStatus(tableId, sid, userSt, { internal: true });
    if (userSt === STATUS.KITCHEN_PREPARED) {
      scheduleChoosingAfterPrepared(tableId, sid, io);
    } else {
      const key = timerKey(tableId, sid);
      const prev = preparedResetTimers.get(key);
      if (prev) {
        try {
          clearTimeout(prev);
        } catch (_) {}
        preparedResetTimers.delete(key);
      }
    }
  });

  emitUsersForTable(io, tableId);
}

/**
 * عند جلب قائمة المتصلين — مزامنة العرض مع حالة المطبخ إن وُجد طلب نشط.
 */
function enrichUsersFromKitchenOrders(tableId, users) {
  const tid = String(tableId || '').trim();
  if (!tid || !Array.isArray(users)) return users;
  const orders = getOrders().filter(function (o) {
    return o && String(o.tableId) === tid && o.closed !== true;
  });

  return users.map(function (u) {
    const sid = String((u && u.sessionId) || '').trim();
    if (!sid) return u;
    const stored = String((u && u.status) || STATUS.CHOOSING).toLowerCase();

    let match = null;
    orders.forEach(function (o) {
      if (o.customerSessionId == null) return;
      if (String(o.customerSessionId).trim() !== sid) return;
      if (!match || String(o.createdAt || '') > String(match.createdAt || '')) {
        match = o;
      }
    });
    if (!match) return u;

    const ks = getKitchenStatus(match.id);
    const kRaw = ks && ks.status != null ? ks.status : 'new';
    const kitchenNorm = normalizeKitchenStatusRead(kRaw);

    if (stored === STATUS.CHOOSING && kitchenNorm === 'completed') {
      return u;
    }
    if (isKitchenPipelineStatus(stored) || stored === STATUS.CHOOSING) {
      return Object.assign({}, u, { status: userStatusFromKitchen(kRaw) });
    }
    return u;
  });
}

function isKitchenPipelineStatus(st) {
  return tableCustomerSessions.isKitchenPipelineStatus(st);
}

module.exports = {
  syncUsersForKitchenOrder,
  enrichUsersFromKitchenOrders,
  userStatusFromKitchen,
  PREPARED_RESET_MS,
};
