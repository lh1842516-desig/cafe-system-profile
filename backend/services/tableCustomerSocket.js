/**
 * سوكت الزبائن: حضور الطاولة حسب sessionId + تنظيف عند الانقطاع.
 */
const presenceLifecycle = require('./tablePresenceLifecycle');
const tableCustomerSessions = require('./tableCustomerSessions');
const tableCustomerKitchenSend = require('./tableCustomerKitchenSend');
const tableCustomerKitchenUserSync = require('./tableCustomerKitchenUserSync');
const { emitTableUsersUpdated } = require('./tableRealtime');

/** مهلة الخلفية (app switch) قبل إزالة الاسم من قائمة المتصلين */
const DISCONNECT_GRACE_MS = 60000;

/** @type {Map<string, NodeJS.Timeout>} */
const disconnectTimers = new Map();

/** @type {Map<string, number>} */
const socketRefCounts = new Map();

function pairKey(tableId, sessionId) {
  return `${String(tableId || '').trim()}\t${String(sessionId || '').trim()}`;
}

function cancelDisconnectGrace(tableId, sessionId) {
  const k = pairKey(tableId, sessionId);
  const t = disconnectTimers.get(k);
  if (t) {
    try {
      clearTimeout(t);
    } catch (_) {}
    disconnectTimers.delete(k);
  }
}

