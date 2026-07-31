/**
 * خدمة سجل جلسات طلبات اليوم — إنشاء واستعلام بعد إغلاق الحساب.
 */
const orderRepo = require('../repository/orderRepository');
const tillRepo = require('../repository/tillRepository');
const { orderBelongsToSession } = require('./cashSessionHelper');
const historyStore = require('../data/todaySessionHistory');

const ORDER_TYPE = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
  DELIVERY: 'DELIVERY',
};

function inferOrderType(order) {
  if (!order) return ORDER_TYPE.DINE_IN;
  const t = order.orderType;
  if (t === ORDER_TYPE.TAKEAWAY || t === ORDER_TYPE.DELIVERY) return t;
  const tid = String(order.tableId || '');
  if (tid === ORDER_TYPE.TAKEAWAY) return ORDER_TYPE.TAKEAWAY;
  if (tid === ORDER_TYPE.DELIVERY) return ORDER_TYPE.DELIVERY;
  return ORDER_TYPE.DINE_IN;
}

function orderLineTotal(order) {
  if (order.total != null && !Number.isNaN(Number(order.total))) return Number(order.total);
  return (order.items || []).reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0
  );
}

function snapshotOrder(cafeId, order, index) {
  const items = (order.items || []).map((it) => ({
    name: it.name != null ? String(it.name) : '',
    quantity: Number(it.quantity) || 1,
    price: Number(it.price) || 0,
    orderedByName:
      it.orderedByName != null && String(it.orderedByName).trim()
        ? String(it.orderedByName).trim()
        : undefined,
  }));
  return {
    orderId: order.id,
    displayOrderId: orderRepo.getOrderDisplayId(cafeId, order.id),
    orderIndex: index,
    createdAt: order.createdAt || null,
    closedAt: order.closedAt || null,
    total: orderLineTotal(order),
    items,
  };
}

async function getActiveTillSessionOrNull(cafeId) {
  const session = await tillRepo.getActiveSessionMeta(cafeId);
  if (!session || !session.openDate) return null;
  return session;
}

/** جلسة القاصة لعرض «طلبات اليوم» — مفتوحة أو آخر قاصة مُغلقة (نفس openedAt) */
async function getTillSessionMetaForTodayList(cafeId) {
  const active = await getActiveTillSessionOrNull(cafeId);
  if (active) return active;
  const t = await tillRepo.readCurrentTill(cafeId);
  if (!t || !t.openedAt) return null;
  const openDate = String(
    t.open_date || t.date || tillRepo.getOpenDateFromIso(t.openedAt) || ''
  ).trim();
  if (!openDate) return null;
  return {
    sessionId: String(t.openedAt),
    openDate,
    openedAt: String(t.openedAt),
    closedAt: t.closedAt ? String(t.closedAt) : null,
  };
}

async function requireActiveTillSession(cafeId) {
  const session = await getActiveTillSessionOrNull(cafeId);
  if (!session) {
    const err = new Error('لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.');
    err.status = 400;
    throw err;
  }
  return session;
}

/**
 * @param {string} cafeId
 * @param {{ tableId?: string, orderIds: string[], paymentMethod?: string }} payload
 */
async function createSessionFromClosedOrders(cafeId, payload) {
  const tillSession = await requireActiveTillSession(cafeId);
  const orderIds = Array.isArray(payload.orderIds)
    ? payload.orderIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!orderIds.length) {
    const err = new Error('لا توجد طلبات لإنشاء سجل الجلسة.');
    err.status = 400;
    throw err;
  }

  const idsKey = historyStore.orderIdsKey(orderIds);
  const existing = historyStore.findByOrderIdsKey(idsKey, tillSession.sessionId);
  if (existing) return existing;

  const payMethod = (payload.paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
  const allOrders = await orderRepo.getOrders(cafeId);
  const matched = orderIds.map((id) => allOrders.find((o) => String(o.id) === id)).filter(Boolean);

  if (matched.length !== orderIds.length) {
    const err = new Error('بعض الطلبات غير موجودة.');
    err.status = 404;
    throw err;
  }

  const notClosed = matched.filter((o) => o.closed !== true);
  if (notClosed.length) {
    const err = new Error('يجب إغلاق جميع الطلبات قبل إنشاء سجل اليوم.');
    err.status = 400;
    throw err;
  }

  const notInSession = matched.filter((o) => !orderBelongsToSession(o, tillSession));
  if (notInSession.length) {
    const err = new Error('بعض الطلبات خارج جلسة القاصة الحالية.');
    err.status = 400;
    throw err;
  }

  const orderType = inferOrderType(matched[0]);
  const tableId =
    orderType === ORDER_TYPE.DINE_IN
      ? String(payload.tableId != null ? payload.tableId : matched[0].tableId || '').trim()
      : String(matched[0].tableId || orderType);

  if (orderType === ORDER_TYPE.DINE_IN) {
    const badTable = matched.some((o) => String(o.tableId) !== tableId);
    if (badTable || !tableId) {
      const err = new Error('جميع الطلبات يجب أن تنتمي لنفس الطاولة.');
      err.status = 400;
      throw err;
    }
  }

  const methods = matched.map((o) => (o.paymentMethod || payMethod).toLowerCase());
  const uniqueMethods = [...new Set(methods)];
  const paymentMethod = uniqueMethods.length === 1 ? uniqueMethods[0] : payMethod;

  const record = buildSessionRecordFromOrders(
    cafeId,
    matched,
    tillSession,
    tableId,
    paymentMethod
  );
  if (!record) {
    const err = new Error('تعذّر إنشاء سجل الجلسة.');
    err.status = 500;
    throw err;
  }
  record.orderIdsKey = idsKey;
  return historyStore.appendSession(record);
}

