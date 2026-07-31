/**
 * مسارات المطبخ: قائمة الانتظار، طلبات اليوم، وتحديث حالة الطلب.
 * حالات المطبخ: new → preparing → completed
 */

const express = require('express');
const config = require('../config');
const { authenticateToken } = require('./authMiddleware');
const orderRepo = require('../repository/orderRepository');
const tableRepo = require('../repository/tableRepository');
const kitchenRepo = require('../repository/kitchenRepository');
const till = require('../data/till');
const { orderBelongsToSession } = require('../services/cashSessionHelper');
const { resolveTableStatus } = require('../services/tableStatusResolve');
const { emitTableUpdate } = require('../services/tableRealtime');
const { mergeKitchenBatchTickets } = require('../services/kitchenBatchMerge');
const tableCustomerKitchenUserSync = require('../services/tableCustomerKitchenUserSync');
const { autoCloseIfServiceOrder } = require('../services/kitchenAutoCloseOrder');
const { recordTodaySessionForClosedOrder } = require('../services/todaySessionHistoryService');

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function normalizeKitchenStatus(raw) {
  if (!raw || raw === 'pending') return 'new';
  if (raw === 'editing') return 'editing';
  if (raw === 'prepared') return 'preparing';
  if (raw === 'closed') return 'completed';
  if (raw === 'held') return 'held';
  if (raw === 'new' || raw === 'preparing' || raw === 'completed') return raw;
  return 'new';
}

async function tableLabelFor(order, cafeId) {
  const tableIdRaw = String(order.tableId || '').trim();
  const tidUpper = tableIdRaw.toUpperCase();
  if (tidUpper === 'TAKEAWAY') return 'سفري';
  if (tidUpper === 'DELIVERY') return 'دلفري';
  const orderType = String(order.orderType || 'DINE_IN').trim().toUpperCase();
  if (orderType === 'TAKEAWAY') return 'سفري';
  if (orderType === 'DELIVERY') return 'دلفري';
  const tables = await tableRepo.getTables(cafeId);
  const row = tables.find((t) => String(t.id) === tableIdRaw);
  const lab = row && row.label != null ? String(row.label) : tableIdRaw;
  return 'طاولة ' + lab;
}

function orderTypeMeta(order) {
  const tidUpper = String(order.tableId || '').trim().toUpperCase();
  let type = String(order.orderType || '').trim().toUpperCase();
  if (!type || type === 'DINE_IN') {
    if (tidUpper === 'TAKEAWAY') type = 'TAKEAWAY';
    else if (tidUpper === 'DELIVERY') type = 'DELIVERY';
    else type = 'DINE_IN';
  }
  if (type === 'TAKEAWAY') return { code: 'TAKEAWAY', label: '🥡 سفري' };
  if (type === 'DELIVERY') return { code: 'DELIVERY', label: '🚚 دلفري' };
  return { code: 'DINE_IN', label: '🍽️ داخل الصالة' };
}

function orderTotal(order) {
  return (order.items || []).reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
}

async function mapOrderToKitchenTicket(cafeId, order, kitchenState, now) {
  const nowDate = now || new Date();
  const ks = kitchenState[order.id] || {};
  let status = normalizeKitchenStatus(ks.status);
  const updatedAt = ks.updatedAt || order.createdAt || new Date().toISOString();
  const createdAt = ks.createdAt || order.createdAt || updatedAt;

  if (!order.closed && status === 'completed') {
    const d = new Date(updatedAt);
    if (!isSameDay(d, nowDate)) status = 'new';
  }

  const serviceMeta = order.serviceMeta && typeof order.serviceMeta === 'object' ? order.serviceMeta : {};
  let customerNameRaw = order.customerName != null && String(order.customerName).trim() ? order.customerName : serviceMeta.customerName;
  if (!customerNameRaw && serviceMeta.cashierName) customerNameRaw = 'كاشير';
  const customerName = customerNameRaw != null ? String(customerNameRaw).trim().slice(0, 30) : '';
  const typeMeta = orderTypeMeta(order);
  const isServiceOrder = typeMeta.code === 'TAKEAWAY' || typeMeta.code === 'DELIVERY';
  const kitchenBatchId = order.kitchenBatchId != null ? String(order.kitchenBatchId).trim() : '';
  const bundledCustomerNames = Array.isArray(order.bundledCustomerNames)
    ? order.bundledCustomerNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  const label = await tableLabelFor(order, cafeId);
  return {
    id: order.id, orderId: order.id, tableId: order.tableId,
    tableLabel: label, orderType: typeMeta.code, orderTypeLabel: typeMeta.label,
    serviceMeta: undefined,
    customerName: isServiceOrder ? undefined : customerName || undefined,
    kitchenBatchId: kitchenBatchId || undefined,
    bundledCustomerNames: bundledCustomerNames.length ? bundledCustomerNames : undefined,
    items: order.items || [], total: orderTotal(order), createdAt: order.createdAt,
    status, updatedAt, kitchenCreatedAt: createdAt,
  };
}

