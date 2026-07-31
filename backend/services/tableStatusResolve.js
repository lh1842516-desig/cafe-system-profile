/**
 * حالة عرض الطاولة (available / in_use / occupied) — مصدر واحد للـ API وللبث الفوري
 * «مشغولة» = أي طلب غير مُغلق في القاصة (بما فيه المنتهي في المطبخ وفي انتظار الدفع)،
 * كي تبقى واجهة الطاولات وقفل «تغيير الطاولة» كالسلوك الأصلي.
 * مسارات الحجز/الإلغاء تستخدم getOrdersBlockingTableClaim منفصلة في store + routes.
 */
const orderRepo = require('../repository/orderRepository');
const tableSessions = require('./tableSessions');


/**
 * @param {string} cafeId
 * @param {string} tableId
 * @param {string} mineSessionId
 * @param {string} [mineOrderId] — إن وُجد ويطابق طلباً مفتوحاً على الطاولة تُعاد isMine=true (استئناف بعد إغلاق المتصفح)
 * @returns {{ status: 'available'|'in_use'|'occupied'|'awaiting_bill', sessionId: string|null, isMine: boolean, statusLabel?: string }}
 */
async function resolveTableStatus(cafeId, tableId, mineSessionId, mineOrderId) {
  const tid = String(tableId || '').trim();
  const oidWant = String(mineOrderId || '').trim();
  const open = await orderRepo.getOrdersByTable(cafeId, tid);
  if (open && open.length > 0) {
    const mineByOrder = !!(oidWant && open.some((o) => String(o.id) === oidWant));

    return { status: 'occupied', sessionId: null, isMine: mineByOrder };
  }
  const sess = tableSessions.getSessionByTable(tid);
  if (sess && String(sess.status || '').toLowerCase() === 'in_use' && String(sess.sessionId || '').trim()) {
    const mine = !!(mineSessionId && String(sess.sessionId) === String(mineSessionId).trim());
    return { status: 'in_use', sessionId: sess.sessionId, isMine: mine };
  }
  return { status: 'available', sessionId: null, isMine: false };
}

module.exports = { resolveTableStatus };
