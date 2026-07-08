/**
 * موافقة الكاشير قبل إرسال طلبات الزبائن إلى المطبخ.
 */
const { getOrders, saveOrders, getOrdersBlockingTableClaim } = require('../data/store');
const { getKitchenStatus, setKitchenStatus, removeKitchenEntry } = require('../data/kitchen');
const cafeSettingsStore = require('./cafeSettingsStore');
const tableCustomerKitchenUserSync = require('./tableCustomerKitchenUserSync');
const tableSessions = require('./tableSessions');
const { resolveTableStatus } = require('./tableStatusResolve');
const { emitTableUpdate, emitTableUsersUpdated } = require('./tableRealtime');
const tableCustomerSessions = require('./tableCustomerSessions');
const till = require('../data/till');
const { orderBelongsToSession } = require('./cashSessionHelper');

function isApprovalEnabled() {
  try {
    const s = cafeSettingsStore.getCafeSettings();
    return s.requireCashierKitchenApproval !== false;
  } catch (_) {
    return true;
  }
}

function shouldHoldCustomerOrder(order) {
  if (!isApprovalEnabled()) return false;
  if (!order || !order.customerSessionId) return false;
  const ot = String(order.orderType || 'DINE_IN').trim().toUpperCase();
  if (ot !== 'DINE_IN') return false;
  const tid = String(order.tableId || '').trim().toUpperCase();
  if (!tid || tid === 'TAKEAWAY' || tid === 'DELIVERY') return false;
  return true;
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

function isOrderHeld(orderId) {
  const ks = getKitchenStatus(orderId);
  return ks && String(ks.status || '').toLowerCase() === 'held';
}

function emitFullKitchenRelease(io, order, reason) {
  if (!io || !order) return;
  const tableIdStr = String(order.tableId);
  io.to('table-' + tableIdStr).emit('new-order', order);
  io.emit('new_order', {
    orderId: order.id,
    tableId: tableIdStr,
    orderType: order.orderType,
  });
  io.emit('orders-updated', {
    tableId: tableIdStr,
    orderId: order.id,
    reason: reason || 'cashier-approved',
  });
  io.emit('kitchen-updated', {
    orderId: order.id,
    reason: reason || 'cashier-approved',
    status: 'new',
  });
  io.emit('stats-updated');
  try {
    tableCustomerKitchenUserSync.syncUsersForKitchenOrder(io, order.id, 'new');
  } catch (_) {}
}

function holdCustomerOrderForCashier(io, order, reason) {
  if (!order || !order.id) return;
  setKitchenStatus(order.id, 'held');
  if (!io) return;
  const tableIdStr = String(order.tableId);
  io.emit('orders-updated', {
    tableId: tableIdStr,
    orderId: order.id,
    reason: reason || 'pending-cashier-approval',
  });
  io.emit('cashier-approval-pending', {
    orderId: order.id,
    tableId: tableIdStr,
    customerName: order.customerName || null,
    kitchenBatchId: order.kitchenBatchId || null,
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
  });
  try {
    tableCustomerKitchenUserSync.syncUsersForKitchenOrder(io, order.id, 'held');
  } catch (_) {}
}

function releaseOrderToKitchen(io, order, reason) {
  if (!order || !order.id) return false;
  if (!isOrderHeld(order.id)) return false;
  setKitchenStatus(order.id, 'new');
  emitFullKitchenRelease(io, order, reason || 'cashier-approved');
  return true;
}

function approveOrdersForCashier(io, seedOrder) {
  const group = relatedOrders(seedOrder);
  const approved = [];
  group.forEach(function (o) {
    if (!o || !o.id) return;
    if (!isOrderHeld(o.id)) return;
    if (releaseOrderToKitchen(io, o, 'cashier-approved')) {
      approved.push(o.id);
    }
  });
  return approved;
}

function emitTableUsersAfterReject(io, tableId) {
  if (!io) return;
  const tid = String(tableId || '').trim();
  if (!tid) return;
  try {
    const users = tableCustomerSessions.listConnectedPublicUsers(tid);
    const count = tableCustomerSessions.connectedCount(tid);
    emitTableUsersUpdated(io, { tableId: tid, users, count });
  } catch (_) {}
}

function rejectOrdersForCashier(io, seedOrder, sessionMeta) {
  const session = sessionMeta || till.getActiveSessionMeta();
  const orders = getOrders();
  const group = relatedOrders(seedOrder);
  const rejected = [];
  const now = new Date().toISOString();
  /** @type {Map<string, Array<{ orderId: string, customerSessionId: string }>>} */
  const tablesTouched = new Map();

  group.forEach(function (o) {
    if (!o || !o.id) return;
    if (!isOrderHeld(o.id)) return;
    const rec = orders.find(function (x) {
      return String(x.id) === String(o.id);
    });
    if (!rec || rec.closed) return;
    rec.closed = true;
    rec.closedAt = now;
    rec.rejectedByCashier = true;
    rec.cancelReason = 'cashier_rejected_approval';
    if (session) {
      if (!rec.open_date) rec.open_date = session.openDate;
      rec.close_open_date = session.openDate;
      rec.cash_session_id = session.sessionId;
    }
    removeKitchenEntry(rec.id);
    rejected.push(rec.id);
    const tableId = String(rec.tableId);
    if (!tablesTouched.has(tableId)) tablesTouched.set(tableId, []);
    tablesTouched.get(tableId).push({
      orderId: rec.id,
      customerSessionId: rec.customerSessionId ? String(rec.customerSessionId).trim() : '',
    });
  });

  if (!rejected.length) return [];

  saveOrders(orders);

  tablesTouched.forEach(function (entries, tableId) {
    entries.forEach(function (ent) {
      if (ent.customerSessionId) {
        tableCustomerSessions.setUserStatus(
          tableId,
          ent.customerSessionId,
          tableCustomerSessions.STATUS.CHOOSING,
          { internal: true }
        );
      }
      if (io) {
        io.to('table-' + tableId).emit('cashier-approval-rejected', {
          orderId: ent.orderId,
          tableId: tableId,
          customerSessionId: ent.customerSessionId || null,
          message: 'لم يوافق الكاشير على طلبك',
        });
        io.emit('orders-updated', {
          tableId: tableId,
          orderId: ent.orderId,
          reason: 'cashier-rejected',
        });
        io.emit('kitchen-updated', {
          orderId: ent.orderId,
          reason: 'cashier-rejected',
        });
      }
    });

    const remainingOpen = getOrdersBlockingTableClaim(tableId);
    let newBrowseSession = null;
    if (remainingOpen.length === 0) {
      newBrowseSession = tableSessions.createSessionAfterCancel(tableId, function (tid) {
        return getOrdersBlockingTableClaim(tid);
      });
    }
    const mineSid = newBrowseSession ? String(newBrowseSession.sessionId) : '';
    const nextStatus = resolveTableStatus(tableId, mineSid);
    emitTableUpdate(io, {
      tableId: tableId,
      status: nextStatus.status,
      sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null,
    });
    emitTableUsersAfterReject(io, tableId);
  });

  if (io) io.emit('stats-updated');
  return rejected;
}

function approveAllHeldOrdersForCashier(io) {
  const session = till.getActiveSessionMeta();
  if (!session || !session.openDate) return [];
  const orders = getOrders().filter(function (o) {
    return (
      o &&
      !o.closed &&
      o.customerSessionId &&
      isOrderHeld(o.id) &&
      orderBelongsToSession(o, session)
    );
  });
  const approved = [];
  const seen = new Set();
  orders.forEach(function (o) {
    if (!o || !o.id || seen.has(String(o.id))) return;
    const group = relatedOrders(o);
    group.forEach(function (g) {
      if (g && g.id) seen.add(String(g.id));
    });
    const ids = approveOrdersForCashier(io, o);
    ids.forEach(function (id) {
      if (approved.indexOf(id) === -1) approved.push(id);
    });
  });
  return approved;
}

module.exports = {
  isApprovalEnabled,
  shouldHoldCustomerOrder,
  relatedOrders,
  isOrderHeld,
  holdCustomerOrderForCashier,
  releaseOrderToKitchen,
  approveOrdersForCashier,
  rejectOrdersForCashier,
  approveAllHeldOrdersForCashier,
  emitFullKitchenRelease,
};
