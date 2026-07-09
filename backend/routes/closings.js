/**
 * API قاصات الأيام (Daily Cash Closing)
 */
const express = require('express');
const {
  getClosings,
  getClosingsByOpenDate,
  getClosingsByOpenDateRange,
  addClosing,
  getLastClosing,
  hasClosingForDate,
  clearClosedOrdersForDate,
} = require('../data/store');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const openDate = (req.query.open_date || '').toString().trim();
    const start = (req.query.open_date_start || '').toString().trim();
    const end = (req.query.open_date_end || '').toString().trim();
    if (openDate) return res.json(getClosingsByOpenDate(openDate));
    if (start && end) return res.json(getClosingsByOpenDateRange(start, end));
    res.json(getClosings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/last', (req, res) => {
  try {
    res.json(getLastClosing() || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function postClosingHandler(req, res) {
  try {
    const { date, time, totalSales, expenses, netTotal, note, orderCount } = req.body || {};
    const dateStr = String(date || '').trim();
    if (!dateStr) return res.status(400).json({ error: 'حقل التاريخ مطلوب' });
    if (hasClosingForDate(dateStr)) return res.status(400).json({ error: 'تم إغلاق هذا اليوم مسبقاً' });

    const total = Number(totalSales) || 0;
    const exp = Number(expenses) || 0;
    const net = netTotal != null ? Number(netTotal) : total - exp;

    const record = await addClosing({
      date: dateStr,
      time: String(time || ''),
      totalSales: total,
      expenses: exp,
      netTotal: net,
      note: String(note || ''),
      orderCount: Number(orderCount) || 0,
    });

    await clearClosedOrdersForDate(dateStr);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.post('/', postClosingHandler);

module.exports = router;
module.exports.postClosingHandler = postClosingHandler;
