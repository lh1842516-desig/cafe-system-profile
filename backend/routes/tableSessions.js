/**
 * API جلسات الطاولة + زبائن الطاولة المتصلون
 */
const express = require('express');
const { getTables, getOrders, getOrdersByTable, getOrdersBlockingTableClaim } = require('../data/store');
const till = require('../data/till');
const { orderBelongsToSession } = require('../services/cashSessionHelper');
const tableSessions = require('../services/tableSessions');
const tableCustomerSessions = require('../services/tableCustomerSessions');
const tableCustomerCart = require('../services/tableCustomerCart');
const { resolveTableStatus } = require('../services/tableStatusResolve');
const { emitTableUpdate, emitCustomerCart, emitTableUsersUpdated } = require('../services/tableRealtime');
const {
  broadcastUsers,
  emitCaptainRequest,
  emitBillRequest,
} = require('../services/tableCustomerSocket');
const tableBillRequestService = require('../services/tableBillRequestService');
const tableCustomerKitchenSend = require('../services/tableCustomerKitchenSend');
const customerDeviceSession = require('../services/customerDeviceSession');
const customerSessionCookie = require('../services/customerSessionCookie');
const tableCustomerCoordination = require('../services/tableCustomerCoordination');
const tableCustomerResume = require('../services/tableCustomerResume');
const tableCustomerKitchenUserSync = require('../services/tableCustomerKitchenUserSync');

