/**
 * مسارات API للطلبات والطاولات
 */
const express = require('express');
const { assertMenuItemAvailable } = require('../services/menuAvailability');
const {
  getMenuItem,
  getOrders,
  getOrdersByTable,
  getOrdersBlockingTableClaim,
  getAllOrdersForTable,
  saveOrders,
  getTables,
  getNextOrderSequence,
  ensureOrderSequenceAtLeast,
  getOrderDisplayId,
} = require('../data/store');
const { addOrderToArchive } = require('../data/archive');
const till = require('../data/till');
const { orderBelongsToSession } = require('../services/cashSessionHelper');
const config = require('../config');
const tableSessions = require('../services/tableSessions');
const tableCustomerSessions = require('../services/tableCustomerSessions');
const tableCustomerCart = require('../services/tableCustomerCart');
const tableCustomerCoordination = require('../services/tableCustomerCoordination');
const { emitTableUpdate, emitTableUsersUpdated } = require('../services/tableRealtime');
const { resolveTableStatus } = require('../services/tableStatusResolve');
const { getKitchenStatus, setKitchenStatus, removeKitchenEntry } = require('../data/kitchen');
const tableCustomerKitchenUserSync = require('../services/tableCustomerKitchenUserSync');
const customerPersistentSession = require('../services/customerPersistentSession');
const customerDeviceSession = require('../services/customerDeviceSession');
const tableBillRequestService = require('../services/tableBillRequestService');
const { emitBillRequestCleared } = require('../services/tableCustomerSocket');
const kitchenCashierApproval = require('../services/kitchenCashierApproval');

