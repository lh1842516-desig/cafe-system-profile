/**
 * مسارات المطبخ: قائمة الانتظار، طلبات اليوم، وتحديث حالة الطلب.
 * حالات المطبخ: new → preparing → completed
 */

const express = require('express');
const config = require('../config');
const { getOrders, getTables, saveOrders } = require('../data/store');
const { getKitchenState, setKitchenStatus, getKitchenStatus } = require('../data/kitchen');
const till = require('../data/till');
const { orderBelongsToSession } = require('../services/cashSessionHelper');
const { resolveTableStatus } = require('../services/tableStatusResolve');
const { emitTableUpdate } = require('../services/tableRealtime');
const { mergeKitchenBatchTickets } = require('../services/kitchenBatchMerge');
const tableCustomerKitchenUserSync = require('../services/tableCustomerKitchenUserSync');
const { autoCloseIfServiceOrder } = require('../services/kitchenAutoCloseOrder');
const { recordTodaySessionForClosedOrder } = require('../services/todaySessionHistoryService');

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** تحويل القيم القديمة من kitchen.json */
function normalizeKitchenStatus(raw) {
  if (!raw || raw === 'pending') return 'new';
  if (raw === 'editing') return 'editing';
  if (raw === 'prepared') return 'preparing';
  if (raw === 'closed') return 'completed';
  if (raw === 'held') return 'held';
  if (raw === 'new' || raw === 'preparing' || raw === 'completed') return raw;
  return 'new';
}

function tableLabelFor(order) {
  const tableIdRaw = String(order.tableId || '').trim();
  const tidUpper = tableIdRaw.toUpperCase();
  if (tidUpper === 'TAKEAWAY') return 'سفري';
  if (tidUpper === 'DELIVERY') return 'دلفري';
  const orderType = String(order.orderType || 'DINE_IN').trim().toUpperCase();
  if (orderType === 'TAKEAWAY') return 'سفري';
  if (orderType === 'DELIVERY') return 'دلفري';
  const tables = getTables();
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
  if (type === 'TAKEAWAY') {
    return { code: 'TAKEAWAY', label: '🥡 سفري' };
  }
  if (type === 'DELIVERY') {
    return { code: 'DELIVERY', label: '🚚 دلفري' };
  }
  return { code: 'DINE_IN', label: '🍽️ داخل الصالة' };
}

function orderTotal(order) {
  return (order.items || []).reduce(function (sum, it) {
    return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0);
  }, 0);
}

/**
 * إن كان الطلب ما زال مفتوحاً في النظام وفي ملف المطبخ حالة قديمة «مكتمل/مغلق»
 * بتاريخ ليس اليوم، لا نُخفِ الطلب عن المطبخ — نعامله كطلب جديد.
 */
function mapOrderToKitchenTicket(order, kitchenState, now) {
  const nowDate = now || new Date();
  const ks = kitchenState[order.id] || {};
  let status = normalizeKitchenStatus(ks.status);
  const updatedAt = ks.updatedAt || order.createdAt || new Date().toISOString();
  const createdAt = ks.createdAt || order.createdAt || updatedAt;

  if (!order.closed && status === 'completed') {
    const d = new Date(updatedAt);
    if (!isSameDay(d, nowDate)) {
      status = 'new';
    }
  }

  const serviceMeta = order.serviceMeta && typeof order.serviceMeta === 'object' ? order.serviceMeta : {};
  let customerNameRaw =
    order.customerName != null && String(order.customerName).trim()
      ? order.customerName
      : serviceMeta.customerName;
  if (!customerNameRaw && serviceMeta.cashierName) {
    customerNameRaw = 'كاشير';
  }
  const customerName = customerNameRaw != null ? String(customerNameRaw).trim().slice(0, 30) : '';
  const typeMeta = orderTypeMeta(order);
  const isServiceOrder = typeMeta.code === 'TAKEAWAY' || typeMeta.code === 'DELIVERY';
  const kitchenBatchId =
    order.kitchenBatchId != null ? String(order.kitchenBatchId).trim() : '';
  const bundledCustomerNames = Array.isArray(order.bundledCustomerNames)
    ? order.bundledCustomerNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  return {
    id: order.id,
    orderId: order.id,
    tableId: order.tableId,
    tableLabel: tableLabelFor(order),
    orderType: typeMeta.code,
    orderTypeLabel: typeMeta.label,
    serviceMeta: undefined,
    customerName: isServiceOrder ? undefined : customerName || undefined,
    kitchenBatchId: kitchenBatchId || undefined,
    bundledCustomerNames: bundledCustomerNames.length ? bundledCustomerNames : undefined,
    items: order.items || [],
    total: orderTotal(order),
    createdAt: order.createdAt,
    status,
    updatedAt,
    kitchenCreatedAt: createdAt,
  };
}

