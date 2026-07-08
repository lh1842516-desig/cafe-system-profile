/**
 * حالة ظهور تطبيق الزبون (مقدّمة / خلفية) لكل (طاولة + عميل).
 * يُحدَّث عبر حدث سوكت customer_table_presence { connectionState }.
 * الهدف: iOS Safari يجمّد المؤقتات ويقطع السوكت عند الخلفية — لا نعتبر ذلك انقطاعاً حقيقياً
 * ولا نُشغّل مهلة إزالة المضيف/الضيف أثناء connectionState === 'background'.
 */
const MAX_STALE_MS = 2 * 60 * 60 * 1000;

/** @type {Map<string, { connectionState: 'active'|'background', updatedAt: number }>} */
const byPair = new Map();

function pairKey(tableId, clientId) {
  return `${String(tableId || '').trim()}\t${String(clientId || '').trim()}`;
}

function setConnectionState(tableId, clientId, connectionState) {
  const tid = String(tableId || '').trim();
  const cid = String(clientId || '').trim();
  if (!tid || !cid) return;
  const raw = String(connectionState || 'active').trim().toLowerCase();
  const state = raw === 'background' ? 'background' : 'active';
  byPair.set(pairKey(tid, cid), { connectionState: state, updatedAt: Date.now() });
}

/**
 * @returns {'active'|'background'}
 */
function getConnectionState(tableId, clientId) {
  const k = pairKey(tableId, clientId);
  const row = byPair.get(k);
  if (!row) return 'active';
  if (Date.now() - row.updatedAt > MAX_STALE_MS) {
    byPair.delete(k);
    return 'active';
  }
  return row.connectionState === 'background' ? 'background' : 'active';
}

function isBackground(tableId, clientId) {
  return getConnectionState(tableId, clientId) === 'background';
}

function clearPair(tableId, clientId) {
  byPair.delete(pairKey(tableId, clientId));
}

module.exports = {
  setConnectionState,
  getConnectionState,
  isBackground,
  clearPair,
};
