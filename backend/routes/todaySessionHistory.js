/**
 * API سجل جلسات طلبات اليوم (بعد إغلاق الحساب).
 */
const express = require('express');
const router = express.Router();
const {
  createSessionFromClosedOrders,
  listSessionsForCurrentTill,
  listSessionsForReport,
  getSessionById,
} = require('../services/todaySessionHistoryService');

router.get('/report', (req, res) => {
  try {
    const type = String(req.query.type || 'day').trim();
    const date = String(req.query.date || '').trim();
    const sessions = listSessionsForReport(type, date);
    res.json(sessions);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    const sessions = listSessionsForCurrentTill();
    res.json(sessions);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:sessionId', (req, res) => {
  try {
    const session = getSessionById(req.params.sessionId);
    res.json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const session = createSessionFromClosedOrders({
      tableId: body.tableId,
      orderIds: body.orderIds,
      paymentMethod: body.paymentMethod,
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
