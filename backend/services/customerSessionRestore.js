/**
 * استعادة جلسة الزبون — مصدر الحقيقة عند cold start (خاصةً iOS Safari).
 */
const { getOrders } = require('../data/store');
const customerPersistentSession = require('./customerPersistentSession');
const tableCustomerResume = require('./tableCustomerResume');
const { pickOpenOrderForTable } = require('./customerTableOpenOrder');
const iosKitchenRecoverySession = require('./iosKitchenRecoverySession');
const customerDeviceSession = require('./customerDeviceSession');

function normId(v) {
  return String(v != null ? v : '').trim();
}

function tableIdFromOrderId(orderId) {
  const oid = normId(orderId);
  if (!oid) return '';
  const m = oid.match(/^T(\d+)-/i);
  if (!m || !m[1]) return '';
  return String(Number(m[1]));
}

function findOpenOrderById(tableId, orderId) {
  const tid = normId(tableId);
  const oid = normId(orderId);
  if (!tid || !oid) return null;
  const orders = getOrders();
  const o = orders.find((x) => x && String(x.id) === oid);
  if (!o || o.closed === true || normId(o.tableId) !== tid) return null;
  return o;
}

/**
 * @param {{ customerId?: string, peerSessionId?: string, sessionId?: string, tableId?: string, activeOrderId?: string, orderId?: string, iosRecoveryToken?: string, deviceId?: string }}
 */
