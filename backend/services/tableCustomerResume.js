/**
 * قرار استئناف جلسة الزبون بعد إغلاق التبويب / العودة من الرابط المحفوظ.
 * — طلب مفتوح سابقاً → المنيو؛ peer بلا طلب لا يُنهي التقييم إن وُجدت جلسة حجز طاولة (تصفّح / F5 على المنيو).
 */
const { getOrders, getOrdersByTable, getOrdersBlockingTableClaim } = require('../data/store');
const tableSessions = require('./tableSessions');
const customerPersistentSession = require('./customerPersistentSession');
const { pickOpenOrderForTable } = require('./customerTableOpenOrder');

function findOpenOrderForCustomer(tableId, customerSessionId) {
  const tid = String(tableId || '').trim();
  const csid = String(customerSessionId || '').trim();
  if (!tid || !csid) return null;
  const orders = getOrders();
  for (let i = 0; i < orders.length; i += 1) {
    const o = orders[i];
    if (!o || o.closed === true) continue;
    if (String(o.tableId) !== tid) continue;
    if (o.customerSessionId == null) continue;
    if (String(o.customerSessionId).trim() !== csid) continue;
    return o;
  }
  return null;
}

/**
 * @param {{ tableId: string, orderId?: string, sessionId?: string, customerSessionId?: string, customerId?: string }}
 * @returns {{ canResume: boolean, target: 'menu'|'welcome', orderId?: string, reason?: string, customerId?: string, customerName?: string, peerSessionId?: string }}
 */
function evaluateResume(opts) {
  const tid = String((opts && opts.tableId) || '').trim();
  if (!tid) {
    return { canResume: false, target: 'welcome', reason: 'missing_table' };
  }

  const customerId = String((opts && opts.customerId) || '').trim();
  const peerHint = String((opts && opts.customerSessionId) || '').trim();
  const oidHintEarly = String((opts && opts.orderId) || '').trim();

  if (customerId || peerHint || oidHintEarly) {
    const validated = customerPersistentSession.validateSession({
      customerId,
      peerSessionId: peerHint,
      tableId: tid,
      activeOrderId: oidHintEarly,
    });
    if (validated.valid) {
      return {
        canResume: true,
        target: 'menu',
        orderId: validated.activeOrderId,
        customerId: validated.customerId,
        customerName: validated.customerName,
        peerSessionId: validated.peerSessionId,
        reason: 'persistent_session',
      };
    }
    const reason = validated.reason || 'invalid_persistent';
    const hardDeny =
      reason === 'order_closed_or_missing' ||
      reason === 'table_mismatch' ||
      reason === 'peer_session_mismatch';
    if (customerId && hardDeny) {
      return { canResume: false, target: 'welcome', reason };
    }
    /* customerId قديم/غير مسجّل — لا نرفض مباشرة؛ نجرّب orderId و peerSessionId (Safari يحتفظ بالكوكي) */
  }

  const oidHint = oidHintEarly;
  if (oidHint) {
    const orders = getOrders();
    const o = orders.find((x) => String(x.id) === oidHint);
    if (o && String(o.tableId) === tid && o.closed !== true) {
      if (
        peerHint &&
        o.customerSessionId != null &&
        String(o.customerSessionId).trim() !== peerHint
      ) {
        /* orderId من كوكي قديم لزبون آخر */
      } else {
      const row = {
        canResume: true,
        target: 'menu',
        orderId: String(o.id),
        reason: 'open_order_id',
      };
      if (o.customerSessionId != null && String(o.customerSessionId).trim()) {
        row.peerSessionId = String(o.customerSessionId).trim();
      }
      if (o.customerName != null && String(o.customerName).trim()) {
        row.customerName = String(o.customerName).trim();
      }
      return row;
      }
    }
    if (o && o.closed === true) {
      return { canResume: false, target: 'welcome', reason: 'order_closed' };
    }
  }

  const csid = String((opts && opts.customerSessionId) || '').trim();
  if (csid) {
    const open = findOpenOrderForCustomer(tid, csid);
    if (open) {
      const row = {
        canResume: true,
        target: 'menu',
        orderId: String(open.id),
        reason: 'peer_open_order',
      };
      if (open.customerName != null && String(open.customerName).trim()) {
        row.customerName = String(open.customerName).trim();
      }
      row.peerSessionId = csid;
      return row;
    }
    const blockingAfterPeer = getOrdersBlockingTableClaim(tid);
    if (blockingAfterPeer.length > 0) {
      return { canResume: false, target: 'welcome', reason: 'table_has_open_order' };
    }
    /* لا نُرجع no_order_sent هنا — نجرّب جلسة حجز الطاولة (sessionId) أدناه. */
  }

  const sid = String((opts && opts.sessionId) || '').trim();
  if (sid) {
    const s = tableSessions.getSessionById(sid);
    if (!s || String(s.tableId) !== tid) {
      return { canResume: false, target: 'welcome', reason: 'bad_session' };
    }
    const blocking = getOrdersBlockingTableClaim(tid);
    if (blocking.length > 0) {
      return { canResume: false, target: 'welcome', reason: 'table_has_open_order' };
    }
    const menuRow = { canResume: true, target: 'menu', reason: 'table_session' };
    if (csid) menuRow.peerSessionId = csid;
    return menuRow;
  }

  if (peerHint) {
    const picked = pickOpenOrderForTable(tid, peerHint);
    if (picked) {
      const row = {
        canResume: true,
        target: 'menu',
        orderId: String(picked.id),
        reason: 'peer_open_order',
      };
      if (picked.customerSessionId != null && String(picked.customerSessionId).trim()) {
        row.peerSessionId = String(picked.customerSessionId).trim();
      }
      if (picked.customerName != null && String(picked.customerName).trim()) {
        row.customerName = String(picked.customerName).trim();
      }
      return row;
    }
  }

  if (csid) {
    return { canResume: false, target: 'welcome', reason: 'no_order_sent' };
  }

  return { canResume: false, target: 'welcome', reason: 'need_session_or_order' };
}

module.exports = {
  evaluateResume,
  findOpenOrderForCustomer,
};
