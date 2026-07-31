/**
 * Helper responsible for normalizing table IDs and formatting Socket.IO room names centrally.
 * This breaks circular dependencies between tableRealTime and tableCustomerSocket.
 */

function normalizeTableId(tableId) {
  const s = String(tableId || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

function tableRoomName(tableId, cafeId) {
  const t = normalizeTableId(tableId);
  if (!t) return '';
  const cid = String(cafeId || '').trim();
  if (cid) return `cafe-${cid}-table-${t}`;
  return 'table-' + t;
}

module.exports = {
  normalizeTableId,
  tableRoomName
};