function createTableSessionsRouter(io) {
  const router = express.Router();

  function emitUsers(tableId) {
    const tid = String(tableId || '').trim();
    let users = tableCustomerSessions.listConnectedPublicUsers(tid);
    try {
      users = tableCustomerKitchenUserSync.enrichUsersFromKitchenOrders(tid, users);
    } catch (_) {}
    const count = tableCustomerSessions.connectedCount(tid);
    emitTableUsersUpdated(io, { tableId: tid, users, count });
    try {
      broadcastUsers(io, tableId);
    } catch (_) {}
  }

  router.get('/status', (req, res) => {
    try {
      const mineSessionId = req.query.sessionId != null ? String(req.query.sessionId) : '';
      const mineOrderId = req.query.orderId != null ? String(req.query.orderId) : '';
      const tables = getTables();
      const list = tables.map(function (t) {
        const id = String(t.id != null ? t.id : '');
        const label = String(t.label != null ? t.label : id);
        const r = resolveTableStatus(id, mineSessionId, mineOrderId);
        return {
          id,
          label,
          status: r.status,
          sessionId: r.sessionId,
          isMine: r.isMine,
          statusLabel: r.statusLabel || null,
        };
      });
      res.json({ tables: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/claim', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? req.body.tableId : '';
      const resumeOrderId = req.body && req.body.resumeOrderId != null ? String(req.body.resumeOrderId) : '';
      const rawShared = req.body && req.body.sharedJoin;
      const sharedJoin =
        rawShared === true ||
        String(rawShared || '')
          .trim()
          .toLowerCase() === 'true';
      const tidClaim = String(tableId || '').trim();
      if (tidClaim && tableBillRequestService.isBillRequested(tidClaim)) {
        return res.status(409).json({
          error: tableBillRequestService.BILL_BLOCKED_MESSAGE,
          code: tableBillRequestService.BILL_BLOCKED_CODE,
        });
      }
      const result = tableSessions.claimTable(
        tableId,
        function (tid) {
          return getOrdersBlockingTableClaim(tid);
        },
        resumeOrderId,
        { sharedJoin }
      );
      if (!result.ok) {
        const msg =
          result.code === 'occupied'
            ? 'هذه الطاولة مشغولة بطلب نشط.'
            : 'هذه الطاولة قيد الاستخدام من زبون آخر.';
        return res.status(409).json({ error: msg, code: result.code });
      }
      emitTableUpdate(io, {
        tableId: result.session.tableId,
        status: 'in_use',
        sessionId: result.session.sessionId,
      });
      res.status(201).json({
        session: {
          sessionId: result.session.sessionId,
          tableId: result.session.tableId,
          status: result.session.status,
          createdAt: result.session.createdAt,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function canJoinTableDuringBillRequest(tableId, sessionId) {
    const tid = String(tableId || '').trim();
    const sid = String(sessionId || '').trim();
    if (!tid || !sid) return false;
    if (!tableBillRequestService.isBillRequested(tid)) return true;
    if (tableCustomerSessions.findUser(tid, sid)) return true;
    const session = till.getActiveSessionMeta();
    if (!session) return false;
    return getOrdersByTable(tid).some(function (o) {
      return (
        o &&
        o.closed !== true &&
        orderBelongsToSession(o, session) &&
        String(o.customerSessionId || '').trim() === sid
      );
    });
  }

  /** انضمام زبون للطاولة (اسم + جلسة مستقلة) */
  router.post('/customer/join', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      const sessionId = req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      const customerName =
        req.body && req.body.customerName != null ? String(req.body.customerName).trim() : '';
      const socketId = req.body && req.body.socketId != null ? String(req.body.socketId).trim() : '';
      const deviceId = req.body && req.body.deviceId != null ? String(req.body.deviceId).trim() : '';
      if (tableId && !canJoinTableDuringBillRequest(tableId, sessionId)) {
        return res.status(409).json({
          error: tableBillRequestService.BILL_BLOCKED_MESSAGE,
          code: tableBillRequestService.BILL_BLOCKED_CODE,
        });
      }
      const result = tableCustomerSessions.joinTable(tableId, sessionId, customerName, socketId);
      if (!result.ok) {
        if (result.code === 'invalid_input') {
          return res.status(400).json({ error: 'اسم الزبون والطاولة مطلوبان.' });
        }
        return res.status(400).json({ error: 'تعذر الانضمام للطاولة.' });
      }
      if (deviceId) {
        try {
          customerDeviceSession.touchDevice({
            deviceId,
            tableId,
            peerSessionId: sessionId,
            customerName,
          });
        } catch (_) {}
      }
      emitUsers(tableId);
      // كوكي مستقل ينجو من قتل Safari/مسح localStorage — يتيح استعادة الطلب المفتوح تلقائياً
      try {
        customerSessionCookie.setSessionCookie(res, {
          tableId,
          sessionId: result.user.sessionId,
        });
      } catch (_) {}
      res.status(result.created ? 201 : 200).json({
        sessionId: result.user.sessionId,
        customerName: result.user.customerName,
        status: result.user.status,
        tableId,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/customer/leave', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      const sessionId = req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      const connectedBefore = tableCustomerSessions.connectedCount(tableId);
      tableCustomerSessions.leaveTable(tableId, sessionId);
      emitUsers(tableId);
      tableCustomerKitchenSend
        .tryAutoSendReadyPeersAfterDepart(tableId, sessionId, io, { connectedBefore })
        .catch(function () {});
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/customer/users', (req, res) => {
    try {
      const tableId = req.query.tableId != null ? String(req.query.tableId).trim() : '';
      if (!tableId) return res.status(400).json({ error: 'tableId مطلوب.' });
      const tid = String(tableId || '').trim();
      let users = tableCustomerSessions.listConnectedPublicUsers(tid);
      try {
        users = tableCustomerKitchenUserSync.enrichUsersFromKitchenOrders(tid, users);
      } catch (_) {}
      res.json({
        users,
        count: tableCustomerSessions.connectedCount(tid),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/customer/status', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      const sessionId = req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      const status = req.body && req.body.status != null ? String(req.body.status).trim() : '';
      const result = tableCustomerSessions.setUserStatus(tableId, sessionId, status);
      if (!result.ok) {
        return res.status(result.code === 'not_found' ? 404 : 400).json({ error: 'تعذر تحديث الحالة.' });
      }
      emitUsers(tableId);
      res.json({ ok: true, status: result.user.status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/customer/cart', (req, res) => {
    try {
      const tableId = req.query.tableId != null ? String(req.query.tableId).trim() : '';
      const sessionId = req.query.sessionId != null ? String(req.query.sessionId).trim() : '';
      if (!tableId || !sessionId) {
        return res.status(400).json({ error: 'tableId و sessionId مطلوبان.' });
      }
      const user = tableCustomerSessions.findUser(tableId, sessionId);
      if (!user) return res.status(404).json({ error: 'الجلسة غير موجودة.' });
      res.json({ items: tableCustomerCart.getCartSnapshot(tableId, sessionId) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/customer/send-kitchen', (req, res) => {
    const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
    const sessionId = req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
    const items = req.body && Array.isArray(req.body.items) ? req.body.items : [];
    const bundleReadyPeers = !!(req.body && req.body.bundleReadyPeers);
    const sendAlone = !!(req.body && req.body.sendAlone);
    const deviceId = req.body && req.body.deviceId != null ? String(req.body.deviceId).trim() : '';
    const customerId =
      req.body && req.body.customerId != null ? String(req.body.customerId).trim() : '';
    const customerIdByPeer = {};
    if (customerId && sessionId) customerIdByPeer[sessionId] = customerId;
    tableCustomerKitchenSend
      .sendToKitchen({
        tableId,
        senderSessionId: sessionId,
        senderItems: items,
        bundleReadyPeers,
        sendAlone,
        customerIdByPeer,
        io,
        deviceId,
      })
      .then((result) => {
      if (!result.ok) {
        if (result.code === 'till_closed') {
          return res.status(400).json({ error: 'لا يمكن إرسال الطلب لأن قاصة اليوم غير مفتوحة.' });
        }
        if (result.code === 'empty_cart') {
          return res.status(400).json({ error: 'السلة فارغة — أضف أصنافاً قبل الإرسال.' });
        }
        if (result.code === 'invalid_items') {
          return res.status(400).json({ error: result.message || 'أصناف غير صالحة.' });
        }
        if (result.code === tableBillRequestService.BILL_BLOCKED_CODE) {
          return res.status(409).json({
            error: result.message || tableBillRequestService.BILL_BLOCKED_MESSAGE,
            code: tableBillRequestService.BILL_BLOCKED_CODE,
          });
        }
        return res.status(400).json({ error: 'تعذّر إرسال الطلب.' });
      }
      res.status(201).json({
        ok: true,
        order: result.order,
        myOrderId: result.myOrderId,
        placements: result.placements,
      });
      })
      .catch((err) => {
        res.status(500).json({ error: err.message || 'تعذّر إرسال الطلب.' });
      });
  });

  router.post('/customer/cart/mutate', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      const sessionId = req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      const mutations = req.body && req.body.mutations != null ? req.body.mutations : [];
      if (!tableId || !sessionId) {
        return res.status(400).json({ error: 'tableId و sessionId مطلوبان.' });
      }
      const itemsBefore = tableCustomerCart.getCartSnapshot(tableId, sessionId);
      const result = tableCustomerCart.applyMutations(tableId, sessionId, mutations);
      if (!result.ok) {
        if (result.code === 'not_found') return res.status(404).json({ error: 'الجلسة غير موجودة.' });
        return res.status(400).json({ error: 'تعذّر تطبيق التعديل.' });
      }
      const coord = tableCustomerCoordination.applyCartEditCoordination(
        tableId,
        sessionId,
        mutations,
        { itemsBefore: itemsBefore, itemsAfter: result.items || [] }
      );
      if (coord.changed) {
        emitUsers(tableId);
      }
      emitCustomerCart(io, { tableId, sessionId, items: result.items || [] });
      res.json({ ok: true, items: result.items || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:sessionId', (req, res) => {
    try {
      const id = String(req.params.sessionId || '').trim();
      const sess = tableSessions.getSessionById(id);
      const ok = tableSessions.releaseSession(id);
      if (!ok) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (sess) {
        const r = resolveTableStatus(sess.tableId, '');
        emitTableUpdate(io, {
          tableId: sess.tableId,
          status: r.status,
          sessionId: r.status === 'in_use' ? r.sessionId : null,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/resume-check', (req, res) => {
    try {
      const tableId = req.query.tableId != null ? String(req.query.tableId).trim() : '';
      const sessionId = req.query.sessionId != null ? String(req.query.sessionId).trim() : '';
      const orderId = req.query.orderId != null ? String(req.query.orderId).trim() : '';
      const customerSessionId =
        req.query.customerSessionId != null ? String(req.query.customerSessionId).trim() : '';
      const customerId = req.query.customerId != null ? String(req.query.customerId).trim() : '';
      const result = tableCustomerResume.evaluateResume({
        tableId,
        orderId,
        sessionId,
        customerSessionId,
        customerId,
      });
      return res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/bill-status', (req, res) => {
    try {
      const tableId = req.query.tableId != null ? String(req.query.tableId).trim() : '';
      if (!tableId) return res.status(400).json({ error: 'معرف الطاولة مطلوب' });
      res.json(tableBillRequestService.getBillStatus(tableId));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/bill-requested-tables', (req, res) => {
    try {
      res.json({ tableIds: tableBillRequestService.listRequestedTableIds() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/bill-request', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      if (!tableId) return res.status(400).json({ error: 'معرف الطاولة مطلوب' });
      const tableLabel =
        req.body && req.body.tableLabel != null ? String(req.body.tableLabel).trim() : tableId;
      const sessionId =
        req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      const result = tableBillRequestService.setBillRequested(tableId, { tableLabel, sessionId });
      const normTableId = result.status.tableId || tableId;
      const label = result.status.tableLabel || tableLabel;
      const isReminder = !!result.isReminder;
      const msgOpts = { isReminder };
      emitBillRequest(io, {
        tableId: normTableId,
        tableLabel: label,
        sessionId,
        isReminder,
        cashierMessage: tableBillRequestService.cashierMessage(normTableId, label, msgOpts),
        captainMessage: tableBillRequestService.captainMessage(normTableId, label, msgOpts),
      });
      const nextStatus = resolveTableStatus(normTableId, '');
      emitTableUpdate(io, {
        tableId: normTableId,
        status: nextStatus.status,
        sessionId: nextStatus.sessionId,
        statusLabel: nextStatus.statusLabel || null,
      });
      res.json(result);
    } catch (err) {
      if (err.code === tableBillRequestService.BILL_NOT_READY_CODE) {
        return res.status(err.status || 400).json({
          error: err.message,
          code: err.code,
          title: tableBillRequestService.BILL_NOT_READY_TITLE,
        });
      }
      if (err.code === tableBillRequestService.BILL_COOLDOWN_CODE) {
        return res.status(err.status || 429).json({
          error: err.message,
          code: err.code,
          title: err.title || 'طلب الحساب',
        });
      }
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/captain-request', (req, res) => {
    try {
      const tableId = req.body && req.body.tableId != null ? String(req.body.tableId).trim() : '';
      if (!tableId) return res.status(400).json({ error: 'معرف الطاولة مطلوب' });
      const tableLabel =
        req.body && req.body.tableLabel != null ? String(req.body.tableLabel).trim() : tableId;
      const sessionId =
        req.body && req.body.sessionId != null ? String(req.body.sessionId).trim() : '';
      emitCaptainRequest(io, { tableId, tableLabel, sessionId });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/validate/:sessionId', (req, res) => {
    try {
      const s = tableSessions.getSessionById(req.params.sessionId);
      if (!s) return res.status(404).json({ valid: false });
      const tid = String(s.tableId);
      if (getOrdersBlockingTableClaim(tid).length > 0) {
        return res.json({ valid: false, reason: 'occupied' });
      }
      res.json({
        valid: true,
        session: {
          sessionId: s.sessionId,
          tableId: s.tableId,
          status: s.status,
          createdAt: s.createdAt,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTableSessionsRouter;
