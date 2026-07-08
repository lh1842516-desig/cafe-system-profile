/**
 * إرسال طلبات زبائن الطاولة — مع دعم إرسال الجاهزين (ready) مع المُرسل.
 */
const {
  getOrders,
  saveOrders,
  getNextOrderSequence,
  ensureOrderSequenceAtLeast,
} = require('../data/store');
const till = require('../data/till');
const tableCustomerSessions = require('./tableCustomerSessions');
const tableCustomerCart = require('./tableCustomerCart');
const tableSessions = require('./tableSessions');
const { buildOrderItemsFromRows } = require('./orderItemBuilder');
const { emitTableUpdate, emitTableUsersUpdated, emitCustomerCart } = require('./tableRealtime');
const tableCustomerCoordination = require('./tableCustomerCoordination');
const tableCustomerKitchenUserSync = require('./tableCustomerKitchenUserSync');
const customerPersistentSession = require('./customerPersistentSession');
const customerDeviceSession = require('./customerDeviceSession');
const kitchenCashierApproval = require('./kitchenCashierApproval');
const tableBillRequestService = require('./tableBillRequestService');

/** تسلسل إرسال المطبخ لكل طاولة — يمنع طلبين منفصلين عند الضغط المتزامن */
const tableSendChains = new Map();

function runSerializedTableSend(tableId, work) {
  const key = String(tableId || '').trim();
  if (!key) return Promise.resolve().then(work);
  const prev = tableSendChains.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => work());
  tableSendChains.set(
    key,
    next.catch(() => {})
  );
  return next;
}

/** زبائن «جاهز» بسلة غير فارغة — متصلون أو منقطعون (بعد ضغط انتظر) */
function listReadyBundlePeers(tableId, exceptSessionId) {
  const tid = String(tableId || '').trim();
  const except = String(exceptSessionId || '').trim();
  const peers = [];
  tableCustomerSessions.listReadyUsersExcept(tid, except).forEach(function (u) {
    if (!u || tableCustomerSessions.isKitchenPipelineStatus(u.status)) return;
    const cart = tableCustomerCart.getCartSnapshot(tid, u.sessionId);
    try {
      const peerItems = buildOrderItemsFromRows(cart);
      if (peerItems.length) {
        peers.push({
          sessionId: u.sessionId,
          customerName: u.customerName,
          items: peerItems,
        });
      }
    } catch (_) {}
  });
  return peers;
}

/** متصلون ما زالوا يختارون — يمنع الإرسال المشترك التلقائي */
function hasConnectedChoosingPeers(tableId, exceptSessionId) {
  const except = String(exceptSessionId || '').trim();
  const choosing = tableCustomerSessions.STATUS.CHOOSING;
  return tableCustomerSessions.listConnectedPublicUsers(tableId).some(function (u) {
    return (
      u &&
      String(u.sessionId) !== except &&
      String(u.status || '').toLowerCase() === choosing
    );
  });
}

function allocateOrderId(tableIdStr, orders) {
  const session = till.getActiveSessionMeta();
  const openDate = session.openDate;
  let seq = getNextOrderSequence(openDate);
  let orderId = 'T' + tableIdStr + '-' + String(seq).padStart(3, '0');
  while (orders.some((o) => o.id === orderId)) {
    seq += 1;
    orderId = 'T' + tableIdStr + '-' + String(seq).padStart(3, '0');
  }
  ensureOrderSequenceAtLeast(openDate, seq);
  return orderId;
}

function createOrderRecord(tableIdStr, items, customerName, customerSessionId, extras) {
  const session = till.getActiveSessionMeta();
  const orders = getOrders();
  const orderId = allocateOrderId(tableIdStr, orders);
  const nameTrim = customerName != null ? String(customerName).trim().slice(0, 30) : '';
  const newOrder = {
    id: orderId,
    tableId: tableIdStr,
    orderType: 'DINE_IN',
    items,
    createdAt: new Date().toISOString(),
    open_date: session.openDate,
    cash_session_id: session.sessionId,
    closed: false,
    tillOpenedAt: session.openedAt || null,
  };
  if (nameTrim) newOrder.customerName = nameTrim;
  if (customerSessionId) newOrder.customerSessionId = String(customerSessionId).trim();
  const ex = extras && typeof extras === 'object' ? extras : {};
  if (ex.kitchenBatchId) newOrder.kitchenBatchId = String(ex.kitchenBatchId);
  if (ex.bundledCustomerNames) newOrder.bundledCustomerNames = ex.bundledCustomerNames;
  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
}

function emitOrderCreated(io, order, tableIdStr, reason) {
  if (!io || !order) return;
  if (kitchenCashierApproval.shouldHoldCustomerOrder(order)) {
    kitchenCashierApproval.holdCustomerOrderForCashier(io, order, reason || 'pending-cashier-approval');
    return;
  }
  kitchenCashierApproval.emitFullKitchenRelease(io, order, reason || 'new-order');
}