function normalizeTableId(tableId) {
  const s = String(tableId || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

function tableRoomName(tableId) {
  const t = normalizeTableId(tableId);
  if (!t) return '';
  return 'table-' + t;
}

function joinTableRoom(socket, tableId) {
  const room = tableRoomName(tableId);
  if (!room || !socket) return;
  try {
    socket.join(room);
    socket.data.cfTableRoom = room;
  } catch (_) {}
}

function bindSocketPresenceKeys(socket, tableId, sessionId) {
  const t = normalizeTableId(tableId);
  const s = String(sessionId || '').trim();
  if (!t || !s) return false;
  socket.data.cfTableId = t;
  socket.data.cfSessionId = s;
  socket.data.cfPresenceKey = pairKey(t, s);
  joinTableRoom(socket, t);
  return true;
}

function bumpPresenceRefOnce(socket) {
  if (socket.data.cfPresenceRefBumped) return;
  const pk = socket.data.cfPresenceKey;
  if (!pk) return;
  socket.data.cfPresenceRefBumped = true;
  socketRefCounts.set(pk, (socketRefCounts.get(pk) || 0) + 1);
}

function broadcastUsers(io, tableId) {
  const tid = normalizeTableId(tableId);
  if (!tid) return;
  let users = tableCustomerSessions.listConnectedPublicUsers(tid);
  try {
    users = tableCustomerKitchenUserSync.enrichUsersFromKitchenOrders(tid, users);
  } catch (_) {}
  const count = tableCustomerSessions.connectedCount(tid);
  emitTableUsersUpdated(io, { tableId: tid, users, count });
}

const TABLE_EMOJI_ALLOWED = new Set(['⏱️', '⏰', '🥱', '😴', '😤', '✅', '😋']);

function normalizeIncomingTableEmoji(raw, emojiId) {
  const idKey = String(emojiId == null ? '' : emojiId).trim().toLowerCase();
  const byId = {
    hungry: '😋',
    sleep: '😴',
    hurry: '⏰',
    peer: '😤',
    ready: '✅',
  };
  if (idKey && byId[idKey]) return byId[idKey];

  const key = String(raw == null ? '' : raw).trim();
  if (!key) return '';
  const aliases = {
    '⏱': '⏱️',
    timer: '⏰',
    hurry: '⏰',
    yawn: '😴',
    sleep: '😴',
    angry: '😤',
    ready: '✅',
    hungry: '😋',
  };
  const mapped = aliases[key] || key;
  return TABLE_EMOJI_ALLOWED.has(mapped) ? mapped : '';
}

async function emitTableEmojiReaction(io, tableId, payload) {
  if (!io) return;
  const tid = normalizeTableId(tableId);
  const sessionId =
    payload && payload.sessionId != null ? String(payload.sessionId).trim() : '';
  const emoji = normalizeIncomingTableEmoji(payload && payload.emoji, payload && payload.emojiId);
  if (!tid || !sessionId || !emoji) return;
  const room = tableRoomName(tid);
  if (!room) return;
  const event = {
    tableId: tid,
    sessionId,
    emoji,
    at: Date.now(),
  };
  io.to(room).emit('table_emoji_reaction', event);
  try {
    const sockets = await io.fetchSockets();
    const roomMembers = new Set();
    try {
      const inRoom = await io.in(room).fetchSockets();
      inRoom.forEach((s) => roomMembers.add(s.id));
    } catch (_) {}
    sockets.forEach((s) => {
      const st = normalizeTableId(s.data && s.data.cfTableId);
      if (st === tid && !roomMembers.has(s.id)) {
        s.emit('table_emoji_reaction', event);
      }
    });
  } catch (_) {}
}

function emitCaptainRequest(io, payload) {
  if (!io) return;
  const tableId = payload && payload.tableId != null ? String(payload.tableId).trim() : '';
  if (!tableId) return;
  const tableLabel =
    payload && payload.tableLabel != null ? String(payload.tableLabel).trim() : tableId;
  const message =
    payload && payload.message != null && String(payload.message).trim()
      ? String(payload.message).trim()
      : `طاولة ${tableLabel} تطلب حضور الكابتن`;
  io.emit('captain-request', {
    tableId,
    tableLabel,
    message,
    sessionId: payload && payload.sessionId != null ? String(payload.sessionId).trim() : '',
    at: Date.now(),
  });
}

function emitBillRequest(io, payload) {
  if (!io) return;
  const tableId = payload && payload.tableId != null ? String(payload.tableId).trim() : '';
  if (!tableId) return;
  const tableLabel =
    payload && payload.tableLabel != null ? String(payload.tableLabel).trim() : tableId;
  const cashierMessage =
    payload && payload.cashierMessage != null && String(payload.cashierMessage).trim()
      ? String(payload.cashierMessage).trim()
      : `طاولة رقم ${tableLabel} تطلب الحساب`;
  const captainMessage =
    payload && payload.captainMessage != null && String(payload.captainMessage).trim()
      ? String(payload.captainMessage).trim()
      : `طاولة رقم ${tableLabel} بانتظار إنهاء الحساب`;
  const at = payload && payload.at != null ? payload.at : Date.now();
  const sessionId =
    payload && payload.sessionId != null ? String(payload.sessionId).trim() : '';
  const isReminder = !!(payload && payload.isReminder);
  io.emit('bill-request', {
    tableId,
    tableLabel,
    sessionId,
    at,
    isReminder,
    cashierMessage,
    captainMessage,
  });
  const room = tableRoomName(tableId);
  if (room) {
    io.to(room).emit('bill-request-updated', {
      tableId,
      requested: true,
      tableLabel,
      statusLabel: 'بانتظار الحساب',
    });
  }
}

function emitBillRequestCleared(io, tableId) {
  if (!io) return;
  const tid = normalizeTableId(tableId);
  if (!tid) return;
  const room = tableRoomName(tid);
  if (room) {
    io.to(room).emit('bill-request-updated', { tableId: tid, requested: false });
  }
}

function runLeaveAfterGrace(io, tableId, sessionId) {
  const k = pairKey(tableId, sessionId);
  disconnectTimers.delete(k);
  if ((socketRefCounts.get(k) || 0) > 0) return;

  const user = tableCustomerSessions.findUser(tableId, sessionId);
  const ready = tableCustomerSessions.STATUS.READY;
  if (
    user &&
    String(user.status || '').toLowerCase() === ready &&
    tableCustomerKitchenSend.userHasSendableCart(tableId, sessionId)
  ) {
    return;
  }

  const remaining = tableCustomerSessions.listConnectedPublicUsers(tableId).length;
  const connectedBefore = remaining + 1;
  tableCustomerSessions.leaveTable(tableId, sessionId);
  broadcastUsers(io, tableId);
  tableCustomerKitchenSend
    .tryAutoSendReadyPeersAfterDepart(tableId, sessionId, io, { connectedBefore })
    .catch(function () {});
}

/**
 * @param {import('socket.io').Server} io
 */
function attachTableCustomerSocket(io) {
  io.use((socket, next) => {
    try {
      const q = socket.handshake && socket.handshake.query ? socket.handshake.query : {};
      const t = normalizeTableId(q.cf_table);
      const s = q.cf_session != null ? String(q.cf_session).trim() : '';
      if (t && s && bindSocketPresenceKeys(socket, t, s)) {
        joinTableRoom(socket, t);
        bumpPresenceRefOnce(socket);
        cancelDisconnectGrace(t, s);
        tableCustomerSessions.touchPresence(t, s, socket.id, true);
      }
    } catch (_) {}
    next();
  });

  io.on('connection', (socket) => {
    socket.on('customer_captain_request', (payload) => {
      emitCaptainRequest(io, payload || {});
    });

    socket.on('customer_bill_request', (payload) => {
      emitBillRequest(io, payload || {});
    });

    socket.on('customer_table_emoji', (payload) => {
      const tableId = normalizeTableId(payload && payload.tableId);
      const sessionId =
        payload && payload.sessionId != null ? String(payload.sessionId).trim() : '';
      if (!tableId || !sessionId) return;
      const socketTable = normalizeTableId(socket.data.cfTableId);
      if (socketTable && socketTable !== tableId) return;
      const emoji = normalizeIncomingTableEmoji(payload && payload.emoji, payload && payload.emojiId);
      if (!emoji) return;
      const user = tableCustomerSessions.findUser(tableId, sessionId);
      if (!user) return;
      bindSocketPresenceKeys(socket, tableId, sessionId);
      joinTableRoom(socket, tableId);
      emitTableEmojiReaction(io, tableId, { sessionId, emoji });
    });

    socket.on('customer_table_presence', (payload) => {
      const tableId = normalizeTableId(payload && payload.tableId);
      const sessionId =
        payload && payload.sessionId != null
          ? String(payload.sessionId).trim()
          : payload && payload.clientId != null
            ? String(payload.clientId).trim()
            : '';
      if (!tableId || !sessionId) return;
      const rawState =
        payload && payload.connectionState != null
          ? String(payload.connectionState).trim().toLowerCase()
          : 'active';
      const mapped =
        rawState === 'background' || rawState === 'hidden' || rawState === 'paused' ? 'background' : 'active';
      presenceLifecycle.setConnectionState(tableId, sessionId, mapped);

      bindSocketPresenceKeys(socket, tableId, sessionId);
      bumpPresenceRefOnce(socket);
      cancelDisconnectGrace(tableId, sessionId);
      tableCustomerSessions.touchPresence(tableId, sessionId, socket.id, true);
      broadcastUsers(io, tableId);
    });

    socket.on('disconnect', () => {
      if (!socket.data.cfPresenceRefBumped) return;
      const pk = socket.data.cfPresenceKey;
      const tableId = socket.data.cfTableId;
      const sessionId = socket.data.cfSessionId;
      if (!pk || !tableId || !sessionId) return;
      const cur = socketRefCounts.get(pk) || 0;
      const n = cur - 1;
      if (n > 0) {
        socketRefCounts.set(pk, n);
        return;
      }

      socketRefCounts.delete(pk);
      cancelDisconnectGrace(tableId, sessionId);

      const k = pairKey(tableId, sessionId);
      const inBackground = presenceLifecycle.isBackground(tableId, sessionId);
      const connectedBefore = tableCustomerSessions.connectedCount(tableId);

      function finishDepart() {
        disconnectTimers.delete(k);
        runLeaveAfterGrace(io, tableId, sessionId);
        tableCustomerKitchenSend
          .tryAutoSendReadyPeersAfterDepart(tableId, sessionId, io, { connectedBefore })
          .catch(function () {});
      }

      if (inBackground) {
        // app switch: يبقى الاسم ظاهراً ثم يُزال بعد دقيقة
        const timer = setTimeout(function () {
          presenceLifecycle.clearPair(tableId, sessionId);
          finishDepart();
        }, DISCONNECT_GRACE_MS);
        disconnectTimers.set(k, timer);
        return;
      }

      // إغلاق الصفحة / مسحها من مبدّل التطبيقات: إزالة فورية
      presenceLifecycle.clearPair(tableId, sessionId);
      finishDepart();
    });
  });
}

module.exports = {
  attachTableCustomerSocket,
  broadcastUsers,
  emitCaptainRequest,
  emitBillRequest,
  emitBillRequestCleared,
};
