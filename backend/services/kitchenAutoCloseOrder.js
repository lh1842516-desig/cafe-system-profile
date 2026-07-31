/**
 * إغلاق تلقائي لطلبات السفري/الدلفري عند إنهاء التجهيز في المطبخ.
 * طلبات داخل الصالة تبقى مفتوحة حتى يغلقها الكاشير (دفع).
 */

const { addOrderToArchive } = require('../data/archive');

function inferServiceOrderType(order) {
  if (!order) return null;
  const tid = String(order.tableId != null ? order.tableId : '')
    .trim()
    .toUpperCase();
  if (tid === 'TAKEAWAY' || tid === 'DELIVERY') return tid;
  const t = String(order.orderType != null ? order.orderType : '')
    .trim()
    .toUpperCase();
  if (t === 'TAKEAWAY' || t === 'DELIVERY') return t;
  return null;
}

/**
 * @param {object} order — مرجع من مصفوفة getOrders()
 * @param {{ openDate: string, sessionId: string }} session
 * @returns {boolean} true إذا تم الإغلاق الآن
 */
function autoCloseIfServiceOrder(order, session) {
  if (!order || order.closed === true) return false;
  if (!inferServiceOrderType(order)) return false;
  if (!session || !session.openDate) return false;

  const closedAt = new Date().toISOString();
  order.closed = true;
  order.closedAt = closedAt;
  if (!order.paymentMethod) order.paymentMethod = 'cash';
  if (!order.open_date) order.open_date = session.openDate;
  order.close_open_date = session.openDate;
  order.cash_session_id = session.sessionId;
  addOrderToArchive(order);
  return true;
}

module.exports = {
  inferServiceOrderType,
  autoCloseIfServiceOrder,
};
