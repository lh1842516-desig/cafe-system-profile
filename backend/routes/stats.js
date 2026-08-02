/**
 * إحصائيات اليوم — طلبات، مبيعات، أرباح، أكثر منتج، عدد المنتجات المباعة
 */
const express = require('express');
const { authenticateToken } = require('./authMiddleware');
const tillRepo = require('../repository/tillRepository');
const { getClosedOrdersForSession } = require('../services/cashSessionHelper');

const router = express.Router();
router.use(authenticateToken);
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

const archive = require('../data/archive');

/** GET /api/stats/today — إحصائيات اليوم (طلبات مغلقة اليوم فقط) */
router.get('/today', async (req, res) => {
  try {
    const cafeId = req.cafeId;
    const session = await tillRepo.getActiveSessionMeta(cafeId);
    if (session && session.openDate) {
      const orders = await getClosedOrdersForSession(cafeId, session);
      if (orders && orders.length > 0) {
        let revenueToday = 0;
        let itemsSoldCount = 0;
        const productCounts = {};
        let dineInOrders = 0;
        let takeawayOrders = 0;
        let deliveryOrders = 0;

        for (const order of orders) {
          const type = normalizeOrderType(order.orderType);
          if (type === ORDER_TYPE.DELIVERY) deliveryOrders += 1;
          else if (type === ORDER_TYPE.TAKEAWAY) takeawayOrders += 1;
          else dineInOrders += 1;
          for (const item of order.items || []) {
            const subtotal = (item.price || 0) * (item.quantity || 0);
            revenueToday += subtotal;
            itemsSoldCount += item.quantity || 0;
            const key = item.name || item.menuId || 'غير معروف';
            productCounts[key] = (productCounts[key] || 0) + (item.quantity || 0);
          }
        }

        const topEntry = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0] || null;
        const topProduct = topEntry ? { name: topEntry[0], count: topEntry[1] } : { name: '—', count: 0 };

        return res.json({
          ordersCountToday: orders.length,
          dineInOrdersToday: dineInOrders,
          takeawayOrdersToday: takeawayOrders,
          deliveryOrdersToday: deliveryOrders,
          revenueToday,
          topProduct,
          itemsSoldToday: itemsSoldCount,
        });
      }
    }

    // Fallback: If till is closed or session has no orders, fetch from archive report for today
    let todayStr = req.query.date || '';
    if (!todayStr) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' });
        todayStr = formatter.format(new Date());
      } catch (_) {
        const d = new Date(Date.now() + 3 * 3600 * 1000);
        todayStr = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
    }
    const archiveReport = await archive.getReportAsync(cafeId, 'day', todayStr);
    res.json({
      ordersCountToday: archiveReport.totalOrders || 0,
      dineInOrdersToday: archiveReport.dineInOrders || 0,
      takeawayOrdersToday: archiveReport.takeawayOrders || 0,
      deliveryOrdersToday: archiveReport.deliveryOrders || 0,
      revenueToday: archiveReport.totalProfit || 0,
      topProduct: archiveReport.topProduct ? { name: archiveReport.topProduct, count: archiveReport.topProductCount } : { name: '—', count: 0 },
      itemsSoldToday: archiveReport.itemsSold || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