/** ثانية الإغلاق — تجميع طلبات أُغلقت معاً في دفعة واحدة */
function closedAtSecondBucket(iso) {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  return String(Math.floor(t / 1000));
}

function groupKeyForClosedOrder(order) {
  const orderType = inferOrderType(order);
  const tableId = String(order.tableId != null ? order.tableId : '');
  const pay = (order.paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
  const bucket = closedAtSecondBucket(order.closedAt);
  if (orderType === ORDER_TYPE.DINE_IN) {
    return 'D:' + tableId + ':' + bucket + ':' + pay;
  }
  return 'T:' + tableId + ':' + order.id + ':' + bucket + ':' + pay;
}

function buildSessionRecordFromOrders(cafeId, matched, tillSession, tableIdHint, paymentMethodHint) {
  if (!matched.length) return null;
  const payMethod =
    (paymentMethodHint || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
  const orderType = inferOrderType(matched[0]);
  const tableId =
    orderType === ORDER_TYPE.DINE_IN
      ? String(tableIdHint != null ? tableIdHint : matched[0].tableId || '').trim()
      : String(matched[0].tableId || orderType);

  const methods = matched.map((o) => (o.paymentMethod || payMethod).toLowerCase());
  const uniqueMethods = [...new Set(methods)];
  const paymentMethod = uniqueMethods.length === 1 ? uniqueMethods[0] : payMethod;

  const sorted = matched.slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  const orderIds = sorted.map((o) => String(o.id));
  const orderSnapshots = sorted.map((o, i) => snapshotOrder(cafeId, o, i));
  const firstOrderAt = sorted[0] && sorted[0].createdAt ? sorted[0].createdAt : null;
  const paymentAt = sorted.reduce((max, o) => {
    const t = o.closedAt || o.createdAt;
    if (!t) return max;
    if (!max || new Date(t) > new Date(max)) return t;
    return max;
  }, null);
  const totalAmount = orderSnapshots.reduce((s, o) => s + (o.total || 0), 0);
  const displayId =
    sorted[0] && orderRepo.getOrderDisplayId(cafeId, sorted[0].id) !== '—'
      ? orderRepo.getOrderDisplayId(cafeId, sorted[0].id)
      : String(sorted[0].id || '');

  return {
    id: 'ts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    cafeId,
    displayId,
    tableId,
    orderType,
    orderCount: orderSnapshots.length,
    firstOrderAt,
    paymentAt,
    paymentMethod,
    totalAmount,
    cashSessionId: tillSession.sessionId,
    openDate: tillSession.openDate,
    orderIdsKey: historyStore.orderIdsKey(orderIds),
    orderIds,
    orders: orderSnapshots,
    createdAt: new Date().toISOString(),
    syncedFromOrders: true,
  };
}

/**
 * يبني سجلات الجلسة من الطلبات المغلقة الحالية إن لم تُسجَّل عند الإغلاق
 * (مثلاً أُغلقت قبل تفعيل الميزة).
 */
async function syncTodaySessionsFromClosedOrders(cafeId, tillSession) {
  if (!tillSession) return 0;
  const closed = (await orderRepo.getOrders(cafeId)).filter(
    (o) => o && o.closed === true && o.closedAt && orderBelongsToSession(o, tillSession)
  );
  if (!closed.length) return 0;

  const existing = historyStore.listForCashSession(
    tillSession.sessionId,
    tillSession.openDate
  );
  const usedOrderIds = new Set();
  existing.forEach((s) => {
    (s.orderIds || []).forEach((id) => usedOrderIds.add(String(id)));
  });

  const pending = closed.filter((o) => !usedOrderIds.has(String(o.id)));
  if (!pending.length) return 0;

  const groups = new Map();
  pending.forEach((order) => {
    const key = groupKeyForClosedOrder(order);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  });

  let created = 0;
  groups.forEach((orders) => {
    const idsKey = historyStore.orderIdsKey(orders.map((o) => o.id));
    if (historyStore.findByOrderIdsKey(idsKey, tillSession.sessionId)) return;
    const record = buildSessionRecordFromOrders(
      cafeId,
      orders,
      tillSession,
      orders[0].tableId,
      orders[0].paymentMethod
    );
    if (record) {
      historyStore.appendSession(record);
      created += 1;
    }
  });
  return created;
}

/** تسجيل جلسة «طلبات اليوم» لطلب سفري/دلفري أُغلق تلقائياً من المطبخ */
function recordTodaySessionForClosedOrder(cafeId, order, tillSession) {
  if (!order || order.closed !== true || !tillSession) return null;
  const orderType = inferOrderType(order);
  if (orderType !== ORDER_TYPE.TAKEAWAY && orderType !== ORDER_TYPE.DELIVERY) return null;
  if (!orderBelongsToSession(order, tillSession)) return null;

  const orderIds = [String(order.id)];
  const idsKey = historyStore.orderIdsKey(orderIds);
  const existing = historyStore.findByOrderIdsKey(idsKey, tillSession.sessionId);
  if (existing) return existing;

  const record = buildSessionRecordFromOrders(
    cafeId,
    [order],
    tillSession,
    order.tableId,
    order.paymentMethod
  );
  if (!record) return null;
  return historyStore.appendSession(record);
}

async function listSessionsForCurrentTill(cafeId) {
  const tillSession = await getTillSessionMetaForTodayList(cafeId);
  if (!tillSession) return [];
  await syncTodaySessionsFromClosedOrders(cafeId, tillSession);
  return historyStore
    .listForCashSession(tillSession.sessionId, tillSession.openDate)
    .sort((a, b) => {
      const ta = a.paymentAt ? new Date(a.paymentAt).getTime() : 0;
      const tb = b.paymentAt ? new Date(b.paymentAt).getTime() : 0;
      return tb - ta;
    });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** نطاق YYYY-MM-DD للتقرير (يوم / شهر / سنة) */
function getReportDateRange(type, dateStr) {
  const raw = String(dateStr || '').trim();
  if (!raw || !type) return { start: '', end: '' };
  const parts = raw.split('-');
  const year = parts[0];
  if (!year) return { start: '', end: '' };

  if (type === 'day' && parts.length >= 3) {
    const start =
      year + '-' + pad2(parts[1]) + '-' + pad2(parts[2].length === 1 ? '0' + parts[2] : parts[2]);
    return { start, end: start };
  }
  if (type === 'month' && parts.length >= 2) {
    const m = pad2(parts[1]);
    const lastDay = new Date(Number(year), Number(m), 0).getDate();
    return {
      start: year + '-' + m + '-01',
      end: year + '-' + m + '-' + pad2(lastDay),
    };
  }
  if (type === 'year') {
    return { start: year + '-01-01', end: year + '-12-31' };
  }
  return { start: '', end: '' };
}

/** جلسات مدفوعة من السجل حسب فترة التقرير — للأدمن / الأرشيف */
function listSessionsForReport(cafeId, type, dateStr) {
  const range = getReportDateRange(type, dateStr);
  if (!range.start || !range.end) return [];
  return historyStore
    .readAll()
    .filter((s) => {
      if (!s || !s.paymentAt) return false;
      if (s.cafeId && String(s.cafeId) !== String(cafeId)) return false;
      const ymd = ymdFromIso(s.paymentAt);
      return ymd && ymd >= range.start && ymd <= range.end;
    })
    .sort((a, b) => {
      const ta = a.paymentAt ? new Date(a.paymentAt).getTime() : 0;
      const tb = b.paymentAt ? new Date(b.paymentAt).getTime() : 0;
      return tb - ta;
    });
}

async function getSessionById(cafeId, id) {
  const tillSession = await requireActiveTillSession(cafeId);
  const row = historyStore.findById(id);
  if (!row) {
    const err = new Error('سجل الجلسة غير موجود.');
    err.status = 404;
    throw err;
  }
  if (
    row.cashSessionId &&
    tillSession.sessionId &&
    String(row.cashSessionId) !== String(tillSession.sessionId)
  ) {
    const err = new Error('سجل الجلسة خارج جلسة القاصة الحالية.');
    err.status = 403;
    throw err;
  }
  return row;
}

module.exports = {
  createSessionFromClosedOrders,
  recordTodaySessionForClosedOrder,
  listSessionsForCurrentTill,
  listSessionsForReport,
  getSessionById,
  inferOrderType,
  ORDER_TYPE,
  closedAtSecondBucket,
  groupKeyForClosedOrder,
  buildSessionRecordFromOrders,
};
