/**
 * API قاصات الأيام (Daily Cash Closing)
 * POST إنشاء قاصة، GET كل القاصات (أدمن)، GET آخر قاصة (كاشير)
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

/**
 * GET /api/closings — كل القاصات أو فلترة حسب تاريخ الفتح (open_date).
 * الاستعلام: ?open_date=YYYY-MM-DD (قاصات فُتحت في هذا اليوم فقط)
 * أو ?open_date_start=YYYY-MM-DD&open_date_end=YYYY-MM-DD (نطاق للشهر/السنة).
 * الفلترة تعتمد على تاريخ فتح القاصة (opened_at) وليس تاريخ الإغلاق.
 */
router.get('/', (req, res) => {
  try {
    const openDate = (req.query.open_date || '').toString().trim();
    const start = (req.query.open_date_start || '').toString().trim();
    const end = (req.query.open_date_end || '').toString().trim();

    if (openDate) {
      return res.json(getClosingsByOpenDate(openDate));
    }
    if (start && end) {
      return res.json(getClosingsByOpenDateRange(start, end));
    }
    res.json(getClosings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/closings/last — آخر قاصة فقط (للكاشير: قاصة بارحة) */
router.get('/last', (req, res) => {
  try {
    const last = getLastClosing();
    res.json(last || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/closings — تسجيل قاصة يوم (من الكاشير). لا يُسمح بإغلاق نفس اليوم مرتين. */
function postClosingHandler(req, res) {
  try {
    const { date, time, totalSales, expenses, netTotal, note, orderCount } = req.body || {};
    const dateStr = String(date || '').trim();
    if (!dateStr) {
      return res.status(400).json({ error: 'حقل التاريخ مطلوب' });
    }

    if (hasClosingForDate(dateStr)) {
      return res.status(400).json({ error: 'تم إغلاق هذا اليوم مسبقاً' });
    }

    const total = Number(totalSales) || 0;
    const exp = Number(expenses) || 0;
    const net = netTotal != null ? Number(netTotal) : total - exp;

    const record = addClosing({
      date: dateStr,
      time: String(time || ''),
      totalSales: total,
      expenses: exp,
      netTotal: net,
      note: String(note || ''),
      orderCount: Number(orderCount) || 0,
    });

    clearClosedOrdersForDate(dateStr);

    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.post('/', postClosingHandler);

module.exports = router;
module.exports.postClosingHandler = postClosingHandler;
