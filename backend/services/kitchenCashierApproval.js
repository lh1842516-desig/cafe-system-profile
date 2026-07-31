/**
 * موافقة الكاشير قبل إرسال طلبات الزبائن إلى المطبخ.
 * All write functions are now async (setKitchenStatus, saveOrders, removeKitchenEntry).
 */
const orderRepo = require('../repository/orderRepository');
const kitchenRepo = require('../repository/kitchenRepository');
const tillRepo = require('../repository/tillRepository');
const cafeSettingsStore = require('./cafeSettingsStore');
const tableSessions = require('./tableSessions');
const { resolveTableStatus } = require('./tableStatusResolve');
const { emitTableUpdate, emitTableUsersUpdated } = require('./tableRealtime');
const { orderBelongsToSession } = require('./cashSessionHelper');

async function isApprovalEnabled(cafeId) {
  try {
    const s = await cafeSettingsStore.getCafeSettings(cafeId);
    return s.requireCashierKitchenApproval !== false;
  } catch (_) {
    return true;
  }
}

async function shouldHoldCustomerOrder(order, fallbackCafeId) {
  if (!order) return false;
  const cafeId = order.cafe_id || order.cafeId || fallbackCafeId || require('../lib/cafeContext').getDefaultCafeId();
  if (!await isApprovalEnabled(cafeId)) return false;
  if (!order.customerSessionId) return false;
  const ot = String(order.orderType || 'DINE_IN').trim().toUpperCase();
  if (ot !== 'DINE_IN') return false;
  const tid = String(order.tableId || '').trim().toUpperCase();
  if (!tid || tid === 'TAKEAWAY' || tid === 'DELIVERY') return false;
  return true;
}

async function relatedOrders(cafeId, order) {
  if (!order) return [];
  const orders = await orderRepo.getOrders(cafeId);
  const bid = order.kitchenBatchId != null ? String(order.kitchenBatchId).trim() : '';
  if (!bid) return [order];
  const group = orders.filter(o => o && String(o.kitchenBatchId || '').trim() === bid);
  return group.length ? group : [order];
}

async function isOrderHeld(cafeId, orderId) {
  const ks = await kitchenRepo.getKitchenStatus(cafeId, orderId);
  return ks && String(ks.status || '').toLowerCase() === 'held';
}

const { tableRoomName } = require('./tableRoomHelper');

// emitFullKitchenRelease remains sync (no DB writes)
function emitFullKitchenRelease(io, order, reason) {
  if (!io || !order) return;
  const cafeId = order.cafe_id || order.cafeId || require('../lib/cafeContext').getDefaultCafeId();
  const tableIdStr = String(order.tableId);
  const room = tableRoomName(tableIdStr, cafeId);
  io.to(room).emit('new-order', order);
  io.to('cafe-' + cafeId + '-staff').emit('new_order', { orderId: order.id, tableId: tableIdStr, orderType: order.orderType });
  io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId: tableIdStr, orderId: order.id, reason: reason || 'cashier-approved' });
  io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId: order.id, reason: reason || 'cashier-approved', status: 'new' });
  io.to(room).emit('kitchen-updated', { orderId: order.id, reason: reason || 'cashier-approved', status: 'new' });
  io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
}

async function holdCustomerOrderForCashier(cafeId, io, order, reason) {
  if (!order || !order.id) return;
  await kitchenRepo.setKitchenStatus(cafeId, order.id, 'held');
  if (!io) return;
  const tableIdStr = String(order.tableId);
  io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId: tableIdStr, orderId: order.id, reason: reason || 'pending-cashier-approval' });
  io.to('cafe-' + cafeId + '-staff').emit('cashier-approval-pending', {
    orderId: order.id,
    tableId: tableIdStr,
    customerName: order.customerName || null,
    kitchenBatchId: order.kitchenBatchId || null,
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
  });
}

async function releaseOrderToKitchen(cafeId, io, order, reason) {
  if (!order || !order.id) return false;
  if (!await isOrderHeld(cafeId, order.id)) return false;
  await kitchenRepo.setKitchenStatus(cafeId, order.id, 'new');
  emitFullKitchenRelease(io, order, reason || 'cashier-approved');
  return true;
}

