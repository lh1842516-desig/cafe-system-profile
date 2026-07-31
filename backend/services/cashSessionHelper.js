/**
 * طبقة موحّدة لربط الطلبات والإحصائيات بجلسة القاصة (cash session)
 * وليس بتاريخ التقويم الحالي.
 */
const orderRepo = require('../repository/orderRepository');
const tillRepo = require('../repository/tillRepository');

/**
 * هل ينتمي الطلب إلى جلسة القاصة المعطاة؟
 * الأولوية: cash_session_id → tillOpenedAt → نافذة زمنية [openedAt … closedAt|الآن] → open_date
 */
function orderBelongsToSession(order, session) {
  if (!order || !session) return false;
  if (!session.sessionId && !session.openedAt) return false;
  if (order.cash_session_id != null) {
    return String(order.cash_session_id) === String(session.sessionId);
  }
  if (order.tillOpenedAt != null) {
    return String(order.tillOpenedAt) === String(session.sessionId);
  }
  if (session.openedAt && order.closedAt) {
    const t = new Date(order.closedAt).getTime();
    const start = new Date(session.openedAt).getTime();
    const end = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
    if (!Number.isNaN(t) && !Number.isNaN(start) && !Number.isNaN(end) && t >= start && t <= end) {
      return true;
    }
  }
  if (order.open_date != null && session.openDate) {
    return String(order.open_date).trim() === String(session.openDate).trim();
  }
  return false;
}

async function getClosedOrdersForSession(cafeId, session) {
  if (!session) return [];
  const orders = await orderRepo.getOrders(cafeId);
  return orders.filter((o) => o && o.closed === true && orderBelongsToSession(o, session));
}

async function aggregateSalesForSession(cafeId, session) {
  let salesCash = 0;
  let salesCard = 0;
  const orders = await getClosedOrdersForSession(cafeId, session);
  for (const o of orders) {
    const total = o.total != null
      ? o.total
      : (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
    const method = (o.paymentMethod || 'cash').toLowerCase();
    if (method === 'card') salesCard += total;
    else salesCash += total;
  }
  return { salesCash, salesCard, total: salesCash + salesCard };
}

/** الجلسة المفتوحة حالياً (إن وُجدت) */
function getCurrentSession(cafeId) {
  return tillRepo.getActiveSessionMeta(cafeId);
}

function getSessionId(cafeId) {
  const s = getCurrentSession(cafeId);
  return s && s.sessionId ? s.sessionId : null;
}

module.exports = {
  orderBelongsToSession,
  getClosedOrdersForSession,
  aggregateSalesForSession,
  getCurrentSession,
  getSessionId,
};