function createOrdersRouter(io) {
  const router = express.Router();
  const ORDER_TYPE = {
    DINE_IN: 'DINE_IN',
    TAKEAWAY: 'TAKEAWAY',
    DELIVERY: 'DELIVERY',
  };

  function normalizeOrderType(raw) {
    const val = String(raw == null ? '' : raw).trim().toUpperCase();
    if (val === ORDER_TYPE.TAKEAWAY || val === ORDER_TYPE.DELIVERY) return val;
    return ORDER_TYPE.DINE_IN;
  }

  function inferOrderTypeFromRecord(order) {
    const tid = String(order && order.tableId != null ? order.tableId : '')
      .trim()
      .toUpperCase();
    if (tid === ORDER_TYPE.TAKEAWAY) return ORDER_TYPE.TAKEAWAY;
    if (tid === ORDER_TYPE.DELIVERY) return ORDER_TYPE.DELIVERY;
    return normalizeOrderType(order && order.orderType);
  }

  function normalizeDeliveryInfo(serviceMeta) {
    const meta = serviceMeta && typeof serviceMeta === 'object' ? serviceMeta : {};
    const customerName = String(meta.customerName == null ? '' : meta.customerName).trim().slice(0, 80);
    const phoneNumber = String(meta.phoneNumber == null ? '' : meta.phoneNumber).trim().slice(0, 40);
    const address = String(meta.address == null ? '' : meta.address).trim().slice(0, 260);
    return { customerName, phoneNumber, address };
  }

  function normalizeTakeawayInfo(serviceMeta) {
    const meta = serviceMeta && typeof serviceMeta === 'object' ? serviceMeta : {};
    const cashierName = String(meta.cashierName == null ? '' : meta.cashierName).trim().slice(0, 80);
    return { cashierName };
  }

  /** يتحقق من أن الخيارات المرسلة ضمن القيم المعرّفة في المنيو فقط (single / multi) */
  function sanitizeSelectedOptions(menuItem, row) {
    const raw = row && row.selectedOptions;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const groups = menuItem && Array.isArray(menuItem.options) ? menuItem.options : [];
    if (!groups.length) return {};
    const out = {};
    groups.forEach((g) => {
      const title = g && g.title != null ? String(g.title).trim() : '';
      if (!title) return;
      if (!Object.prototype.hasOwnProperty.call(raw, title)) return;
      const allowed = (g.values || []).map((v) => String(v == null ? '' : v).trim());
      const isMulti = g.type === 'multi';
      if (isMulti) {
        let arr = Array.isArray(raw[title])
          ? raw[title]
          : String(raw[title] || '')
              .split(/[,،]+/g)
              .map((s) => String(s || '').trim())
              .filter(Boolean);
        arr = arr.filter((x) => allowed.includes(String(x).trim()));
        if (arr.length) out[title] = arr;
      } else {
        const want = String(raw[title] != null ? raw[title] : '').trim();
        if (want && allowed.includes(want)) out[title] = want;
      }
    });
    return out;
  }

  router.get('/today', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders().filter((o) => orderBelongsToSession(o, session));
      const list = orders.map((o) => {
        const total = (o.items || []).reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
        return {
          ...o,
          orderType: inferOrderTypeFromRecord(o),
          total,
          displayOrderId: getOrderDisplayId(o.id),
        };
      });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function tableLabelForOrder(order) {
    const tableIdRaw = String((order && order.tableId) || '').trim();
    const tables = getTables();
    const row = tables.find((t) => String(t.id) === tableIdRaw);
    const lab = row && row.label != null ? String(row.label) : tableIdRaw;
    return 'طاولة ' + lab;
  }

  /** طلبات زبائن بانتظار موافقة الكاشير قبل المطبخ */
  router.get('/pending-cashier-approval', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders().filter(function (o) {
        return (
          o &&
          !o.closed &&
          o.customerSessionId &&
          orderBelongsToSession(o, session) &&
          kitchenCashierApproval.isOrderHeld(o.id)
        );
      });
      const list = orders.map(function (o) {
        const total = (o.items || []).reduce(function (sum, it) {
          return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0);
        }, 0);
        return {
          id: o.id,
          tableId: o.tableId,
          tableLabel: tableLabelForOrder(o),
          customerName: o.customerName || null,
          kitchenBatchId: o.kitchenBatchId || null,
          bundledCustomerNames: o.bundledCustomerNames || null,
          items: o.items || [],
          total,
          createdAt: o.createdAt,
          displayOrderId: getOrderDisplayId(o.id),
        };
      });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/tables', (req, res) => {
    try {
      res.json(getTables());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/table/:tableId', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrdersByTable(req.params.tableId).filter((o) => orderBelongsToSession(o, session));
      res.json(orders.map((o) => ({ ...o, displayOrderId: getOrderDisplayId(o.id) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/table/:tableId/all', (req, res) => {
    try {
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const all = getAllOrdersForTable(req.params.tableId).filter((o) => orderBelongsToSession(o, session));
      res.json(all.map((o) => ({ ...o, displayOrderId: getOrderDisplayId(o.id) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const { tableId, items, customerName, customerSessionId, orderType: rawOrderType, serviceMeta } = req.body;
      const orderType = normalizeOrderType(rawOrderType);
      const needsTable = orderType === ORDER_TYPE.DINE_IN;
      if ((!tableId && needsTable) || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'بيانات الطلب غير مكتملة: tableId (داخل الصالة) وقائمة items مطلوبة' });
      }

      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن إرسال الطلب لأن قاصة اليوم غير مفتوحة.' });
      }

      const tableIdStrEarly = needsTable ? String(tableId) : orderType;
      if (needsTable) {
        try {
          tableBillRequestService.assertCanOrder(tableIdStrEarly);
        } catch (billErr) {
          return res.status(billErr.status || 409).json({
            error: billErr.message,
            code: billErr.code || tableBillRequestService.BILL_BLOCKED_CODE,
          });
        }
      }

      const orderItems = items.map((row) => {
        const menuItem = getMenuItem(row.menuId);
        assertMenuItemAvailable(menuItem, row.menuId);
        const selectedOptions = sanitizeSelectedOptions(menuItem, row);
        return {
          menuId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: Number(row.quantity) || 1,
          note: row.note ? String(row.note).trim() : '',
          selectedOptions,
        };
      });

      const tableIdStr = needsTable ? String(tableId) : orderType;
      const openDate = session.openDate;
      const orders = getOrders();
      let seq = getNextOrderSequence(openDate);
      const idPrefix = orderType === ORDER_TYPE.DELIVERY ? 'D' : orderType === ORDER_TYPE.TAKEAWAY ? 'K' : 'T' + tableIdStr;
      let orderId = idPrefix + '-' + String(seq).padStart(3, '0');
      while (orders.some((o) => o.id === orderId)) {
        seq += 1;
        orderId = idPrefix + '-' + String(seq).padStart(3, '0');
      }
      ensureOrderSequenceAtLeast(openDate, seq);

      const nameTrim =
        customerName != null ? String(customerName).trim().slice(0, 30) : '';
      const newOrder = {
        id: orderId,
        tableId: tableIdStr,
        orderType,
        items: orderItems,
        createdAt: new Date().toISOString(),
        open_date: openDate,
        cash_session_id: session.sessionId,
        closed: false,
        tillOpenedAt: session.openedAt || null,
      };
      if (nameTrim) newOrder.customerName = nameTrim;
      if (customerSessionId != null && String(customerSessionId).trim()) {
        newOrder.customerSessionId = String(customerSessionId).trim();
      }
      if (orderType === ORDER_TYPE.DELIVERY) {
        const deliveryInfo = normalizeDeliveryInfo(serviceMeta);
        if (!deliveryInfo.customerName || !deliveryInfo.phoneNumber || !deliveryInfo.address) {
          return res.status(400).json({ error: 'بيانات التوصيل مطلوبة كاملة: الاسم، رقم الهاتف، العنوان' });
        }
        newOrder.serviceMeta = deliveryInfo;
      } else if (orderType === ORDER_TYPE.TAKEAWAY) {
        const takeawayInfo = normalizeTakeawayInfo(serviceMeta);
        if (!takeawayInfo.cashierName) {
          return res.status(400).json({ error: 'اسم الكاشير مطلوب لطلب السفري' });
        }
        newOrder.serviceMeta = takeawayInfo;
      } else if (orderType === ORDER_TYPE.DINE_IN) {
        const dineCashierInfo = normalizeTakeawayInfo(serviceMeta);
        if (dineCashierInfo.cashierName) {
          newOrder.serviceMeta = dineCashierInfo;
        }
      }

      orders.push(newOrder);
      saveOrders(orders);

      const csid = customerSessionId != null ? String(customerSessionId).trim() : '';
      if (csid && needsTable) {
        try {
          tableCustomerCoordination.afterKitchenSend(tableIdStr, csid);
          tableCustomerCart.applyMutations(tableIdStr, csid, [{ op: 'clearAll' }]);
          customerPersistentSession.registerSession({
            peerSessionId: csid,
            customerName: nameTrim,
            tableId: tableIdStr,
            activeOrderId: newOrder.id,
          });
          try {
            const kst = kitchenCashierApproval.isOrderHeld(newOrder.id) ? 'held' : 'new';
            tableCustomerKitchenUserSync.syncUsersForKitchenOrder(io, newOrder.id, kst);
          } catch (_) {
            const users = tableCustomerSessions.listConnectedPublicUsers(tableIdStr);
            emitTableUsersUpdated(io, {
              tableId: tableIdStr,
              users,
              count: tableCustomerSessions.connectedCount(tableIdStr),
            });
          }
        } catch (_) {}
      }

      /* بعد إرسال الطلب: occupied — إزالة جلسة «قيد الاستخدام» إن وُجدت */
      if (needsTable) {
        try {
          tableSessions.releaseByTableId(tableIdStr);
        } catch (_) {}
        emitTableUpdate(io, { tableId: tableIdStr, status: 'occupied', sessionId: null });
      }

      if (io) {
        if (kitchenCashierApproval.shouldHoldCustomerOrder(newOrder)) {
          kitchenCashierApproval.holdCustomerOrderForCashier(io, newOrder, 'pending-cashier-approval');
        } else {
          if (needsTable) io.to('table-' + tableId).emit('new-order', newOrder);
          kitchenCashierApproval.emitFullKitchenRelease(io, newOrder, 'new-order');
        }
        if (config.DEBUG_SOCKET) {
          console.log(
            '[socket emit] order created',
            newOrder.id,
            'held:',
            kitchenCashierApproval.isOrderHeld(newOrder.id),
            'clients:',
            io.engine.clientsCount
          );
        }
      }
      res.status(201).json({ ...newOrder, displayOrderId: getOrderDisplayId(newOrder.id) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  function kitchenAllowsItemReplace(orderId) {
    const ks = getKitchenStatus(orderId);
    const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : 'new';
    if (raw === 'preparing' || raw === 'completed') return false;
    return true;
  }

  /** يفرّق بين «استبدال كامل» (تعديل طلب) و«إلحاق» — لا تعتمد على === true فقط */
  function shouldReplaceFullOrder(body) {
    if (!body || typeof body !== 'object') return false;
    if (body.replace === true) return true;
    if (body.replaceMode === 'full' || body.mode === 'replace') return true;
    if (body.replace === 1) return true;
    if (typeof body.replace === 'string') {
      const s = body.replace.toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
    }
    return false;
  }

  function stableStringifyOptions(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '{}';
    const keys = Object.keys(obj).sort();
    const sorted = {};
    keys.forEach((k) => {
      sorted[k] = obj[k];
    });
    return JSON.stringify(sorted);
  }

  /** دمج أسطر متطابقة (نفس menuId + خيارات + ملاحظة) — يمنع 1x + 2x لنفس الصنف بعد خطأ إلحاق */
  function mergeDuplicateLineItems(orderItems) {
    const map = new Map();
    for (const row of orderItems) {
      const note = String(row.note || '').trim();
      const optKey = stableStringifyOptions(row.selectedOptions);
      const key = `${String(row.menuId)}|${optKey}|${note}`;
      const q = Math.max(1, Math.floor(Number(row.quantity) || 1));
      if (map.has(key)) {
        const ex = map.get(key);
        ex.quantity += q;
      } else {
        map.set(key, { ...row, quantity: q });
      }
    }
    return Array.from(map.values());
  }

  /** استبدال كل أصناف الطلب — يُستدعى من POST .../items (body.replace) أو مسارات replace-items / PUT */
  function replaceOrderItemsFull(req, res) {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const { tableId, items } = req.body || {};
      if (!tableId || !Array.isArray(items)) {
        return res.status(400).json({ error: 'tableId وقائمة items مطلوبة' });
      }
      if (items.length === 0) {
        return res.status(400).json({ error: 'يجب أن يبقى صنف واحد على الأقل في الطلب.' });
      }
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      if (!kitchenAllowsItemReplace(order.id)) {
        return res.status(400).json({ error: 'لا يمكن تعديل الأصناف بعد بدء التجهيز.' });
      }
      const orderItems = items.map((row) => {
        const menuItem = getMenuItem(row.menuId);
        assertMenuItemAvailable(menuItem, row.menuId);
        const selectedOptions = sanitizeSelectedOptions(menuItem, row);
        return {
          menuId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: Number(row.quantity) || 1,
          note: row.note ? String(row.note).trim() : '',
          selectedOptions,
        };
      });
      const merged = mergeDuplicateLineItems(orderItems);
      if (merged.length === 0) {
        return res.status(400).json({ error: 'لا توجد أصناف صالحة بعد الدمج.' });
      }
      order.items = merged;
      saveOrders(orders);
      const heldReplace = kitchenCashierApproval.isOrderHeld(order.id);
      if (!heldReplace) {
        setKitchenStatus(order.id, 'new');
      }
      if (io) {
        io.emit('orders-updated', {
          tableId: String(order.tableId),
          orderId: order.id,
          reason: heldReplace ? 'items-replaced-held' : 'items-replaced',
        });
        if (!heldReplace) {
          io.emit('kitchen-updated', { orderId: order.id, reason: 'items-replaced', status: 'new' });
        }
        io.emit('stats-updated');
      }
      res.json({ ...order, displayOrderId: getOrderDisplayId(order.id) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** طلب واحد للزبون — ?tableId= مطلوب — مسار صريح + /:orderId للتوافق */
  function getSingleOrderForCustomer(req, res) {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String(req.query.tableId || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن عرض طلب خارج جلسة القاصة الحالية.' });
      }
      const canEditKitchen = kitchenAllowsItemReplace(order.id);
      res.json({
        ...order,
        displayOrderId: getOrderDisplayId(order.id),
        canEditKitchen,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  router.get('/order/:orderId', getSingleOrderForCustomer);
  router.get('/:orderId', getSingleOrderForCustomer);

  router.post('/:orderId/close', (req, res) => {
    try {
      const orders = getOrders();
      const paramId = req.params.orderId != null ? String(req.params.orderId) : '';
      const sameId = orders.filter((o) => String(o.id) === paramId);
      if (!sameId.length) return res.status(404).json({ error: 'الطلب غير موجود' });
      const toClose = sameId.filter((o) => o.closed !== true);
      if (!toClose.length) {
        return res.status(400).json({ error: 'الطلب مغلق مسبقاً' });
      }

      const method = (req.body && req.body.paymentMethod) ? String(req.body.paymentMethod).toLowerCase() : 'cash';
      const pay = method === 'card' ? 'card' : 'cash';
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const mismatch = toClose.some((o) => !orderBelongsToSession(o, session));
      if (mismatch) {
        return res.status(400).json({ error: 'لا يمكن إغلاق طلب خارج جلسة القاصة الحالية.' });
      }
      const closedAt = new Date().toISOString();
      toClose.forEach((order) => {
        order.closed = true;
        order.closedAt = closedAt;
        order.paymentMethod = pay;
        if (!order.open_date) order.open_date = session.openDate;
        order.close_open_date = session.openDate;
        order.cash_session_id = session.sessionId;
        addOrderToArchive(order);
      });
      saveOrders(orders);
      const primary = toClose[toClose.length - 1];
      const closedTableId = String(primary.tableId);
      const primaryType = normalizeOrderType(primary.orderType);
      if (primaryType === ORDER_TYPE.DINE_IN) {
        try {
          tableSessions.resetTableAccess(closedTableId);
          tableCustomerSessions.clearTableUsers(closedTableId);
          customerPersistentSession.closeSessionsForTable(closedTableId);
          customerDeviceSession.invalidateTable(closedTableId);
        } catch (_) {}
        const nextStatus = resolveTableStatus(closedTableId, '');
        emitTableUpdate(io, {
          tableId: closedTableId,
          status: nextStatus.status,
          sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null,
        });
        if (io && nextStatus.status === 'available') {
          io.to('table-' + closedTableId).emit('table_bill_closed', { tableId: closedTableId });
        }
        if (tableBillRequestService.maybeClearIfNoOpenOrders(closedTableId)) {
          emitBillRequestCleared(io, closedTableId);
        }
      }
      if (io) {
        io.emit('stats-updated');
        io.emit('orders-updated', {
          tableId: closedTableId,
          reason: 'order-closed',
          orderId: primary.id,
        });
        io.emit('kitchen-updated', {
          orderId: primary.id,
          reason: 'order-closed',
          tableId: closedTableId,
        });
      }
      res.json(primary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** موافقة الكاشير — إرسال الطلب إلى المطبخ */
  router.post('/:orderId/approve-kitchen', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن الموافقة على طلب خارج جلسة القاصة الحالية.' });
      }
      if (!kitchenCashierApproval.isOrderHeld(order.id)) {
        return res.status(400).json({ error: 'الطلب ليس بانتظار موافقة الكاشير.' });
      }
      const approvedIds = kitchenCashierApproval.approveOrdersForCashier(io, order);
      if (!approvedIds.length) {
        return res.status(400).json({ error: 'تعذّر إرسال الطلب إلى المطبخ.' });
      }
      res.json({
        ok: true,
        orderId: order.id,
        approvedOrderIds: approvedIds,
        tableId: order.tableId,
        tableLabel: tableLabelForOrder(order),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** رفض الكاشير — إلغاء الطلب وإبلاغ الزبون */
  router.post('/:orderId/reject-kitchen', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن الرفض على طلب خارج جلسة القاصة الحالية.' });
      }
      if (!kitchenCashierApproval.isOrderHeld(order.id)) {
        return res.status(400).json({ error: 'الطلب ليس بانتظار موافقة الكاشير.' });
      }
      const rejectedIds = kitchenCashierApproval.rejectOrdersForCashier(io, order, session);
      if (!rejectedIds.length) {
        return res.status(400).json({ error: 'تعذّر رفض الطلب.' });
      }
      res.json({
        ok: true,
        orderId: order.id,
        rejectedOrderIds: rejectedIds,
        tableId: order.tableId,
        tableLabel: tableLabelForOrder(order),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** حالة المطبخ للزبون (واجهة الطلب الذاتي) — pending / preparing / done */
  router.get('/:orderId/kitchen-status', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) {
        const wasRejected =
          Boolean(order.rejectedByCashier) || order.cancelReason === 'cashier_rejected_approval';
        return res.json({
          orderId: order.id,
          tableId: order.tableId,
          status: wasRejected ? 'rejected' : 'done',
          closed: true,
          rejected: wasRejected,
        });
      }
      const ks = getKitchenStatus(order.id);
      const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : 'new';
      let status = 'pending';
      if (raw === 'preparing') status = 'preparing';
      else if (raw === 'completed') status = 'done';
      else if (raw === 'editing') status = 'pending';
      else if (raw === 'held') status = 'pending';
      else status = 'pending';
      res.json({
        orderId: order.id,
        tableId: order.tableId,
        status,
        closed: false,
        awaitingCashierApproval: raw === 'held',
        kitchenRaw: raw,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** قفل تعديل الزبون — kitchen.json = editing (يمنع المطبخ من «بدء التجهيز» حتى الحفظ أو الإلغاء) */
  router.post('/:orderId/begin-edit', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = getKitchenStatus(orderId);
      const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : 'new';
      if (raw === 'preparing') {
        return res.status(409).json({
          error: 'عذراً، المطبخ بدأ العمل على طلبك!',
          code: 'KITCHEN_PREPARING',
        });
      }
      if (raw === 'completed') {
        return res.status(400).json({ error: 'الطلب مكتمل في المطبخ.' });
      }
      setKitchenStatus(orderId, 'editing');
      if (io) {
        io.emit('kitchen-updated', { orderId, status: 'editing', reason: 'begin-edit' });
        io.emit('orders-updated', { tableId: String(order.tableId), orderId, reason: 'begin-edit' });
      }
      res.json({ ok: true, status: 'editing' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** إلغاء وضع التعديل عند إغلاق السلة دون حفظ — يعيد الطلب لـ new */
  router.post('/:orderId/cancel-edit', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = getKitchenStatus(orderId);
      const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : '';
      if (raw === 'editing') {
        setKitchenStatus(orderId, 'new');
        if (io) {
          io.emit('kitchen-updated', { orderId, status: 'new', reason: 'cancel-edit' });
          io.emit('orders-updated', { tableId: String(order.tableId), orderId, reason: 'cancel-edit' });
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * إلغاء الطلب من الزبون — فقط قبل بدء التجهيز (حالة مطبخ new أو editing).
   * يُغلق الطلب ويُزال من شاشة المطبخ والقوائم المفتوحة.
   */
  router.post('/:orderId/cancel-by-customer', (req, res) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن الإلغاء لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق مسبقاً' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن إلغاء طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = getKitchenStatus(orderId);
      const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : 'new';
      if (raw === 'preparing') {
        return res.status(409).json({
          error: 'لا يمكن إلغاء الطلب لأن المطبخ بدأ التجهيز.',
          code: 'ALREADY_PREPARING',
        });
      }
      if (raw === 'completed') {
        return res.status(400).json({ error: 'الطلب مكتمل في المطبخ ولا يمكن إلغاؤه.' });
      }
      const now = new Date().toISOString();
      order.closed = true;
      order.closedAt = now;
      order.cancelledByCustomer = true;
      order.cancelReason = 'customer_cancel_pending';
      if (!order.open_date) order.open_date = session.openDate;
      order.close_open_date = session.openDate;
      order.cash_session_id = session.sessionId;
      removeKitchenEntry(orderId);
      saveOrders(orders);
      const closedTableId = String(order.tableId);
      /** إن لم يبقَ أي طلب مفتوح على الطاولة: جلسة جديدة «قيد الاستخدام»؛ وإلا تبقى مشغولة */
      const remainingOpen = getOrdersBlockingTableClaim(closedTableId);
      let newBrowseSession = null;
      if (remainingOpen.length === 0) {
        newBrowseSession = tableSessions.createSessionAfterCancel(closedTableId, (tid) => getOrdersBlockingTableClaim(tid));
      }
      const mineSid = newBrowseSession ? String(newBrowseSession.sessionId) : '';
      const nextStatus = resolveTableStatus(closedTableId, mineSid);
      emitTableUpdate(io, {
        tableId: closedTableId,
        status: nextStatus.status,
        sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null,
      });
      if (io) {
        io.emit('orders-updated', {
          tableId: closedTableId,
          orderId,
          reason: 'order-cancelled-by-customer',
        });
        io.emit('kitchen-updated', { orderId, reason: 'order-cancelled-by-customer' });
        io.emit('stats-updated');
      }
      res.json({
        ok: true,
        orderId,
        tableSessionId: newBrowseSession ? newBrowseSession.sessionId : null,
        tableStatus: nextStatus.status,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** إضافة أصناف لطلب مفتوح — أو استبدال كامل عند body.replace / replaceMode (حفظ تعديلات الزبون) */
  router.post('/:orderId/items', (req, res) => {
    try {
      if (shouldReplaceFullOrder(req.body)) {
        return replaceOrderItemsFull(req, res);
      }
      const orderId = String(req.params.orderId || '').trim();
      const { tableId, items } = req.body || {};
      if (!tableId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'tableId وقائمة items مطلوبة' });
      }
      const session = till.getActiveSessionMeta();
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = getOrders();
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      try {
        tableBillRequestService.assertCanOrder(String(tableId));
      } catch (billErr) {
        return res.status(billErr.status || 409).json({
          error: billErr.message,
          code: billErr.code || tableBillRequestService.BILL_BLOCKED_CODE,
        });
      }
      const orderItems = items.map((row) => {
        const menuItem = getMenuItem(row.menuId);
        assertMenuItemAvailable(menuItem, row.menuId);
        const selectedOptions = sanitizeSelectedOptions(menuItem, row);
        return {
          menuId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: Number(row.quantity) || 1,
          note: row.note ? String(row.note).trim() : '',
          selectedOptions,
        };
      });
      order.items = (order.items || []).concat(orderItems);
      saveOrders(orders);
      const heldAppend = kitchenCashierApproval.isOrderHeld(order.id);
      if (io) {
        io.emit('orders-updated', {
          tableId: String(order.tableId),
          orderId: order.id,
          reason: heldAppend ? 'items-appended-held' : 'items-appended',
        });
        if (!heldAppend) {
          io.emit('kitchen-updated', { orderId: order.id, reason: 'items-appended' });
        }
        io.emit('stats-updated');
      }
      res.json(order);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** POST بديل لـ PUT — بعض النشرات القديمة أو البروكسي لا يمرّر PUT إلى المسار */
  router.post('/order/:orderId/replace-items', replaceOrderItemsFull);
  router.post('/:orderId/replace-items', replaceOrderItemsFull);

  router.put('/order/:orderId/items', replaceOrderItemsFull);
  router.put('/:orderId/items', replaceOrderItemsFull);

  router.get('/', (req, res) => {
    try {
      const closed = req.query.closed === 'true';
      let orders = getOrders();
      if (req.query.closed) {
        orders = orders.filter((o) => o.closed === closed);
      }
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createOrdersRouter;
