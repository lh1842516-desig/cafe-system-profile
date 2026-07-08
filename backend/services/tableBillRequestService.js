/**
 * حالة «طلب الحساب» للطاولة — بانتظار الكاشير.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const till = require('../data/till');
const { getOrdersByTable, getTables } = require('../data/store');
const { getKitchenStatus, normalizeKitchenStatusRead } = require('../data/kitchen');
const { orderBelongsToSession } = require('./cashSessionHelper');

const FILE = path.join(DATA_DIR, 'table-bill-requests.json');
const BILL_BLOCKED_MESSAGE =
  'تم طلب حساب هذه الطاولة. لا يمكن إرسال طلبات جديدة حتى يُغلق الكاشير الفاتورة.';
const BILL_BLOCKED_CODE = 'bill_requested';
const BILL_NOT_READY_CODE = 'bill_not_ready';
const BILL_NOT_READY_TITLE = 'لا يمكن طلب الحساب حالياً';
const BILL_NOT_READY_MESSAGE =
  'يرجى طلب المنتجات أولاً، ثم يمكنك طلب الحساب بعد الانتهاء.';
const STATUS_LABEL = 'بانتظار الحساب';
const BILL_REMINDER_COOLDOWN_MS = 60 * 1000;
const BILL_COOLDOWN_CODE = 'bill_cooldown';
const BILL_COOLDOWN_MESSAGE = 'تم إرسال الطلب، يرجى الانتظار.';

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ requests: [] }, null, 2), 'utf8');
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(raw.requests) ? raw.requests : [];
  } catch (_) {
    return [];
  }
}

function writeAll(requests) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify({ requests: requests || [] }, null, 2), 'utf8');
}

function activeTillSessionOrNull() {
  const session = till.getActiveSessionMeta();
  if (!session || !session.sessionId) return null;
  return session;
}

/** يطابق normalizeGroupTableId في واجهة الزبون — "03" → "3" */
function normalizeTableId(tableId) {
  const tid = String(tableId == null ? '' : tableId).trim();
  if (!tid) return '';
  if (/^\d+$/.test(tid)) {
    const n = Number(tid);
    if (Number.isFinite(n)) return String(n);
  }
  return tid;
}

function tableLabelFor(tableId) {
  const tid = normalizeTableId(tableId);
  if (!tid) return '—';
  const row = getTables().find(function (t) {
    return String(t.id) === tid;
  });
  const label = row && row.label != null ? String(row.label).trim() : tid;
  return label || tid;
}

function findRequest(tableId, cashSessionId) {
  const tid = normalizeTableId(tableId);
  const sid = String(cashSessionId || '').trim();
  if (!tid || !sid) return null;
  return (
    readAll().find(function (row) {
      return (
        row &&
        String(row.tableId) === tid &&
        String(row.cashSessionId || '') === sid
      );
    }) || null
  );
}

function isBillRequested(tableId) {
  const session = activeTillSessionOrNull();
  if (!session) return false;
  return !!findRequest(tableId, session.sessionId);
}

function listRequestedTableIds() {
  const session = activeTillSessionOrNull();
  if (!session) return [];
  return readAll()
    .filter(function (row) {
      return row && String(row.cashSessionId || '') === String(session.sessionId);
    })
    .map(function (row) {
      return String(row.tableId);
    });
}

function isKitchenPreparedOrCompleted(orderId) {
  const ks = getKitchenStatus(orderId);
  if (!ks || ks.status == null) return false;
  const raw = String(ks.status).trim().toLowerCase();
  if (raw === 'done' || raw === 'prepared' || raw === 'closed') return true;
  const norm = normalizeKitchenStatusRead(ks.status);
  return norm === 'preparing' || norm === 'completed';
}

function orderSentToKitchen(orderId) {
  const ks = getKitchenStatus(orderId);
  return !!(ks && ks.status != null && String(ks.status).trim());
}

