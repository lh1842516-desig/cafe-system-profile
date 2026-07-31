/**
 * بث تغييرات حالة الطاولة لجميع عملاء واجهة الزبون (Socket.io)
 * الحمولة: { tableId: number|string, status: 'available'|'inUse'|'occupied', sessionId? }
 */
const { tableRoomName } = require('./tableRoomHelper');

function toWireTableId(tableId) {
  const s = String(tableId != null ? tableId : '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && String(n) === s) return n;
  return s;
}

function emitTableUpdate(io, payload, cafeId) {
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
  const cid = cafeId || payload.cafeId || require('../lib/cafeContext').getDefaultCafeId();
  if (cid) {
    io.to('cafe-' + cid + '-staff').emit('table_update', msg);
    const room = tableRoomName(payload.tableId, cid);
    if (room) {
      io.to(room).emit('table_update', msg);
    }
  } else {
    io.emit('table_update', msg);
  }
}

/** سلة زبون واحد — للجهاز صاحب الجلسة فقط */
function emitCustomerCart(io, payload, cafeId) {
  if (!io || typeof io.emit !== 'function') return;
  const tid = payload && payload.tableId != null ? payload.tableId : '';
  const sessionId = payload && payload.sessionId != null ? String(payload.sessionId).trim() : '';
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (!tid || !sessionId) return;
  const cid = cafeId || payload.cafeId || require('../lib/cafeContext').getDefaultCafeId();
  const room = tableRoomName(tid, cid);
  if (room) {
    io.to(room).emit('customer_cart_updated', {
      tableId: toWireTableId(tid),
      sessionId,
      items,
    });
  } else {
    io.emit('customer_cart_updated', {
      tableId: toWireTableId(tid),
      sessionId,
      items,
    });
  }
}

/** قائمة المتصلين بالطاولة + العدد */
function emitTableUsersUpdated(io, payload, cafeId) {
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
  const cid = cafeId || payload.cafeId || require('../lib/cafeContext').getDefaultCafeId();
  const room = tableRoomName(tid, cid);
  if (room) {
    io.to(room).emit('table_users_updated', {
      tableId: toWireTableId(tid),
      users,
      count: Number.isFinite(count) ? count : users.length,
    });
  } else {
    io.emit('table_users_updated', {
      tableId: toWireTableId(tid),
      users,
      count: Number.isFinite(count) ? count : users.length,
    });
  }
}

module.exports = { emitTableUpdate, emitCustomerCart, emitTableUsersUpdated };