function includeTicketInKitchen(order, ticket, now) {
  if (ticket.status === 'completed') {
    const d = new Date(ticket.updatedAt || ticket.createdAt);
    return isSameDay(d, now);
  }
  return !order.closed;
}

function sortByKitchenTime(a, b) {
  const ta = new Date(a.kitchenCreatedAt || a.createdAt || 0).getTime();
  const tb = new Date(b.kitchenCreatedAt || b.createdAt || 0).getTime();
  return ta - tb;
}

function createKitchenRouter(io) {
  const router = express.Router();
  router.use(authenticateToken);

  router.get('/queue', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const kitchenState = await kitchenRepo.getKitchenState(cafeId);
      const now = new Date();
      
      const mappedPairs = await Promise.all(
        orders
          .filter((o) => orderBelongsToSession(o, session))
          .map(async (o) => {
            const ticket = await mapOrderToKitchenTicket(cafeId, o, kitchenState, now);
            return { order: o, ticket };
          })
      );
      
      const all = mappedPairs
        .filter((pair) => includeTicketInKitchen(pair.order, pair.ticket, now))
        .map((pair) => pair.ticket)
        .filter((t) => t.status !== 'completed' && t.status !== 'held');
        
      const newOrders = mergeKitchenBatchTickets(all.filter((t) => t.status === 'new' || t.status === 'editing').sort(sortByKitchenTime));
      const preparing = mergeKitchenBatchTickets(all.filter((t) => t.status === 'preparing').sort(sortByKitchenTime));
      res.json({ new: newOrders, preparing });
    } catch (e) {
      console.error('kitchen queue error', e);
      res.status(500).json({ error: 'فشل تحميل قائمة المطبخ' });
    }
  });

  router.get('/today', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const kitchenState = await kitchenRepo.getKitchenState(cafeId);
      const now = new Date();
      
      const todayTickets = await Promise.all(
        orders
          .filter((o) => orderBelongsToSession(o, session))
          .map((o) => mapOrderToKitchenTicket(cafeId, o, kitchenState, now))
      );
      
      const sortedTickets = todayTickets
        .filter((t) => t.status === 'completed')
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      res.json(sortedTickets);
    } catch (e) {
      console.error('kitchen today error', e);
      res.status(500).json({ error: 'فشل تحميل طلبات اليوم' });
    }
  });

  router.post('/:orderId/status', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const { orderId } = req.params;
      const { status } = req.body || {};
      const allowed = ['new', 'preparing', 'completed'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });

      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === String(orderId));
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

      const ksCur = await kitchenRepo.getKitchenStatus(cafeId, orderId);
      const curRaw = ksCur && ksCur.status != null ? String(ksCur.status).toLowerCase() : '';
      if (status === 'preparing' && curRaw === 'editing') {
        return res.status(409).json({ error: 'الزبون يعدّل الطلب حالياً. انتظر حتى ينهي التعديل.', code: 'CUSTOMER_EDITING' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }

      const updated = await kitchenRepo.setKitchenStatus(cafeId, orderId, status);
      let closedByKitchen = false;
      if (status === 'completed') {
        closedByKitchen = autoCloseIfServiceOrder(order, session);
        if (closedByKitchen) {
          await orderRepo.saveOrders(cafeId, orders);
          try { recordTodaySessionForClosedOrder(cafeId, order, session); } catch (histErr) {
            console.error('today session record (kitchen)', histErr);
          }
        }
      }
      try { await tableCustomerKitchenUserSync.syncUsersForKitchenOrder(cafeId, io, orderId, status); } catch (_) {}

      const { tableRoomName } = require('../services/tableRoomHelper');
      if (io) {
        const tidForStatus = String(order.tableId);
        const nextTableStatus = await resolveTableStatus(cafeId, tidForStatus, '');
        emitTableUpdate(io, { tableId: tidForStatus, status: nextTableStatus.status, sessionId: nextTableStatus.status === 'in_use' ? nextTableStatus.sessionId : null }, cafeId);
        const room = tableRoomName(order.tableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId, status });
        io.to(room).emit('kitchen-updated', { orderId, status });
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId: String(order.tableId), orderId, reason: closedByKitchen ? 'order-closed' : 'kitchen-status' });
        if (closedByKitchen) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
        if (config.DEBUG_SOCKET) {
          console.log('[socket emit] kitchen-updated + orders-updated', orderId, status, 'clients:', io.engine.clientsCount);
        }
        if (status === 'completed') {
          const tableId = String(order.tableId);
          io.to(room).emit('order_ready', { orderId, tableId });
          io.to('cafe-' + cafeId + '-staff').emit('order_ready', { orderId, tableId });
        }
      }
      res.json({ ok: true, kitchen: updated });
    } catch (e) {
      console.error('kitchen status error', e);
      res.status(500).json({ error: 'فشل تحديث حالة المطبخ' });
    }
  });

  return router;
}

module.exports = createKitchenRouter;
