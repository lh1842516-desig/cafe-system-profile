/**
 * إدارة قاصة اليوم — تعتمد على التاريخ، أرشفة تلقائية عند تغيّر اليوم
 * هيكل القاصة: رصيد بداية، مبيعات (كاش/بطاقة)، مصروفات، سحوبات، صافي، إغلاق
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getClosings } = require('./store');
const { aggregateSalesForSession } = require('../services/cashSessionHelper');

const TILL_FILE = path.join(DATA_DIR, 'currentTill.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** استخراج تاريخ YYYY-MM-DD من ISO string */
function getOpenDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function defaultTill(dateStr, openedAt, status) {
  const now = new Date();
  const opened = openedAt === undefined ? now.toISOString() : openedAt;
  const today = getTodayDateStr();
  const openDate = opened ? (dateStr || today) : null;
  return {
    date: dateStr || today,
    openedAt: opened,
    open_date: openDate,
    openingBalance: 0,
    expenses: [],
    withdrawals: [],
    closedAt: null,
    closedBy: null,
    openedBy: null,
    status: status || 'open',
    note: '',
  };
}

function readCurrentTill() {
  ensureDir(path.dirname(TILL_FILE));
  if (!fs.existsSync(TILL_FILE)) {
    // في أول تشغيل: نُنشئ قاصة مغلقة بدون openedAt حتى يضغط الكاشير على "فتح القاصة"
    const till = defaultTill(getTodayDateStr(), null, 'closed');
    writeTill(till);
    return till;
  }
  const data = readTillFile();
  if (data) {
    const openedAt =
      data.openedAt ||
      (data.date ? data.date + 'T00:00:00.000Z' : new Date().toISOString());
    const closedAt = data.closedAt || null;
    const status = data.status || (closedAt ? 'closed' : 'open');
    const open_date = data.open_date != null
      ? String(data.open_date)
      : getOpenDateFromIso(openedAt);
    return {
      date: String(data.date || ''),
      openedAt,
      open_date: open_date || null,
      openingBalance: Number(data.openingBalance) || 0,
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      withdrawals: Array.isArray(data.withdrawals) ? data.withdrawals : [],
      closedAt,
      closedBy: data.closedBy || null,
      openedBy: data.openedBy || null,
      status,
      note: String(data.note || ''),
    };
  }
  return defaultTill(getTodayDateStr());
}

function writeTill(till) {
  ensureDir(path.dirname(TILL_FILE));
  fs.writeFileSync(TILL_FILE, JSON.stringify(till, null, 2), 'utf8');
}