function finalizeCustomerAfterSend(tableId, sessionId, io) {
  tableCustomerCoordination.afterKitchenSend(tableId, sessionId);
  tableCustomerCart.applyMutations(tableId, sessionId, [{ op: 'clearAll' }]);
  if (io) {
    emitCustomerCart(io, { tableId, sessionId, items: [] });
  }
}

function emitUsers(tableId, io) {
  const users = tableCustomerSessions.listConnectedPublicUsers(tableId);
  const count = tableCustomerSessions.connectedCount(tableId);
  emitTableUsersUpdated(io, { tableId, users, count });
}

/**
 * @param {{ tableId: string, senderSessionId: string, senderItems: object[], bundleReadyPeers?: boolean, io?: object }}
 */
function sendToKitchenImpl(opts) {
  const tableId = String(opts.tableId || '').trim();
  const senderSessionId = String(opts.senderSessionId || '').trim();
  const bundleReadyPeers = !!opts.bundleReadyPeers;
  const sendAlone = !!(opts && opts.sendAlone);
  const io = opts.io || null;

  if (!tableId || !senderSessionId) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    tableBillRequestService.assertCanOrder(tableId);
  } catch (err) {
    return {
      ok: false,
      code: tableBillRequestService.BILL_BLOCKED_CODE,
      message: err.message,
    };
  }

  const session = till.getActiveSessionMeta();
  if (!session || !session.openDate) {
    return { ok: false, code: 'till_closed' };
  }

  const sender = tableCustomerSessions.findUser(tableId, senderSessionId);
  if (!sender) {
    return { ok: false, code: 'sender_not_found' };
  }

  const jobs = [];
  const seenSessions = new Set();

  try {
    const senderLines = buildOrderItemsFromRows(opts.senderItems || []);
    if (senderLines.length) {
      jobs.push({
        sessionId: senderSessionId,
        customerName: sender.customerName,
        items: senderLines,
      });
      seenSessions.add(senderSessionId);
    }
  } catch (err) {
    return { ok: false, code: 'invalid_items', message: err.message };
  }

  let includeReadyBundle = bundleReadyPeers;
  if (!sendAlone && !includeReadyBundle && !hasConnectedChoosingPeers(tableId, senderSessionId)) {
    if (listReadyBundlePeers(tableId, senderSessionId).length > 0) {
      includeReadyBundle = true;
    }
  }

  if (includeReadyBundle) {
    listReadyBundlePeers(tableId, senderSessionId).forEach((peer) => {
      if (seenSessions.has(peer.sessionId)) return;
      seenSessions.add(peer.sessionId);
      jobs.push({
        sessionId: peer.sessionId,
        customerName: peer.customerName,
        items: peer.items,
      });
    });
  }

  if (!jobs.length) {
    return { ok: false, code: 'empty_cart' };
  }

  const tableIdStr = String(tableId);
  const deviceId = String((opts && opts.deviceId) || '').trim();
  const placements = [];
  const mergeKitchenReceipt = includeReadyBundle && jobs.length > 1;
  const kitchenBatchId = mergeKitchenReceipt
    ? 'kb-' + tableIdStr + '-' + Date.now().toString(36)
    : null;
  const bundledNames = mergeKitchenReceipt
    ? jobs
        .map((j) => (j.customerName != null ? String(j.customerName).trim() : ''))
        .filter(Boolean)
    : [];

  const batchExtras = mergeKitchenReceipt
    ? { kitchenBatchId, bundledCustomerNames: bundledNames }
    : null;

  jobs.forEach((job) => {
    const itemsForOrder = (job.items || []).map((it) =>
      mergeKitchenReceipt
        ? Object.assign({}, it, {
            orderedByName:
              job.customerName != null ? String(job.customerName).trim() : undefined,
          })
        : it
    );
    const order = createOrderRecord(
      tableIdStr,
      itemsForOrder,
      job.customerName,
      job.sessionId,
      batchExtras
    );
    finalizeCustomerAfterSend(tableId, job.sessionId, io);
    placements.push({
      sessionId: job.sessionId,
      orderId: order.id,
      customerName: job.customerName,
    });
    let reg = null;
    try {
      reg = customerPersistentSession.registerSession({
        peerSessionId: job.sessionId,
        customerName: job.customerName,
        tableId: tableIdStr,
        activeOrderId: order.id,
        customerId:
          opts && opts.customerIdByPeer && opts.customerIdByPeer[job.sessionId]
            ? opts.customerIdByPeer[job.sessionId]
            : undefined,
      });
      if (reg && reg.ok && reg.session) {
        placements[placements.length - 1].customerId = reg.session.customerId;
      }
    } catch (_) {
      reg = null;
    }
    if (deviceId && job.sessionId === senderSessionId && reg && reg.ok && reg.session) {
      try {
        customerDeviceSession.registerFromKitchen({
          deviceId,
          customerId: reg.session.customerId,
          peerSessionId: job.sessionId,
          tableId: tableIdStr,
          activeOrderId: String(order.id),
          customerName: job.customerName,
        });
      } catch (_) {}
    }
    emitOrderCreated(
      io,
      order,
      tableIdStr,
      mergeKitchenReceipt ? 'customer-send-bundle' : 'customer-send'
    );
  });

  try {
    tableSessions.releaseByTableId(tableIdStr);
  } catch (_) {}
  emitTableUpdate(io, { tableId: tableIdStr, status: 'occupied', sessionId: null });

  try {
    const synced = new Set();
    placements.forEach(function (p) {
      const oid = p && p.orderId != null ? String(p.orderId).trim() : '';
      if (!oid || synced.has(oid)) return;
      synced.add(oid);
      const held = kitchenCashierApproval.isOrderHeld(oid);
      tableCustomerKitchenUserSync.syncUsersForKitchenOrder(io, oid, held ? 'held' : 'new');
    });
  } catch (syncErr) {
    console.error('kitchen send user status sync', syncErr);
    emitUsers(tableId, io);
  }

  if (io) {
    const placedPayload = {
      tableId: tableIdStr,
      placements,
      kitchenBatchId: kitchenBatchId || null,
    };
    if (opts && opts.autoSendPeerLeft) {
      placedPayload.autoSendPeerLeft = true;
    }
    io.to('table-' + tableIdStr).emit('customer_orders_placed', placedPayload);
  }

  const mine = placements.find((p) => p.sessionId === senderSessionId);

  return {
    ok: true,
    placements,
    order: mine ? getOrders().find((o) => o.id === mine.orderId) : placements[0] ? getOrders().find((o) => o.id === placements[0].orderId) : null,
    myOrderId: mine ? mine.orderId : null,
  };
}

