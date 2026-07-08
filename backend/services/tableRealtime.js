/**
 * بث تغييرات حالة الطاولة لجميع عملاء واجهة الزبون (Socket.io)
 * الحمولة: { tableId: number|string, status: 'available'|'inUse'|'occupied', sessionId? }
 */
function toWireTableId(tableId) {
  const s = String(tableId != null ? tableId : '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && String(n) === s) return n;
  return s;
}

function emitTableUpdate(io, payload) {
  if (!io || typeof io.emit !== 'function') return;
  const raw = String(payload.status || 'available').toLowerCase();
  let status = 'available';
  if (raw === 'occupied') status = 'occupied';
  else if (raw === 'in_use' || raw === 'inuse') status = 'inUse';
  else if (raw === 'awaiting_bill' || raw === 'awaitingbill') status = 'awaiting_bill';
  const msg = {
    tableId: toWireTableId(payload.tableId),
    status,
  };
  if (payload.sessionId != null && String(payload.sessionId).trim() !== '') {
    msg.sessionId = String(payload.sessionId).trim();
  }
  if (payload.statusLabel != null && String(payload.statusLabel).trim() !== '') {
    msg.statusLabel = String(payload.statusLabel).trim();
  }
  io.emit('table_update', msg);
}

/** سلة زبون واحد — للجهاز صاحب الجلسة فقط */
function emitCustomerCart(io, payload) {
  if (!io || typeof io.emit !== 'function') return;
  const tid = payload && payload.tableId != null ? payload.tableId : '';
  const sessionId = payload && payload.sessionId != null ? String(payload.sessionId).trim() : '';
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (!tid || !sessionId) return;
  io.emit('customer_cart_updated', {
    tableId: toWireTableId(tid),
    sessionId,
    items,
  });
}

/** قائمة المتصلين بالطاولة + العدد */
function emitTableUsersUpdated(io, payload) {
  if (!io || typeof io.emit !== 'function') return;
  const tid = payload && payload.tableId != null ? payload.tableId : '';
  if (!tid) return;
  const users = payload && Array.isArray(payload.users) ? payload.users : [];
  const count =
    payload && payload.count != null
      ? Number(payload.count)
      : users.filter(function (u) {
          return u && u.connected !== false;
        }).length;
  io.emit('table_users_updated', {
    tableId: toWireTableId(tid),
    users,
    count: Number.isFinite(count) ? count : users.length,
  });
}

module.exports = { emitTableUpdate, emitCustomerCart, emitTableUsersUpdated };
