/**
 * API أرشيف الطلبات والتقارير — فلترة حسب يوم / شهر / سنة
 */
const express = require('express');
const { authenticateToken } = require('./authMiddleware');
const router = express.Router();
router.use(authenticateToken);
const { getReport, getReportAsync, getSampleReport } = require('../data/archive');

/** تحويل طلب من صيغة الأرشيف إلى صيغة واجهة الطلبات (مطابق لـ /api/orders/today) */
function orderToResponse(o) {
  const items = (o.items || []).map((it) => ({
    name: it.name,
    price: it.price || 0,
    quantity: it.qty || it.quantity || 1,
  }));
  return {
    id: o.id,
    tableId: String(o.table || o.tableId || ''),
    orderType: o.orderType || o.order_type || 'DINE_IN',
    paymentMethod: o.paymentMethod || o.payment_method || 'cash',
    items,
    total: o.total != null ? o.total : items.reduce((s, it) => s + it.price * it.quantity, 0),
    closedAt: o.closedAt || null,
    createdAt: o.createdAt || o.created_at || o.closedAt || null,
  };
}

/**
 * معالج GET /api/archive/report — يُصدَّر لاستخدامه في السيرفر مباشرةً أيضاً.
 * type=day|month|year & date=YYYY-MM-DD|YYYY-MM|YYYY
 */
async function reportHandler(req, res) {
  try {
    const cafeId = req.cafeId;
    if (!cafeId) {
      return res.status(400).json({ error: 'cafeId مطلوب' });
    }
    const type = (req.query.type || 'day').toLowerCase();
    const date = req.query.date || '';
    const report = await getReportAsync(cafeId, type, date);
    const orders = (report.orders || []).map(orderToResponse);
    res.json({
      totalProfit: report.totalProfit || 0,
      totalOrders: report.totalOrders || 0,
      dineInOrders: report.dineInOrders || 0,
      takeawayOrders: report.takeawayOrders || 0,
      deliveryOrders: report.deliveryOrders || 0,
      itemsSold: report.itemsSold || 0,
      topProduct: report.topProduct || '',
      topProductCount: report.topProductCount || 0,
      orders,
      sampleData: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/report', reportHandler);

module.exports = router;
module.exports.reportHandler = [authenticateToken, reportHandler];
