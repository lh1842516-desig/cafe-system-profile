/**
 * سلة زبون واحد — تعديلات فقط على سطور جلسته.
 */
const tableCustomerSessions = require('./tableCustomerSessions');

function normalizeLine(line) {
  if (!line || typeof line !== 'object') return null;
  const lineId = String(line.lineId || '').trim();
  if (!lineId) return null;
  const menuId = line.menuId != null ? String(line.menuId) : '';
  const name = line.name != null ? String(line.name) : '';
  const price = Number(line.price);
  const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
  const note = line.note != null ? String(line.note).trim() : '';
  const selectedOptions =
    line.selectedOptions && typeof line.selectedOptions === 'object' && !Array.isArray(line.selectedOptions)
      ? line.selectedOptions
      : {};
  const orderBatch = line.orderBatch != null ? Math.max(1, Math.floor(Number(line.orderBatch) || 1)) : 1;
  const key = line.key != null ? String(line.key) : '';
  const id = line.id != null ? String(line.id).trim() : '';
  const fromServerOrder = !!line.fromServerOrder;
  return {
    lineId,
    menuId,
    name,
    price: Number.isFinite(price) ? price : 0,
    quantity,
    note,
    selectedOptions,
    orderBatch,
    key,
    id,
    fromServerOrder,
  };
}

/**
 * @param {string} tableId
 * @param {string} sessionId
 * @param {Array<{ op: string, line?: object, lineId?: string, items?: object[] }>} mutations
 */
function applyMutations(tableId, sessionId, mutations) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return { ok: false, code: 'invalid_input' };
  const user = tableCustomerSessions.findUser(tid, sid);
  if (!user) return { ok: false, code: 'not_found' };

  let items = (user.cart || []).map(normalizeLine).filter(Boolean);

  const ops = Array.isArray(mutations) ? mutations : [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i] || {};
    const kind = String(op.op || '').trim().toLowerCase();
    if (kind === 'replaceall') {
      const raw = Array.isArray(op.items) ? op.items : [];
      items = [];
      for (let j = 0; j < raw.length; j += 1) {
        const nl = normalizeLine(raw[j]);
        if (nl && nl.quantity > 0) items.push(nl);
      }
      continue;
    }
    if (kind === 'clearall') {
      items = [];
      continue;
    }
    if (kind === 'remove') {
      const lid = String(op.lineId || '').trim();
      if (!lid) continue;
      items = items.filter(function (x) {
        return x && String(x.lineId) !== lid;
      });
      continue;
    }
    if (kind === 'set') {
      const normalized = normalizeLine(op.line);
      if (!normalized || normalized.quantity <= 0) continue;
      const ix = items.findIndex(function (x) {
        return x && String(x.lineId) === String(normalized.lineId);
      });
      if (ix >= 0) items[ix] = normalized;
      else items.push(normalized);
    }
  }

  const saved = tableCustomerSessions.saveUserCart(tid, sid, items);
  if (!saved.ok) return saved;
  return { ok: true, items: saved.cart || [] };
}

module.exports = {
  applyMutations,
  normalizeLine,
  getCartSnapshot: tableCustomerSessions.getCartSnapshot,
};
