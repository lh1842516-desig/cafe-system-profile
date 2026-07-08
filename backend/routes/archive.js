/**
 * API أرشيف الطلبات والتقارير — فلترة حسب يوم / شهر / سنة
 */
const express = require('express');
const router = express.Router();
const { getReport, getSampleReport } = require('../data/archive');

/** تحويل طلب من صيغة الأرشيف إلى صيغة واجهة الطلبات (مطابق لـ /api/orders/today) */
function orderToResponse(o) {
  const items = (o.items || []).map((it) => ({
    name: it.name,
    price: it.price || 0,
    quantity: it.qty || 1,
  }));
  return {
    id: o.id,
    tableId: String(o.table || o.tableId || ''),
    items,
    total: o.total != null ? o.total : items.reduce((s, it) => s + it.price * it.quantity, 0),
    closedAt: o.closedAt || null,
  };
}

/**
 * معالج GET /api/archive/report — يُصدَّر لاستخدامه في السيرفر مباشرةً أيضاً.
 * type=day|month|year & date=YYYY-MM-DD|YYYY-MM|YYYY
 */
function reportHandler(req, res) {
  try {
    const type = (req.query.type || 'day').toLowerCase();
    const date = req.query.date || '';
    let report = getReport(type, date);
    let sampleData = false;
    if (!report.orders || report.orders.length === 0) {
      report = getSampleReport(type, date);
      sampleData = true;
    }
    const orders = (report.orders || []).map(orderToResponse);
    res.json({
      totalProfit: report.totalProfit || 0,
      totalOrders: report.totalOrders || 0,
      itemsSold: report.itemsSold || 0,
      topProduct: report.topProduct || '',
      topProductCount: report.topProductCount || 0,
      orders,
      sampleData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/report', reportHandler);

module.exports = router;
module.exports.reportHandler = reportHandler;
