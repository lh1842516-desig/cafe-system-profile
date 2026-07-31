/**
 * بث تحديثات المنيو عبر Socket.io مع عزل كامل لكل كافيه (Tenant Isolation)
 */

function emitMenuUpdated(io, payload, cafeId) {
  if (!io) return;
  const cid = cafeId || (payload && payload.cafeId);
  const data = payload && typeof payload === 'object' ? payload : {};
  if (cid) {
    io.to('cafe-' + cid + '-staff').emit('menu-updated', data);
    io.to('cafe-' + cid + '-customer').emit('menu-updated', data);
  } else {
    io.emit('menu-updated', data);
  }
}

module.exports = {
  emitMenuUpdated,
};
