/**
 * بث تحديثات المنيو عبر Socket.io
 */

function emitMenuUpdated(io, payload) {
  if (!io) return;
  io.emit('menu-updated', payload && typeof payload === 'object' ? payload : {});
}

module.exports = {
  emitMenuUpdated,
};
