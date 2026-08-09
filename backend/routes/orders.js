/**
 * مسارات API للطلبات والطاولات
 */
const express = require('express');
const { assertMenuItemAvailable } = require('../services/menuAvailability');
const { optionalToken } = require('./authMiddleware');
const menuRepo = require('../repository/menuRepository');
const orderRepo = require('../repository/orderRepository');
const tableRepo = require('../repository/tableRepository');
const { addOrderToArchive } = require('../data/archive');
const till = require('../data/till');
const { orderBelongsToSession } = require('../services/cashSessionHelper');
const config = require('../config');
const tableSessions = require('../services/tableSessions');
const { emitTableUpdate, emitTableUsersUpdated } = require('../services/tableRealtime');
const { resolveTableStatus } = require('../services/tableStatusResolve');
const kitchenRepo = require('../repository/kitchenRepository');
const { tableRoomName } = require('../services/tableRoomHelper');
const kitchenCashierApproval = require('../services/kitchenCashierApproval');
const cafeSettingsStore = require('../services/cafeSettingsStore');

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return R * c;
}

function createOrdersRouter(io) {
  const router = express.Router();
  router.use(optionalToken);

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

  router.get('/today', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const allOrders = await orderRepo.getOrders(cafeId);
      const orders = allOrders.filter((o) => orderBelongsToSession(o, session));
      const list = orders.map((o) => {
        const total = (o.items || []).reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
        return {
          ...o,
          orderType: inferOrderTypeFromRecord(o),
          total,
          displayOrderId: orderRepo.getOrderDisplayId(cafeId, o.id),
        };
      });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  async function tableLabelForOrder(cafeId, order) {
    const tableIdRaw = String((order && order.tableId) || '').trim();
    const tables = await tableRepo.getTables(cafeId);
    const row = tables.find((t) => String(t.id) === tableIdRaw);
    const lab = row && row.label != null ? String(row.label) : tableIdRaw;
    return 'طاولة ' + lab;
  }

  /** طلبات زبائن بانتظار موافقة الكاشير قبل المطبخ */
  router.get('/pending-cashier-approval', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const allOrders = await orderRepo.getOrders(cafeId);
      const orders = [];
      for (const o of allOrders) {
        if (o && !o.closed && o.customerSessionId && orderBelongsToSession(o, session)) {
          if (await kitchenCashierApproval.isOrderHeld(cafeId, o.id)) {
            orders.push(o);
          }
        }
      }
      const list = await Promise.all(orders.map(async function (o) {
        const total = (o.items || []).reduce(function (sum, it) {
          return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0);
        }, 0);
        const label = await tableLabelForOrder(cafeId, o);
        return {
          id: o.id,
          tableId: o.tableId,
          tableLabel: label,
          customerName: o.customerName || null,
          kitchenBatchId: o.kitchenBatchId || null,
          bundledCustomerNames: o.bundledCustomerNames || null,
          items: o.items || [],
          total,
          createdAt: o.createdAt,
          displayOrderId: orderRepo.getOrderDisplayId(cafeId, o.id),
        };
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/tables', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const tables = await tableRepo.getTables(cafeId);
      res.json(tables);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/table/:tableId', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const ordersRaw = await orderRepo.getOrdersByTable(cafeId, req.params.tableId);
      const orders = ordersRaw.filter((o) => orderBelongsToSession(o, session));
      const list = await Promise.all(orders.map(async (o) => {
        const ks = await kitchenRepo.getKitchenStatus(cafeId, o.id);
        const isHeld = await kitchenCashierApproval.isOrderHeld(cafeId, o.id);
        return {
          ...o,
          displayOrderId: orderRepo.getOrderDisplayId(cafeId, o.id),
          kitchenStatus: isHeld ? 'held' : (ks ? String(ks.status).toLowerCase() : 'pending'),
          awaitingCashierApproval: isHeld,
        };
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/table/:tableId/bill-requested', (req, res) => {
    try {
      const cafeId = req.cafeId;
      const tableId = String(req.params.tableId || '').trim();
      const isRequested = tableSessions.isTableBillRequested(cafeId, tableId);
      res.json({ tableId, isBillRequested: isRequested });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/table/:tableId/all', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const allRaw = await orderRepo.getAllOrdersForTable(cafeId, req.params.tableId);
      const all = allRaw.filter((o) => orderBelongsToSession(o, session));
      res.json(all.map((o) => ({ ...o, displayOrderId: orderRepo.getOrderDisplayId(cafeId, o.id) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * استعادة جلسة الزبون بعد إغلاق المتصفح أو App Switch.
   * يُستخدم حصرياً من طبقة Persistent Customer Identity (PCI) في المتصفح.
   * يُعيد بيانات أحدث طلب مفتوح على الطاولة في الجلسة الحالية فقط.
   * لا يُعيد أي بيانات إذا لم تكن القاصة مفتوحة أو أُغلقت الطاولة.
   */
  router.get('/table/:tableId/recover-session', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const tableId = String(req.params.tableId || '').trim();
      if (!tableId) return res.json({ order: null });

      const sessionId = String(req.query.sessionId || '').trim();
      const customerId = String(req.query.customerId || '').trim();

      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.json({ order: null, reason: 'no_active_session' });
      }

      const ordersRaw = await orderRepo.getOrdersByTable(cafeId, tableId);
      const openOrders = ordersRaw.filter((o) =>
        !o.closed &&
        !(o.cancelledByCustomer || o.cancelReason === 'customer_cancel_pending') &&
        orderBelongsToSession(o, session)
      );

      if (!openOrders.length) return res.json({ order: null, reason: 'no_active_order' });

      // البحث عن الطلب المطابق لجلسة الزبون بصورة صارمة
      const matched = openOrders.find((o) =>
        (sessionId && o.customerSessionId === sessionId) ||
        (customerId && o.customerId === customerId)
      );

      if (!matched) return res.json({ order: null, reason: 'no_active_order' });

      const ks = await kitchenRepo.getKitchenStatus(cafeId, matched.id);
      const isHeld = await kitchenCashierApproval.isOrderHeld(cafeId, matched.id);
      const rawStatus = ks && ks.status ? String(ks.status).toLowerCase() : 'pending';
      const status = isHeld ? 'held'
        : (rawStatus === 'preparing' ? 'preparing'
          : (rawStatus === 'done' || rawStatus === 'completed' ? 'completed'
            : 'waiting'));

      return res.json({
        order: {
          id: matched.id,
          displayOrderId: orderRepo.getOrderDisplayId(cafeId, matched.id),
          tableId: matched.tableId,
          customerName: matched.customerName || '',
          items: matched.items || [],
          status,
          customerSessionId: matched.customerSessionId,
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const { tableId, items, customerName, customerSessionId, orderType: rawOrderType, serviceMeta } = req.body;
      const orderType = normalizeOrderType(rawOrderType);
      const needsTable = orderType === ORDER_TYPE.DINE_IN;
      if ((!tableId && needsTable) || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'بيانات الطلب غير مكتملة: tableId (داخل الصالة) وقائمة items مطلوبة' });
      }

      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن إرسال الطلب لأن قاصة اليوم غير مفتوحة.' });
      }

      const tableIdStrEarly = needsTable ? String(tableId) : orderType;
      if (needsTable && tableSessions.isTableBillRequested(cafeId, tableIdStrEarly)) {
        return res.status(400).json({ error: 'تم طلب الفاتورة لهذه الطاولة. لا يمكن إضافة طلبات جديدة حتى إغلاق الفاتورة من الكاشير.' });
      }

      // ── Geofencing Protection Layer ──
      const cafeSettings = await cafeSettingsStore.getCafeSettings(cafeId);
      if (cafeSettings && cafeSettings.enableGeofence) {
        const isStaffRequest = !!(
          req.user ||
          req.body.isStaff ||
          req.body.isCaptain ||
          (req.body.serviceMeta && (req.body.serviceMeta.isStaff || req.body.serviceMeta.placedBy === 'captain' || req.body.serviceMeta.placedBy === 'cashier'))
        );

        if (!isStaffRequest) {
          const custLat = req.body.lat !== undefined && req.body.lat !== null ? Number(req.body.lat) : (req.body.latitude !== undefined && req.body.latitude !== null ? Number(req.body.latitude) : null);
          const custLng = req.body.lng !== undefined && req.body.lng !== null ? Number(req.body.lng) : (req.body.longitude !== undefined && req.body.longitude !== null ? Number(req.body.longitude) : null);

          if (custLat === null || custLng === null || isNaN(custLat) || isNaN(custLng)) {
            return res.status(403).json({ error: 'يرجى تفعيل الموقع لإكمال الطلب' });
          }

          const distanceMeters = calculateHaversineDistance(custLat, custLng, cafeSettings.latitude, cafeSettings.longitude);
          if (distanceMeters > cafeSettings.allowedRadius) {
            return res.status(403).json({
              error: `أنت خارج نطاق الكافيه المسموح بالطلب فيه (المسافة المحسوبة: ${Math.round(distanceMeters)} متر، النطاق المسموح: ${cafeSettings.allowedRadius} متر)`
            });
          }
        }
      }


      const orderItems = await Promise.all(items.map(async (row) => {
        const menuItem = await menuRepo.getMenuItem(cafeId, row.menuId);
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
      }));

      const tableIdStr = needsTable ? String(tableId) : orderType;
      const openDate = session.openDate;
      const orders = await orderRepo.getOrders(cafeId);
      let seq = await orderRepo.getNextOrderSequence(cafeId, openDate);
      const idPrefix = orderType === ORDER_TYPE.DELIVERY ? 'D' : orderType === ORDER_TYPE.TAKEAWAY ? 'K' : 'T' + tableIdStr;
      let orderId = idPrefix + '-' + String(seq).padStart(3, '0');
      while (orders.some((o) => o.id === orderId)) {
        seq += 1;
        orderId = idPrefix + '-' + String(seq).padStart(3, '0');
      }
      await orderRepo.ensureOrderSequenceAtLeast(cafeId, openDate, seq);

      const nameTrim =
        customerName != null ? String(customerName).trim().slice(0, 30) : '';
      const newOrder = {
        id: orderId,
        cafeId: cafeId,
        cafe_id: cafeId,
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
      await orderRepo.saveOrders(cafeId, orders);



      /* بعد إرسال الطلب: occupied — إزالة جلسة «قيد الاستخدام» إن وُجدت */
      if (needsTable) {
        try {
          tableSessions.releaseByTableId(tableIdStr);
        } catch (_) { }
        emitTableUpdate(io, { tableId: tableIdStr, status: 'occupied', sessionId: null });
      }

      if (io) {
        if (await kitchenCashierApproval.shouldHoldCustomerOrder(newOrder)) {
          await kitchenCashierApproval.holdCustomerOrderForCashier(cafeId, io, newOrder, 'pending-cashier-approval');
        } else {
          if (needsTable) io.to(tableRoomName(tableId, cafeId)).emit('new-order', newOrder);
          kitchenCashierApproval.emitFullKitchenRelease(io, newOrder, 'new-order');
        }
        if (config.DEBUG_SOCKET) {
          console.log(
            '[socket emit] order created',
            newOrder.id,
            'held:',
            kitchenCashierApproval.isOrderHeld(cafeId, newOrder.id),
            'clients:',
            io.engine.clientsCount
          );
        }
      }
      res.status(201).json({ ...newOrder, displayOrderId: orderRepo.getOrderDisplayId(cafeId, newOrder.id) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  async function kitchenAllowsItemReplace(cafeId, orderId) {
    const ks = await kitchenRepo.getKitchenStatus(cafeId, orderId);
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
  async function replaceOrderItemsFull(req, res) {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const { tableId, items } = req.body || {};
      if (!tableId || !Array.isArray(items)) {
        return res.status(400).json({ error: 'tableId وقائمة items مطلوبة' });
      }
      if (items.length === 0) {
        return res.status(400).json({ error: 'يجب أن يبقى صنف واحد على الأقل في الطلب.' });
      }
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      if (!await kitchenAllowsItemReplace(order.id)) {
        return res.status(400).json({ error: 'لا يمكن تعديل الأصناف بعد بدء التجهيز.' });
      }
      const orderItems = await Promise.all(items.map(async (row) => {
        const menuItem = await menuRepo.getMenuItem(cafeId, row.menuId);
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
      }));
      const merged = mergeDuplicateLineItems(orderItems);
      if (merged.length === 0) {
        return res.status(400).json({ error: 'لا توجد أصناف صالحة بعد الدمج.' });
      }
      order.items = merged;
      await orderRepo.saveOrders(cafeId, orders);
      const heldReplace = await kitchenCashierApproval.isOrderHeld(cafeId, order.id);
      if (!heldReplace) {
        await kitchenRepo.setKitchenStatus(cafeId, order.id, 'new');
      }
      if (io) {
        const room = tableRoomName(order.tableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', {
          tableId: String(order.tableId),
          orderId: order.id,
          reason: heldReplace ? 'items-replaced-held' : 'items-replaced',
        });
        if (!heldReplace) {
          io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId: order.id, reason: 'items-replaced', status: 'new' });
          io.to(room).emit('kitchen-updated', { orderId: order.id, reason: 'items-replaced', status: 'new' });
        }
        io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
      }
      res.json({ ...order, displayOrderId: orderRepo.getOrderDisplayId(cafeId, order.id) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  /** طلب واحد للزبون — ?tableId= مطلوب — مسار صريح + /:orderId للتوافق */
  async function getSingleOrderForCustomer(req, res) {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String(req.query.tableId || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const sameId = orders.filter((o) => String(o.id) === orderId);
      if (!sameId.length) return res.status(404).json({ error: 'الطلب غير موجود' });
      const order = sameId.find((o) => !o.closed) || sameId[sameId.length - 1];
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن عرض طلب خارج جلسة القاصة الحالية.' });
      }
      const canEditKitchen = await kitchenAllowsItemReplace(cafeId, order.id);
      res.json({
        ...order,
        displayOrderId: orderRepo.getOrderDisplayId(cafeId, order.id),
        canEditKitchen,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  router.get('/order/:orderId', getSingleOrderForCustomer);
  router.get('/:orderId', getSingleOrderForCustomer);

  router.post('/:orderId/close', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orders = await orderRepo.getOrders(cafeId);
      const paramId = req.params.orderId != null ? String(req.params.orderId) : '';
      const sameId = orders.filter((o) => String(o.id) === paramId);
      if (!sameId.length) return res.status(404).json({ error: 'الطلب غير موجود' });
      const toClose = sameId.filter((o) => o.closed !== true);
      if (!toClose.length) {
        return res.status(400).json({ error: 'الطلب مغلق مسبقاً' });
      }

      const method = (req.body && req.body.paymentMethod) ? String(req.body.paymentMethod).toLowerCase() : 'cash';
      const pay = method === 'card' ? 'card' : 'cash';
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const mismatch = toClose.some((o) => !orderBelongsToSession(o, session));
      if (mismatch) {
        return res.status(400).json({ error: 'لا يمكن إغلاق طلب خارج جلسة القاصة الحالية.' });
      }
      const closedAt = new Date().toISOString();
      toClose.forEach((order) => {
        if (!order.cafeId) order.cafeId = cafeId;
        if (!order.cafe_id) order.cafe_id = cafeId;
        order.closed = true;
        order.closedAt = closedAt;
        order.paymentMethod = pay;
        // دائماً نُثبّت open_date من جلسة القاصة المفتوحة — حتى لو الطلب أُخذ
        // بعد منتصف الليل في يوم تقويمي جديد، يُحفظ في أرشيف تاريخ فتح القاصة.
        order.open_date = session.openDate;
        order.close_open_date = session.openDate;
        order.cash_session_id = session.sessionId;
        addOrderToArchive(order, cafeId);
      });
      await orderRepo.saveOrders(cafeId, orders);
      const primary = toClose[toClose.length - 1];
      const closedTableId = String(primary.tableId);
      const primaryType = normalizeOrderType(primary.orderType);
      if (primaryType === ORDER_TYPE.DINE_IN) {
        try {
          tableSessions.resetTableAccess(closedTableId);
          tableSessions.setTableBillRequested(cafeId, closedTableId, false);
        } catch (_) { }
        const nextStatus = resolveTableStatus(cafeId, closedTableId, '');
        emitTableUpdate(io, {
          tableId: closedTableId,
          status: nextStatus.status,
          sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null,
        }, cafeId);
        if (io) {
          const room = tableRoomName(closedTableId, cafeId);
          io.to(room).emit('table_bill_closed', { tableId: closedTableId, status: nextStatus.status });
        }
      }
      if (io) {
        const room = tableRoomName(closedTableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', {
          tableId: closedTableId,
          reason: 'order-closed',
          orderId: primary.id,
        });
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', {
          orderId: primary.id,
          reason: 'order-closed',
          tableId: closedTableId,
        });
        io.to(room).emit('kitchen-updated', {
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
  router.post('/:orderId/approve-kitchen', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن الموافقة على طلب خارج جلسة القاصة الحالية.' });
      }
      if (!await kitchenCashierApproval.isOrderHeld(cafeId, order.id)) {
        return res.status(400).json({ error: 'الطلب ليس بانتظار موافقة الكاشير.' });
      }
      const approvedIds = await kitchenCashierApproval.approveOrdersForCashier(cafeId, io, order);
      if (!approvedIds.length) {
        return res.status(400).json({ error: 'تعذّر إرسال الطلب إلى المطبخ.' });
      }
      res.json({
        ok: true,
        orderId: order.id,
        approvedOrderIds: approvedIds,
        tableId: order.tableId,
        tableLabel: await tableLabelForOrder(cafeId, order),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** رفض الكاشير — إلغاء الطلب وإبلاغ الزبون */
  router.post('/:orderId/reject-kitchen', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن الرفض على طلب خارج جلسة القاصة الحالية.' });
      }
      if (!await kitchenCashierApproval.isOrderHeld(cafeId, order.id)) {
        return res.status(400).json({ error: 'الطلب ليس بانتظار موافقة الكاشير.' });
      }
      const rejectedIds = await kitchenCashierApproval.rejectOrdersForCashier(cafeId, io, order, session);
      if (!rejectedIds.length) {
        return res.status(400).json({ error: 'تعذّر رفض الطلب.' });
      }
      res.json({
        ok: true,
        orderId: order.id,
        rejectedOrderIds: rejectedIds,
        tableId: order.tableId,
        tableLabel: await tableLabelForOrder(cafeId, order),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** حالة المطبخ للزبون (واجهة الطلب الذاتي) — pending / preparing / done */
  router.get('/:orderId/kitchen-status', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const session = till.getActiveSessionMeta(cafeId);
      const orders = await orderRepo.getOrders(cafeId);
      const sameId = orders.filter((o) => {
        if (!o) return false;
        if (String(o.id) === orderId) return true;
        const dId = orderRepo.getOrderDisplayId(cafeId, o.id);
        if (String(dId) === orderId) return true;
        return false;
      });

      if (!sameId.length) {
        return res.json({ orderId, status: 'pending', closed: false, awaitingCashierApproval: false });
      }

      let order = sameId.find((o) => o && !o.closed && session && session.openDate && orderBelongsToSession(o, session));
      if (!order) order = sameId.find((o) => o && !o.closed);
      if (!order && sameId.length > 0) {
        const tid = sameId[0].tableId;
        const activeTableOrder = orders.find((o) => o && !o.closed && String(o.tableId) === String(tid));
        if (activeTableOrder) order = activeTableOrder;
      }
      if (!order) order = sameId[sameId.length - 1];
      if (order.closed) {
        const wasRejected =
          Boolean(order.rejectedByCashier) || order.cancelReason === 'cashier_rejected_approval';
        const wasCancelledByCustomer = Boolean(order.cancelledByCustomer);
        return res.json({
          orderId: order.id,
          tableId: order.tableId,
          status: wasRejected ? 'rejected' : 'done',
          closed: true,
          rejected: wasRejected,
          cancelledByCustomer: wasCancelledByCustomer,
        });
      }
      const ks = await kitchenRepo.getKitchenStatus(cafeId, order.id);
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
  router.post('/:orderId/begin-edit', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = await kitchenRepo.getKitchenStatus(cafeId, orderId);
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
      await kitchenRepo.setKitchenStatus(cafeId, orderId, 'editing');
      if (io) {
        const room = tableRoomName(order.tableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId, status: 'editing', reason: 'begin-edit' });
        io.to(room).emit('kitchen-updated', { orderId, status: 'editing', reason: 'begin-edit' });
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId: String(order.tableId), orderId, reason: 'begin-edit' });
      }
      res.json({ ok: true, status: 'editing' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** إلغاء وضع التعديل عند إغلاق السلة دون حفظ — يعيد الطلب لـ new */
  router.post('/:orderId/cancel-edit', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا توجد قاصة مفتوحة.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = await kitchenRepo.getKitchenStatus(cafeId, orderId);
      const raw = ks && ks.status != null ? String(ks.status).toLowerCase() : '';
      if (raw === 'editing') {
        await kitchenRepo.setKitchenStatus(cafeId, orderId, 'new');
        if (io) {
          const room = tableRoomName(order.tableId, cafeId);
          io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId, status: 'new', reason: 'cancel-edit' });
          io.to(room).emit('kitchen-updated', { orderId, status: 'new', reason: 'cancel-edit' });
          io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tableId: String(order.tableId), orderId, reason: 'cancel-edit' });
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
  router.post('/:orderId/cancel-by-customer', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const tableId = String((req.body && req.body.tableId) || '').trim();
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب' });
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن الإلغاء لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق مسبقاً' });
      if (String(order.tableId) !== tableId) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن إلغاء طلب خارج جلسة القاصة الحالية.' });
      }
      const ks = await kitchenRepo.getKitchenStatus(cafeId, orderId);
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
      await kitchenRepo.removeKitchenEntry(cafeId, orderId);
      await orderRepo.saveOrders(cafeId, orders);
      const closedTableId = String(order.tableId);
      /** إن لم يبقَ أي طلب مفتوح على الطاولة: جلسة جديدة «قيد الاستخدام»؛ وإلا تبقى مشغولة */
      const remainingOpen = await orderRepo.getOrdersBlockingTableClaim(cafeId, closedTableId);
      let newBrowseSession = null;
      if (remainingOpen.length === 0) {
        newBrowseSession = tableSessions.createSessionAfterCancel(closedTableId, (tid) => remainingOpen);
      }
      const mineSid = newBrowseSession ? String(newBrowseSession.sessionId) : '';
      const nextStatus = resolveTableStatus(cafeId, closedTableId, mineSid);
      emitTableUpdate(io, {
        tableId: closedTableId,
        status: nextStatus.status,
        sessionId: nextStatus.status === 'in_use' ? nextStatus.sessionId : null,
        reason: 'order-cancelled-by-customer',
      }, cafeId);
      if (io) {
        const room = tableRoomName(closedTableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', {
          tableId: closedTableId,
          orderId,
          reason: 'order-cancelled-by-customer',
        });
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId, reason: 'order-cancelled-by-customer' });
        io.to(room).emit('kitchen-updated', { orderId, reason: 'order-cancelled-by-customer' });
        io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
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
  router.post('/:orderId/items', async (req, res) => {
    try {
      if (shouldReplaceFullOrder(req.body)) {
        return replaceOrderItemsFull(req, res);
      }
      const cafeId = req.cafeId;
      const orderId = String(req.params.orderId || '').trim();
      const { tableId, items } = req.body || {};
      if (!tableId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'tableId وقائمة items مطلوبة' });
      }
      const session = till.getActiveSessionMeta(cafeId);
      if (!session || !session.openDate) {
        return res.status(400).json({ error: 'لا يمكن تعديل الطلب لأن قاصة اليوم غير مفتوحة.' });
      }
      const orders = await orderRepo.getOrders(cafeId);
      const order = orders.find((o) => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.closed) return res.status(400).json({ error: 'الطلب مغلق' });
      if (String(order.tableId) !== String(tableId)) {
        return res.status(403).json({ error: 'الطاولة غير متطابقة مع الطلب' });
      }
      if (!orderBelongsToSession(order, session)) {
        return res.status(400).json({ error: 'لا يمكن تعديل طلب خارج جلسة القاصة الحالية.' });
      }

      const orderItems = await Promise.all(items.map(async (row) => {
        const menuItem = await menuRepo.getMenuItem(cafeId, row.menuId);
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
      }));
      order.items = (order.items || []).concat(orderItems);
      await orderRepo.saveOrders(cafeId, orders);
      const heldAppend = await kitchenCashierApproval.isOrderHeld(cafeId, order.id);
      if (io) {
        const room = tableRoomName(order.tableId, cafeId);
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', {
          tableId: String(order.tableId),
          orderId: order.id,
          reason: heldAppend ? 'items-appended-held' : 'items-appended',
        });
        if (!heldAppend) {
          io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { orderId: order.id, reason: 'items-appended' });
          io.to(room).emit('kitchen-updated', { orderId: order.id, reason: 'items-appended' });
        }
        io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
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

  router.get('/', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const closed = req.query.closed === 'true';
      let orders = await orderRepo.getOrders(cafeId);
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