function sendToKitchen(opts) {
  const tableId = String((opts && opts.tableId) || '').trim();
  return runSerializedTableSend(tableId, () => Promise.resolve(sendToKitchenImpl(opts)));
}

function userHasSendableCart(tableId, sessionId) {
  try {
    const cart = tableCustomerCart.getCartSnapshot(tableId, sessionId);
    return buildOrderItemsFromRows(cart).length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * عند مغادرة/انقطاع رفيق: إن بقي اثنان+ جاهزين بسلة — إرسال تلقائي للمطبخ.
 * يُستدعى بعد انقطاع السوكت أو POST /customer/leave.
 * @param {{ connectedBefore?: number, minConnectedBefore?: number }} [opts]
 */
function tryAutoSendReadyPeersAfterDepart(tableId, departedSessionId, io, opts) {
  const tid = String(tableId || '').trim();
  const departed = String(departedSessionId || '').trim();
  if (!tid || !departed) return Promise.resolve({ sent: false, reason: 'invalid' });

  const minBefore =
    opts && opts.minConnectedBefore != null ? Number(opts.minConnectedBefore) : 3;
  const connectedBefore =
    opts && opts.connectedBefore != null ? Number(opts.connectedBefore) : NaN;
  if (!Number.isFinite(connectedBefore) || connectedBefore < minBefore) {
    return Promise.resolve({ sent: false, reason: 'not_enough_peers' });
  }

  const users = tableCustomerSessions.listConnectedPublicUsers(tid);
  if (users.length < 2) {
    return Promise.resolve({ sent: false, reason: 'few_remaining' });
  }

  const readyStatus = tableCustomerSessions.STATUS.READY;
  const allReady = users.every(function (u) {
    return u && String(u.status || '').toLowerCase() === readyStatus;
  });
  if (!allReady) {
    return Promise.resolve({ sent: false, reason: 'not_all_ready' });
  }

  const withCart = users.filter(function (u) {
    return u && userHasSendableCart(tid, u.sessionId);
  });
  if (withCart.length < 2) {
    return Promise.resolve({ sent: false, reason: 'insufficient_carts' });
  }

  const sender = withCart[0];
  let senderItems = [];
  try {
    senderItems = buildOrderItemsFromRows(tableCustomerCart.getCartSnapshot(tid, sender.sessionId));
  } catch (_) {
    return Promise.resolve({ sent: false, reason: 'sender_cart' });
  }
  if (!senderItems.length) {
    return Promise.resolve({ sent: false, reason: 'empty_sender' });
  }

  return sendToKitchen({
    tableId: tid,
    senderSessionId: sender.sessionId,
    senderItems,
    bundleReadyPeers: true,
    autoSendPeerLeft: true,
    io,
  }).then(function (result) {
    if (result && result.ok) return { sent: true, result };
    return { sent: false, reason: (result && result.code) || 'send_failed', result };
  });
}

module.exports = {
  sendToKitchen,
  sendToKitchenImpl,
  tryAutoSendReadyPeersAfterDepart,
};
