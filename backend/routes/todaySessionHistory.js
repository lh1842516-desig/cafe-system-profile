/**
 * API سجل جلسات طلبات اليوم (بعد إغلاق الحساب).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./authMiddleware');
const {
  createSessionFromClosedOrders,
  listSessionsForCurrentTill,
  listSessionsForReport,
  getSessionById,
} = require('../services/todaySessionHistoryService');

router.use(authenticateToken);

router.get('/report', (req, res) => {
  try {
    const type = String(req.query.type || 'day').trim();
    const date = String(req.query.date || '').trim();
    const sessions = listSessionsForReport(req.cafeId, type, date);
    res.json(sessions);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    const sessions = await listSessionsForCurrentTill(cafeId);
    res.json(sessions);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:sessionId', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    const session = await getSessionById(cafeId, req.params.sessionId);
    res.json(session);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    const body = req.body || {};
    const session = await createSessionFromClosedOrders(cafeId, {
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
