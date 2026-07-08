/**
 * طبقة موحّدة لربط الطلبات والإحصائيات بجلسة القاصة (cash session)
 * وليس بتاريخ التقويم الحالي.
 */
const { getOrders } = require('../data/store');

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

function getClosedOrdersForSession(session) {
  if (!session) return [];
  return getOrders().filter((o) => o && o.closed === true && orderBelongsToSession(o, session));
}

function aggregateSalesForSession(session) {
  let salesCash = 0;
  let salesCard = 0;
  const orders = getClosedOrdersForSession(session);
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

/** الجلسة المفتوحة حالياً (إن وُجدت) — lazy لتجنّب تعارض استيراد مع till.js */
function getCurrentSession() {
  return require('../data/till').getActiveSessionMeta();
}

function getSessionId() {
  const s = getCurrentSession();
  return s && s.sessionId ? s.sessionId : null;
}

module.exports = {
  orderBelongsToSession,
  getClosedOrdersForSession,
  aggregateSalesForSession,
  getCurrentSession,
  getSessionId,
};