function restoreCustomerSession(opts) {
  opts = opts || {};
  let usedDeviceId = '';
  const freshScan = opts.freshScan === true;
  /**
   * انتهاء جلسة الجهاز/توكن iOS «غير قاتل»: لا نُرجع welcome فوراً، بل نتابع لمحاولة
   * استعادة الطلب المفتوح (peer/cookie/order). الطلب المفتوح له الأولوية المطلقة.
   * نُبقي السبب لإرجاعه فقط إذا لم يُعثر على أي طلب مفتوح في النهاية.
   */
  let softDenyReason = '';
  const deviceId = normId(opts && opts.deviceId);
  const hasRecoveryHints = Boolean(
    normId(opts && opts.customerId) ||
      normId(opts && opts.peerSessionId) ||
      normId(opts && opts.sessionId) ||
      normId(opts && opts.activeOrderId) ||
      normId(opts && opts.orderId) ||
      normId(opts && opts.iosRecoveryToken),
  );
  if (deviceId && (!freshScan || hasRecoveryHints)) {
    const aug = customerDeviceSession.getRestoreAugment(deviceId, opts.tableId);
    if (aug === false) {
      softDenyReason = softDenyReason || 'device_session_expired';
    } else if (aug && typeof aug === 'object') {
      usedDeviceId = deviceId;
      opts = Object.assign({}, opts, aug);
      try {
        customerDeviceSession.onSuccessfulRestore(deviceId);
      } catch (_) {}
    }
    if (opts && opts.deviceId != null) delete opts.deviceId;
  }

  let usedIosRecoveryToken = '';
  let iosTok = normId(opts && opts.iosRecoveryToken);
  if (iosTok) {
    const aug = iosKitchenRecoverySession.getValidatedAugmentForRestore(iosTok);
    if (aug === false) {
      softDenyReason = softDenyReason || 'ios_recovery_invalid';
    } else if (aug && typeof aug === 'object') {
      usedIosRecoveryToken = iosTok;
      opts = Object.assign({}, opts, aug);
    }
    iosTok = '';
    if (opts && opts.iosRecoveryToken != null) delete opts.iosRecoveryToken;
  }

  let tableId = normId(opts && opts.tableId);
  const customerId = normId(opts && opts.customerId);
  const peerSessionId = normId(
    (opts && opts.peerSessionId) || (opts && opts.sessionId)
  );
  const activeOrderId = normId(
    (opts && opts.activeOrderId) || (opts && opts.orderId)
  );

  if (!tableId && activeOrderId) {
    tableId = tableIdFromOrderId(activeOrderId);
  }

  if (!tableId) {
    return { ok: false, target: 'welcome', reason: 'missing_table' };
  }

  function menuFromOrder(order, reason, extra) {
    const peer = normId(order.customerSessionId);
    const name = order.customerName != null ? String(order.customerName).trim() : '';
    let cid = customerId;
    let reg = null;
    if (peer) {
      reg = customerPersistentSession.registerSession({
        peerSessionId: peer,
        customerName: name,
        tableId,
        activeOrderId: String(order.id),
        customerId: cid || undefined,
      });
      if (reg && reg.session) cid = reg.session.customerId;
    }
    return {
      ok: true,
      target: 'menu',
      route: 'menu',
      customerId: cid || (reg && reg.session && reg.session.customerId) || '',
      peerSessionId: peer,
      sessionId: peer,
      customerName: name || (reg && reg.session && reg.session.customerName) || '',
      tableId,
      activeOrderId: String(order.id),
      orderId: String(order.id),
      status: 'active',
      reason: reason || 'table_open_order',
      ...(extra || {}),
    };
  }

  if (customerId || peerSessionId || activeOrderId) {
    const validated = customerPersistentSession.validateSession({
      customerId,
      peerSessionId,
      tableId,
      activeOrderId,
    });
    if (validated.valid) {
      const out = {
        ok: true,
        target: 'menu',
        route: 'menu',
        customerId: validated.customerId,
        peerSessionId: validated.peerSessionId,
        sessionId: validated.peerSessionId,
        customerName: validated.customerName,
        tableId: validated.tableId,
        activeOrderId: validated.activeOrderId,
        orderId: validated.activeOrderId,
        status: 'active',
        reason: usedDeviceId ? 'device_session' : 'persistent_session',
        deviceId: usedDeviceId || undefined,
      };
      if (usedIosRecoveryToken) {
        try {
          iosKitchenRecoverySession.onSuccessfulRestore(usedIosRecoveryToken);
        } catch (_) {}
      }
      return out;
    }
  }

  if (activeOrderId) {
    const order = findOpenOrderById(tableId, activeOrderId);
    if (order) {
      if (peerSessionId && normId(order.customerSessionId) && normId(order.customerSessionId) !== peerSessionId) {
        return { ok: false, target: 'welcome', reason: 'peer_session_mismatch' };
      }
      const out = menuFromOrder(order, 'open_order_restore');
      if (usedIosRecoveryToken && out && out.ok) {
        try {
          iosKitchenRecoverySession.onSuccessfulRestore(usedIosRecoveryToken);
        } catch (_) {}
      }
      return out;
    }
    const closed = getOrders().find((x) => x && String(x.id) === activeOrderId);
    if (closed && closed.closed === true) {
      return { ok: false, target: 'welcome', reason: 'order_closed' };
    }
  }

  if (peerSessionId) {
    const open = customerPersistentSession.findOpenOrderForPeer(tableId, peerSessionId);
    if (open) {
      const out = menuFromOrder(open, 'peer_open_order');
      if (usedIosRecoveryToken && out && out.ok) {
        try {
          iosKitchenRecoverySession.onSuccessfulRestore(usedIosRecoveryToken);
        } catch (_) {}
      }
      return out;
    }
  }

  if (peerSessionId) {
    const pickedLate = pickOpenOrderForTable(tableId, peerSessionId);
    if (pickedLate) {
      const out = menuFromOrder(pickedLate, 'peer_open_order_fallback');
      if (usedIosRecoveryToken && out && out.ok) {
        try {
          iosKitchenRecoverySession.onSuccessfulRestore(usedIosRecoveryToken);
        } catch (_) {}
      }
      return out;
    }
  }

  const resume = tableCustomerResume.evaluateResume({
    tableId,
    orderId: activeOrderId,
    customerSessionId: peerSessionId,
    customerId,
  });

  if (resume.target === 'menu' || resume.canResume === true) {
    const out = {
      ok: true,
      target: 'menu',
      route: 'menu',
      customerId: resume.customerId || customerId,
      peerSessionId: resume.peerSessionId || peerSessionId,
      sessionId: resume.peerSessionId || peerSessionId,
      customerName: resume.customerName || '',
      tableId,
      activeOrderId: resume.orderId || activeOrderId,
      orderId: resume.orderId || activeOrderId,
      status: 'active',
      reason: usedDeviceId ? 'device_session' : resume.reason || 'resume_check',
      deviceId: usedDeviceId || undefined,
    };
    if (usedIosRecoveryToken) {
      try {
        iosKitchenRecoverySession.onSuccessfulRestore(usedIosRecoveryToken);
      } catch (_) {}
    }
    return out;
  }

  return {
    ok: false,
    target: 'welcome',
    reason: softDenyReason || resume.reason || 'cannot_restore',
  };
}

module.exports = {
  restoreCustomerSession,
};
