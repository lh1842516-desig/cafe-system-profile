/**
 * إحصائيات اليوم — طلبات، مبيعات، أرباح، أكثر منتج، عدد المنتجات المباعة
 */
const express = require('express');
const till = require('../data/till');
const { getClosedOrdersForSession } = require('../services/cashSessionHelper');

const router = express.Router();
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

/** GET /api/stats/today — إحصائيات اليوم (طلبات مغلقة اليوم فقط) */
router.get('/today', (req, res) => {
  try {
    const session = till.getActiveSessionMeta();
    if (!session || !session.openDate) {
      return res.status(400).json({ error: 'لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.' });
    }
    const orders = getClosedOrdersForSession(session);

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

    res.json({
      ordersCountToday: orders.length,
      dineInOrdersToday: dineInOrders,
      takeawayOrdersToday: takeawayOrders,
      deliveryOrdersToday: deliveryOrders,
      revenueToday,
      topProduct,
      itemsSoldToday: itemsSoldCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
