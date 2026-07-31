/**
 * API قاصات الأيام (Daily Cash Closing)
 */
const { authenticateToken } = require('./authMiddleware');
const closingRepo = require('../repository/closingRepository');

const express = require('express');
const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    const openDate = (req.query.open_date || '').toString().trim();
    const start = (req.query.open_date_start || '').toString().trim();
    const end = (req.query.open_date_end || '').toString().trim();
    if (openDate) return res.json(await closingRepo.getClosingsByOpenDate(cafeId, openDate));
    if (start && end) return res.json(await closingRepo.getClosingsByOpenDateRange(cafeId, start, end));
    res.json(await closingRepo.getClosings(cafeId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/last', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    res.json(await closingRepo.getLastClosing(cafeId) || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function postClosingHandler(req, res) {
  try {
    const cafeId = req.cafeId;
    const { date, time, totalSales, expenses, netTotal, note, orderCount } = req.body || {};
    const dateStr = String(date || '').trim();
    if (!dateStr) return res.status(400).json({ error: 'حقل التاريخ مطلوب' });
    if (await closingRepo.hasClosingForDate(cafeId, dateStr)) return res.status(400).json({ error: 'تم إغلاق هذا اليوم مسبقاً' });

    const total = Number(totalSales) || 0;
    const exp = Number(expenses) || 0;
    const net = netTotal != null ? Number(netTotal) : total - exp;

    const record = await closingRepo.addClosing(cafeId, {
      date: dateStr,
      time: String(time || ''),
      totalSales: total,
      expenses: exp,
      netTotal: net,
      note: String(note || ''),
      orderCount: Number(orderCount) || 0,
    });

    await closingRepo.clearClosedOrdersForDate(cafeId, dateStr);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.post('/', postClosingHandler);

module.exports = router;
module.exports.postClosingHandler = [authenticateToken, postClosingHandler];