function evaluateBillRequestEligibility(tableId) {
  const session = activeTillSessionOrNull();
  const tid = normalizeTableId(tableId);
  if (!session || !tid) {
    return { eligible: false, reason: 'no_session' };
  }
  const openOrders = getOrdersByTable(tid).filter(function (o) {
    return o && o.closed !== true && orderBelongsToSession(o, session);
  });
  if (!openOrders.length) {
    return { eligible: false, reason: 'no_orders' };
  }
  const sentToKitchen = openOrders.filter(function (o) {
    return orderSentToKitchen(o.id);
  });
  if (!sentToKitchen.length) {
    return { eligible: false, reason: 'not_sent_to_kitchen' };
  }
  const prepared = openOrders.filter(function (o) {
    return isKitchenPreparedOrCompleted(o.id);
  });
  if (!prepared.length) {
    return { eligible: false, reason: 'not_prepared' };
  }
  return {
    eligible: true,
    preparedOrderCount: prepared.length,
    openOrderCount: openOrders.length,
  };
}

function assertBillRequestEligible(tableId) {
  const check = evaluateBillRequestEligibility(tableId);
  if (check.eligible) return check;
  const err = new Error(BILL_NOT_READY_MESSAGE);
  err.status = 400;
  err.code = BILL_NOT_READY_CODE;
  err.title = BILL_NOT_READY_TITLE;
  throw err;
}

function lastSentAt(row) {
  if (!row) return null;
  return row.lastSentAt || row.requestedAt || null;
}

function getReminderState(row) {
  if (!row) {
    return {
      cooldownActive: false,
      cooldownEndsAt: null,
      reminderAllowed: false,
    };
  }
  const last = lastSentAt(row);
  const lastMs = last ? new Date(last).getTime() : 0;
  if (!lastMs || Number.isNaN(lastMs)) {
    return {
      cooldownActive: false,
      cooldownEndsAt: null,
      reminderAllowed: true,
    };
  }
  const endsMs = lastMs + BILL_REMINDER_COOLDOWN_MS;
  const cooldownActive = Date.now() < endsMs;
  return {
    cooldownActive,
    cooldownEndsAt: cooldownActive ? new Date(endsMs).toISOString() : null,
    reminderAllowed: !cooldownActive,
  };
}

function getBillStatus(tableId) {
  const session = activeTillSessionOrNull();
  const tid = normalizeTableId(tableId);
  const eligibility = evaluateBillRequestEligibility(tid);
  if (!session || !tid) {
    return {
      requested: false,
      tableId: tid,
      canRequest: false,
      cooldownActive: false,
      cooldownEndsAt: null,
      reminderAllowed: false,
      eligibility: eligibility,
    };
  }
  const row = findRequest(tid, session.sessionId);
  if (!row) {
    return {
      requested: false,
      tableId: tid,
      canRequest: eligibility.eligible,
      cooldownActive: false,
      cooldownEndsAt: null,
      reminderAllowed: false,
      eligibility: eligibility,
    };
  }
  const reminder = getReminderState(row);
  return {
    requested: true,
    tableId: tid,
    tableLabel: row.tableLabel || tableLabelFor(tid),
    requestedAt: row.requestedAt || null,
    lastSentAt: lastSentAt(row),
    reminderCount: row.reminderCount != null ? Number(row.reminderCount) : 0,
    statusLabel: STATUS_LABEL,
    canRequest: reminder.reminderAllowed,
    cooldownActive: reminder.cooldownActive,
    cooldownEndsAt: reminder.cooldownEndsAt,
    reminderAllowed: reminder.reminderAllowed,
    eligibility: eligibility,
  };
}

function assertCanOrder(tableId) {
  if (!isBillRequested(tableId)) return;
  const err = new Error(BILL_BLOCKED_MESSAGE);
  err.status = 409;
  err.code = BILL_BLOCKED_CODE;
  throw err;
}