/** طلب يظهر في عمود جديد/تجهيز فقط إن لم يُغلق؛ المكتملة اليوم تُعرض حسب التاريخ */
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

  /**
   * GET /api/kitchen/queue — جديدة + قيد التجهيز فقط (الطلبات الحالية).
   * الطلبات المكتملة لا تُعاد هنا؛ تُعرض عبر GET /today (صندوق طلبات اليوم).
   */
  router.get('/queue', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders();
      const kitchenState = getKitchenState();
      const now = new Date();
      const all = orders
        .filter((o) => orderBelongsToSession(o, session))
        .map((o) => ({ order: o, ticket: mapOrderToKitchenTicket(o, kitchenState, now) }))
        .filter(function (pair) {
          return includeTicketInKitchen(pair.order, pair.ticket, now);
        })
        .map(function (pair) {
          return pair.ticket;
        })
        .filter(function (t) {
          return t.status !== 'completed' && t.status !== 'held';
        });

      const newOrders = mergeKitchenBatchTickets(
        all.filter((t) => t.status === 'new' || t.status === 'editing').sort(sortByKitchenTime)
      );
      const preparing = mergeKitchenBatchTickets(
        all.filter((t) => t.status === 'preparing').sort(sortByKitchenTime)
      );

      res.json({
        new: newOrders,
        preparing,
      });
    } catch (e) {
      console.error('kitchen queue error', e);
      res.status(500).json({ error: 'فشل تحميل قائمة المطبخ' });
    }
  });

  /** GET /api/kitchen/today — طلبات مكتملة اليوم (صندوق طلبات اليوم) */
  router.get('/today', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders();
      const kitchenState = getKitchenState();
      const now = new Date();
      const todayTickets = orders
        .filter((o) => orderBelongsToSession(o, session))
        .map((o) => mapOrderToKitchenTicket(o, kitchenState, now))
        .filter((t) => {
          return t.status === 'completed';
        })
        .sort((a, b) => {
          const ta = new Date(a.updatedAt || 0).getTime();
          const tb = new Date(b.updatedAt || 0).getTime();
          return tb - ta;
        });

      res.json(todayTickets);
    } catch (e) {
      console.error('kitchen today error', e);
      res.status(500).json({ error: 'فشل تحميل طلبات اليوم' });
    }
  });

  /** POST /api/kitchen/:orderId/status — body: { status: 'new'|'preparing'|'completed' } */
  router.post('/:orderId/status', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const { orderId } = req.params;
      const { status } = req.body || {};
      const allowed = ['new', 'preparing', 'completed'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'حالة غير صالحة' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === String(orderId));
      if (!order) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }
      const ksCur = getKitchenStatus(orderId);
      const curRaw = ksCur && ksCur.status != null ? String(ksCur.status).toLowerCase() : '';
      if (status === 'preparing' && curRaw === 'editing') {
        return res.status(409).json({
          error: 'الزبون يعدّل الطلب حالياً. انتظر حتى ينهي التعديل.',
          code: 'CUSTOMER_EDITING',
        });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      const updated = setKitchenStatus(orderId, status);
      let closedByKitchen = false;
      if (status === 'completed') {
        closedByKitchen = autoCloseIfServiceOrder(order, session);
        if (closedByKitchen) {
          saveOrders(orders);
          try {
            recordTodaySessionForClosedOrder(order, session);
          } catch (histErr) {
            console.error('today session record (kitchen)', histErr);
          }
        }
      }
      try {
        tableCustomerKitchenUserSync.syncUsersForKitchenOrder(io, orderId, status);
      } catch (syncErr) {
        console.error('kitchen user status sync', syncErr);
      }
      if (io) {
        /* حالة الطاولة للزبون: طالما يوجد طلب غير مُغلق في القاصة تبقى «مشغولة» حتى يغلق الكاشير الفاتورة */
        const tidForStatus = String(order.tableId);
        const nextTableStatus = resolveTableStatus(tidForStatus, '');
        emitTableUpdate(io, {
          tableId: tidForStatus,
          status: nextTableStatus.status,
          sessionId: nextTableStatus.status === 'in_use' ? nextTableStatus.sessionId : null,
        });
        io.emit('kitchen-updated', { orderId, status });
        io.emit('orders-updated', {
          tableId: String(order.tableId),
          orderId,
          reason: closedByKitchen ? 'order-closed' : 'kitchen-status',
        });
        if (closedByKitchen) {
          io.emit('stats-updated');
        }
        if (config.DEBUG_SOCKET) {
          console.log('[socket emit] kitchen-updated + orders-updated', orderId, status, 'clients:', io.engine.clientsCount);
        }
      // إشعار للكابتن عند تجهيز الطلب
      if (status === 'completed') {
        const tableId = String(order.tableId);
        io.to('table-' + tableId).emit('order_ready', { orderId: orderId, tableId: tableId });
        // نسخة احتياطية (في حال الكابتن لم ينضم لغرفة الطاولة)
        io.emit('order_ready', { orderId: orderId, tableId: tableId });
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
