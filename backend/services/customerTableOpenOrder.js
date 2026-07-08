/**
 * طلبات مفتوحة للطاولة — استعادة جلسة نفس الزبون فقط (peer مطابق).
 * لا نختار «أي طلب على الطاولة» — يمنع دخول زبون جديد باسم/طلب سابق.
 */
const { getOrdersByTable } = require('../data/store');

function normId(v) {
  return String(v != null ? v : '').trim();
}

/**
 * @param {string} tableId
 * @param {string} peerSessionId — مطلوب؛ بدون peer لا استعادة
 * @returns {object|null}
 */
function pickOpenOrderForTable(tableId, peerSessionId) {
  const tid = normId(tableId);
  const peer = normId(peerSessionId);
  if (!tid || !peer) return null;

  const open = getOrdersByTable(tid);
  return (
    open.find(
      (o) => o.customerSessionId != null && normId(o.customerSessionId) === peer
    ) || null
  );
}

module.exports = {
  pickOpenOrderForTable,
};