function setBillRequested(tableId, meta) {
  const session = activeTillSessionOrNull();
  if (!session) {
    const err = new Error('لا توجد قاصة مفتوحة حالياً، يرجى فتح قاصة أولاً.');
    err.status = 400;
    throw err;
  }
  const tid = normalizeTableId(tableId);
  if (!tid) {
    const err = new Error('معرف الطاولة مطلوب.');
    err.status = 400;
    throw err;
  }
  const tableLabel =
    meta && meta.tableLabel != null ? String(meta.tableLabel).trim() : tableLabelFor(tid);
  const now = new Date().toISOString();
  const existing = findRequest(tid, session.sessionId);

  if (!existing) {
    assertBillRequestEligible(tid);
    const row = {
      tableId: tid,
      cashSessionId: session.sessionId,
      openDate: session.openDate,
      tableLabel: tableLabel || tableLabelFor(tid),
      requestedAt: now,
      lastSentAt: now,
      reminderCount: 0,
      sessionId: meta && meta.sessionId != null ? String(meta.sessionId).trim() : '',
    };
    const list = readAll();
    list.push(row);
    writeAll(list);
    return {
      ok: true,
      isReminder: false,
      status: getBillStatus(tid),
    };
  }

  const reminder = getReminderState(existing);
  if (reminder.cooldownActive) {
    const err = new Error(BILL_COOLDOWN_MESSAGE);
    err.status = 429;
    err.code = BILL_COOLDOWN_CODE;
    err.title = 'طلب الحساب';
    throw err;
  }

  existing.lastSentAt = now;
  existing.reminderCount = (existing.reminderCount != null ? Number(existing.reminderCount) : 0) + 1;
  if (tableLabel) existing.tableLabel = tableLabel;
  const list = readAll().map(function (r) {
    if (
      r &&
      String(r.tableId) === tid &&
      String(r.cashSessionId || '') === String(session.sessionId)
    ) {
      return existing;
    }
    return r;
  });
  writeAll(list);
  return {
    ok: true,
    isReminder: true,
    status: getBillStatus(tid),
  };
}

function clearBillRequest(tableId) {
  const session = activeTillSessionOrNull();
  const tid = normalizeTableId(tableId);
  if (!tid) return false;
  const list = readAll();
  const sid = session && session.sessionId ? String(session.sessionId) : '';
  const next = list.filter(function (r) {
    if (!r || String(r.tableId) !== tid) return true;
    if (sid) return String(r.cashSessionId || '') !== sid;
    return false;
  });
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}

function maybeClearIfNoOpenOrders(tableId) {
  const tid = normalizeTableId(tableId);
  if (!tid || !isBillRequested(tid)) return false;
  const session = activeTillSessionOrNull();
  if (!session) return false;
  const open = getOrdersByTable(tid).filter(function (o) {
    return orderBelongsToSession(o, session);
  });
  if (open.length) return false;
  return clearBillRequest(tid);
}

function cashierMessage(tableId, tableLabel, opts) {
  const label = String(tableLabel || tableLabelFor(tableId) || tableId || '').trim();
  if (opts && opts.isReminder) {
    return 'طاولة رقم ' + label + ' — إعادة إرسال طلب الحساب';
  }
  return 'طاولة رقم ' + label + ' تطلب الحساب';
}

function captainMessage(tableId, tableLabel, opts) {
  const label = String(tableLabel || tableLabelFor(tableId) || tableId || '').trim();
  if (opts && opts.isReminder) {
    return 'طاولة رقم ' + label + ' — إعادة إرسال طلب إنهاء الحساب';
  }
  return 'طاولة رقم ' + label + ' بانتظار إنهاء الحساب';
}

module.exports = {
  BILL_BLOCKED_MESSAGE,
  BILL_BLOCKED_CODE,
  BILL_NOT_READY_CODE,
  BILL_NOT_READY_TITLE,
  BILL_NOT_READY_MESSAGE,
  BILL_COOLDOWN_CODE,
  BILL_COOLDOWN_MESSAGE,
  BILL_REMINDER_COOLDOWN_MS,
  STATUS_LABEL,
  isBillRequested,
  listRequestedTableIds,
  getBillStatus,
  evaluateBillRequestEligibility,
  assertBillRequestEligible,
  assertCanOrder,
  setBillRequested,
  clearBillRequest,
  maybeClearIfNoOpenOrders,
  cashierMessage,
  captainMessage,
  tableLabelFor,
};