async function approveOrdersForCashier(cafeId, io, seedOrder) {
  const group = await relatedOrders(cafeId, seedOrder);
  const approved = [];
  for (const o of group) {
    if (!o || !o.id) continue;
    if (!await isOrderHeld(cafeId, o.id)) continue;
    if (await releaseOrderToKitchen(cafeId, io, o, 'cashier-approved')) {
      approved.push(o.id);
    }
  }
  return approved;
}


async function rejectOrdersForCashier(cafeId, io, seedOrder, sessionMeta) {
  const session = sessionMeta || await tillRepo.getActiveSessionMeta(cafeId);
  const orders = await orderRepo.getOrders(cafeId);
  const group = await relatedOrders(cafeId, seedOrder);
  const rejected = [];
  const now = new Date().toISOString();
  const tablesTouched = new Map();

  for (const o of group) {
    if (!o || !o.id) continue;
    if (!await isOrderHeld(cafeId, o.id)) continue;
    const rec = orders.find(x => String(x.id) === String(o.id));
    if (!rec || rec.closed) continue;
    rec.closed = true;
    rec.closedAt = now;
    rec.rejectedByCashier = true;
    rec.cancelReason = 'cashier_rejected_approval';
    if (session) {
      if (!rec.open_date) rec.open_date = session.openDate;
      rec.close_open_date = session.openDate;
      rec.cash_session_id = session.sessionId;
    }
    await kitchenRepo.removeKitchenEntry(cafeId, rec.id);
    rejected.push(rec.id);
    const tableId = String(rec.tableId);
    if (!tablesTouched.has(tableId)) tablesTouched.set(tableId, []);
    tablesTouched.get(tableId).push({
      orderId: rec.id,
      customerSessionId: rec.customerSessionId ? String(rec.customerSessionId).trim() : '',
    });
  }

  if (!rejected.length) return [];

  await orderRepo.saveOrders(cafeId, orders);

  for (const [tableId, entries] of tablesTouched) {
    entries.forEach(function (ent) {
      if (io) {
        const room = tableRoomName(tableId, cafeId);
        io.to(room).emit('cashier-approval-rejected', {
          orderId: ent.orderId, tableId, customerSessionId: ent.customerSessionId || null,
          message: 'لم يوافق الكاشير على طلبك',
        });
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId, orderId: ent.orderId, reason: 'cashier-rejected' });
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId: ent.orderId, reason: 'cashier-rejected' });
        io.to(room).emit('kitchen-updated', { orderId: ent.orderId, reason: 'cashier-rejected' });
      }
    });

    const remainingOpen = await orderRepo.getOrdersBlockingTableClaim(cafeId, tableId);
    let newBrowseSession = null;
    if (remainingOpen.length === 0) {
      newBrowseSession = tableSessions.createSessionAfterCancel(tableId, () => remainingOpen);
    }
    const mineSid = newBrowseSession ? String(newBrowseSession.sessionId) : '';
    const nextStatus = await resolveTableStatus(cafeId, tableId, mineSid);
    emitTableUpdate(io, { tableId, status: nextStatus.status, sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null }, cafeId);
  }

  if (io) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
  return rejected;
}

async function approveAllHeldOrdersForCashier(cafeId, io) {
  const session = await tillRepo.getActiveSessionMeta(cafeId);
  if (!session || !session.openDate) return [];
  const allOrders = await orderRepo.getOrders(cafeId);
  const orders = [];
  for (const o of allOrders) {
    if (o && !o.closed && o.customerSessionId && orderBelongsToSession(o, session)) {
      if (await isOrderHeld(cafeId, o.id)) {
        orders.push(o);
      }
    }
  }
  const approved = [];
  const seen = new Set();
  for (const o of orders) {
    if (!o || !o.id || seen.has(String(o.id))) continue;
    const group = await relatedOrders(cafeId, o);
    group.forEach(g => { if (g && g.id) seen.add(String(g.id)); });
    const ids = await approveOrdersForCashier(cafeId, io, o);
    ids.forEach(id => { if (!approved.includes(id)) approved.push(id); });
  }
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