function readTillFile() {
  if (!fs.existsSync(TILL_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TILL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * ضمان وجود ملف قاصة حالي.
 * لا يعتمد على التاريخ بعد الآن، فقط يتأكد من وجود جلسة واحدة مفتوحة.
 * إذا لم يوجد ملف يتم إنشاء قاصة جديدة مفتوحة.
 * إذا كانت القاصة مغلقة تُترك كما هي (لا تُنشأ قاصة جديدة تلقائياً هنا).
 */
function ensureTillForToday(archiveToClosings) {
  // archiveToClosings لم تعد مستخدمة هنا، لكنها تُترك للتوافق مع التواقيع القديمة
  return readCurrentTill();
}

/** تحديث رصيد بداية اليوم */
function setOpeningBalance(amount) {
  const till = readCurrentTill();
  till.openingBalance = Number(amount) || 0;
  writeTill(till);
  return till;
}

/** إضافة مصروف */
function addExpense(name, amount, note) {
  const till = readCurrentTill();
  const id = 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  till.expenses.push({
    id,
    name: String(name || 'مصروف').trim(),
    amount: Number(amount) || 0,
    note: String(note || '').trim(),
  });
  writeTill(till);
  return till;
}

/** إضافة سحب من القاصة */
function addWithdrawal(amount, note) {
  const till = readCurrentTill();
  const id = 'wd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  till.withdrawals.push({
    id,
    amount: Number(amount) || 0,
    note: String(note || '').trim(),
  });
  writeTill(till);
  return till;
}

/** تعديل مصروف */
function updateExpense(id, name, amount, note) {
  const till = readCurrentTill();
  const exp = till.expenses.find((e) => String(e.id) === String(id));
  if (!exp) {
    const err = new Error('المصروف غير موجود');
    err.code = 'NOT_FOUND';
    throw err;
  }
  exp.name = String(name || 'مصروف').trim();
  exp.amount = Number(amount) || 0;
  exp.note = String(note || '').trim();
  writeTill(till);
  return till;
}

/** تعديل سحب */
function updateWithdrawal(id, amount, note) {
  const till = readCurrentTill();
  const wd = till.withdrawals.find((w) => String(w.id) === String(id));
  if (!wd) {
    const err = new Error('عملية السحب غير موجودة');
    err.code = 'NOT_FOUND';
    throw err;
  }
  wd.amount = Number(amount) || 0;
  wd.note = String(note || '').trim();
  writeTill(till);
  return till;
}

/** حذف مصروف */
function removeExpense(id) {
  const till = readCurrentTill();
  till.expenses = till.expenses.filter((e) => e.id !== id);
  writeTill(till);
  return till;
}

/** حذف سحب */
function removeWithdrawal(id) {
  const till = readCurrentTill();
  till.withdrawals = till.withdrawals.filter((w) => w.id !== id);
  writeTill(till);
  return till;
}

/** تحديث ملاحظة القاصة */
function setNote(note) {
  const till = readCurrentTill();
  till.note = String(note || '').trim();
  writeTill(till);
  return till;
}

/** إغلاق القاصة (تسجيل closedAt و closedBy) ثم أرشفتها تُنفّذ من routes بعد حساب المبيعات */
function closeTill(closedBy) {
  const till = readCurrentTill();
  till.closedAt = new Date().toISOString();
  till.closedBy = String(closedBy || '').trim();
  till.status = 'closed';
  writeTill(till);
  return till;
}

/**
 * هل تم فتح قاصة في هذا التاريخ التقويمي (حسب تاريخ الفتح فقط)؟
 * يُستخدم لمنع فتح أكثر من قاصة في نفس اليوم.
 */
function hasTillOpenedOnDate(dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return false;
  const current = readCurrentTill();
  if (current && current.openedAt) {
    const currentOpenDate = current.open_date || getOpenDateFromIso(current.openedAt);
    if (currentOpenDate === target) return true;
  }
  const closings = getClosings();
  for (let i = 0; i < closings.length; i++) {
    const c = closings[i];
    const openDate = c.open_date || c.date || (c.openedAt ? getOpenDateFromIso(c.openedAt) : null);
    if (openDate === target) return true;
  }
  return false;
}

/** بدء جلسة قاصة جديدة (تُستخدم بعد الضغط على "فتح القاصة"). يمكن تمرير رصيد بداية اليوم واسم الفاتح. */
function resetTillForNewDay(openingBalance, openedBy) {
  const till = defaultTill(getTodayDateStr());
  if (openingBalance !== undefined && openingBalance !== null) {
    till.openingBalance = Number(openingBalance) || 0;
  }
  if (openedBy !== undefined && openedBy !== null) {
    const name = String(openedBy || '').trim();
    till.openedBy = name || null;
  }
  writeTill(till);
  return till;
}

/** مبيعات فترة زمنية (startIso - endIso) من الطلبات المغلقة — للتوافق أو استخدامات تشخيصية */
function getSalesForRange(startIso, endIso) {
  const { getOrders } = require('./store');
  const orders = getOrders();
  const startTs = startIso ? new Date(startIso).getTime() : -Infinity;
  const endTs = endIso ? new Date(endIso).getTime() : Infinity;
  let salesCash = 0;
  let salesCard = 0;
  orders.forEach((o) => {
    if (!o.closed || !o.closedAt) return;
    const t = new Date(o.closedAt).getTime();
    if (Number.isNaN(t) || t < startTs || t > endTs) return;
    const total = o.total != null ? o.total : (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
    const method = (o.paymentMethod || 'cash').toLowerCase();
    if (method === 'card') salesCard += total;
    else salesCash += total;
  });
  return { salesCash, salesCard, total: salesCash + salesCard };
}

/**
 * مبيعات جلسة القاصة الحالية (ملف currentTill): حسب cash_session_id / ربط الجلسة،
 * وليس فقط نطاق زمني على closedAt (يتجنّب اختلاف التقويم بعد منتصف الليل).
 */
function getSalesToday() {
  const till = readCurrentTill();
  if (!till || !till.openedAt) {
    return { salesCash: 0, salesCard: 0, total: 0 };
  }
  const openDate = String(till.open_date || till.date || getOpenDateFromIso(till.openedAt) || '').trim();
  const session = {
    sessionId: String(till.openedAt),
    openDate: openDate || null,
    openedAt: String(till.openedAt),
    closedAt: till.closedAt || null,
  };
  return aggregateSalesForSession(session);
}

/**
 * معلومات جلسة القاصة المفتوحة الحالية.
 * تُستخدم كمرجع موحّد لكل العمليات (طلبات/مطبخ/دفع/إحصائيات).
 */
function getActiveSessionMeta() {
  const t = readCurrentTill();
  if (!t || t.status !== 'open' || !t.openedAt) {
    return null;
  }
  const openDate = String(t.open_date || t.date || getOpenDateFromIso(t.openedAt) || '').trim();
  return {
    sessionId: String(t.openedAt),
    openDate: openDate || null,
    openedAt: String(t.openedAt),
  };
}

module.exports = {
  getTodayDateStr,
  getOpenDateFromIso,
  defaultTill,
  readCurrentTill,
  writeTill,
  ensureTillForToday,
  hasTillOpenedOnDate,
  setOpeningBalance,
  addExpense,
  updateExpense,
  addWithdrawal,
  updateWithdrawal,
  removeExpense,
  removeWithdrawal,
  setNote,
  closeTill,
  resetTillForNewDay,
  getSalesToday,
  getSalesForRange,
  getActiveSessionMeta,
  TILL_FILE,
};
