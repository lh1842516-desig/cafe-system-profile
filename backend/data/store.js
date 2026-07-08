/**
 * تخزين محلي بالملفات (JSON) - بديل لقاعدة بيانات محلية
 * يمكن استبداله لاحقاً بـ SQLite دون تغيير واجهة الـ API
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const CLOSINGS_FILE = path.join(DATA_DIR, 'closings.json');
const ORDER_SEQUENCE_FILE = path.join(DATA_DIR, 'orderSequence.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, defaultValue = []) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, defaultValue);
    return defaultValue;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ——— المنيو ———
function getMenu() {
  return readJson(MENU_FILE, []);
}

function getMenuItem(id) {
  const menu = getMenu();
  if (id == null || id === '') return null;
  const direct = menu.find((item) => item.id === id);
  if (direct) return direct;
  const s = String(id);
  return menu.find((item) => String(item.id) === s) || null;
}

function saveMenu(menu) {
  writeJson(MENU_FILE, menu);
}

// ——— الطلبات (مجمعة حسب الطاولة) ———
// هيكل: { tableId: string, orders: [{ id, items: [{ menuId, name, price, quantity, note }], createdAt, closed }] }
function getOrders() {
  return readJson(ORDERS_FILE, []);
}

function getOrdersByTable(tableId) {
  const all = getOrders();
  const tid = String(tableId == null ? '' : tableId).trim();
  return all.filter((o) => {
    const otid = String(o.tableId == null ? '' : o.tableId).trim();
    if (otid !== tid) return false;
    return o.closed !== true;
  });
}

const { isOrderKitchenCompleted } = require('./kitchen');

/**
 * طلبات تمنع «حجز الطاولة» لمنيو الزبون: غير مسددة في القاصة ولم تُسجَّل كمكتملة في المطبخ بعد.
 * الطلب المكتمل تجهيزاً (في انتظار الدفع) لا يُعتبر مشغولاً لهذا الغرض — يُحل تعارض الإلغاء ثم طلب جديد.
 */
function getOrdersBlockingTableClaim(tableId) {
  return getOrdersByTable(tableId).filter((o) => !isOrderKitchenCompleted(o.id));
}

function getAllOrdersForTable(tableId) {
  const all = getOrders();
  return all.filter((o) => o.tableId === tableId);
}

function saveOrders(orders) {
  writeJson(ORDERS_FILE, orders);
}

/** تاريخ اليوم بصيغة YYYY-MM-DD (لتهيئة العداد عند الهجرة من النسخة القديمة فقط) */
function getTodayDateStrForSequence() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** قراءة ملف تسلسل الطلبات. الهيكل: { lastByOpenDate: { "YYYY-MM-DD": number } } أو قديم: { last: number } */
function readOrderSequenceFile() {
  const data = readJson(ORDER_SEQUENCE_FILE, {});
  if (data.lastByOpenDate && typeof data.lastByOpenDate === 'object') {
    return data;
  }
  if (typeof data.last === 'number') {
    return {
      lastByOpenDate: { [getTodayDateStrForSequence()]: data.last },
    };
  }
  return { lastByOpenDate: {} };
}

/** تهيئة العداد من الطلبات الحالية إن وُجدت بأرقام T*-XXX (أول تشغيل فقط، للنسخة القديمة) */
function initOrderSequenceFromOrders() {
  if (fs.existsSync(ORDER_SEQUENCE_FILE)) return;
  const orders = getOrders();
  let maxSeq = 0;
  const re = /^T\d+-(\d+)$/;
  orders.forEach((o) => {
    const m = o.id ? String(o.id).match(re) : null;
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  });
  const today = getTodayDateStrForSequence();
  writeJson(ORDER_SEQUENCE_FILE, { lastByOpenDate: { [today]: maxSeq } });
}

/**
 * يُرجع الرقم المتسلسل التالي للطلب لليوم المعطى (حسب تاريخ فتح القاصة).
 * عند فتح قاصة يوم جديد يبدأ التسلسل من 1.
 * @param {string} openDate - تاريخ فتح القاصة YYYY-MM-DD (يوم العمل)
 * @returns {number} الرقم التالي (1، 2، 3، ...)
 */
function getNextOrderSequence(openDate) {
  ensureDir(path.dirname(ORDER_SEQUENCE_FILE));
  initOrderSequenceFromOrders();
  const normalized = String(openDate || '').trim() || getTodayDateStrForSequence();
  const data = readOrderSequenceFile();
  const lastByOpenDate = data.lastByOpenDate || {};
  const current = typeof lastByOpenDate[normalized] === 'number' ? lastByOpenDate[normalized] : 0;
  const next = current + 1;
  lastByOpenDate[normalized] = next;
  writeJson(ORDER_SEQUENCE_FILE, { lastByOpenDate });
  return next;
}

/**
 * يضمن أن عداد يوم العمل لا يقل عن minSeq (بعد تجنّب تعارض مع id موجود مسبقاً في orders.json).
 */
function ensureOrderSequenceAtLeast(openDate, minSeq) {
  const normalized = String(openDate || '').trim() || getTodayDateStrForSequence();
  if (typeof minSeq !== 'number' || minSeq < 1) return;
  const data = readOrderSequenceFile();
  const lastByOpenDate = data.lastByOpenDate || {};
  const cur = typeof lastByOpenDate[normalized] === 'number' ? lastByOpenDate[normalized] : 0;
  if (minSeq > cur) {
    lastByOpenDate[normalized] = minSeq;
    writeJson(ORDER_SEQUENCE_FILE, { lastByOpenDate });
  }
}

/** رقم الطلب للعرض: T1-001 أو K-001 أو D-001 — وإلا "—" (للطلبات القديمة UUID) */
function getOrderDisplayId(id) {
  if (id == null || typeof id !== 'string') return '—';
  var s = id.trim();
  if (/^T\d+-\d{1,}$/.test(s)) return s;
  if (/^K-\d{1,}$/.test(s)) return s;
  if (/^D-\d{1,}$/.test(s)) return s;
  return '—';
}

// ——— الطاولات ———
function normalizeTableRow(t) {
  const id = String(t && t.id != null ? t.id : '').trim();
  const label = String(t && t.label != null ? t.label : id).trim() || id;
  return { id, label };
}

function getTables() {
  const def = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
  const raw = readJson(TABLES_FILE, def);
  return (Array.isArray(raw) ? raw : [])
    .map(function (t) {
      const row = normalizeTableRow(t);
      if (!row.id) return null;
      return { id: row.id, label: row.label };
    })
    .filter(Boolean);
}

function saveTables(tables) {
  const list = Array.isArray(tables) ? tables : [];
  writeJson(
    TABLES_FILE,
    list
      .map(function (t) {
        const row = normalizeTableRow(t);
        if (!row.id) return null;
        return { id: row.id, label: row.label };
      })
      .filter(Boolean)
  );
  return getTables();
}

function getNextTableId() {
  const tables = getTables();
  let maxNum = 0;
  tables.forEach(function (t) {
    const n = parseInt(String(t.id || ''), 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1);
}

/** هل التاريخ (ISO string أو Date) ضمن يوم اليوم محلياً؟ */
function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

/** طلبات مُغلقة (مدفوعة) اليوم فقط */
function getOrdersClosedToday() {
  const orders = getOrders();
  return orders.filter((o) => o.closed && isToday(o.closedAt));
}

/**
 * الطلبات المغلقة الخاصة بيوم عمل القاصة (open_date).
 * fallback للبيانات القديمة: إن لم يوجد open_date نطابق closedAt بنفس اليوم.
 */
function getOrdersClosedByOpenDate(openDate) {
  const want = String(openDate || '').trim();
  if (!want) return [];
  const orders = getOrders();
  return orders.filter((o) => {
    if (!o || o.closed !== true) return false;
    if (o.open_date) return String(o.open_date).trim() === want;
    if (!o.closedAt) return false;
    const d = new Date(o.closedAt);
    if (Number.isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day === want;
  });
}

// ——— قاصات الأيام (Daily Cash Closing) ———
function getClosings() {
  return readJson(CLOSINGS_FILE, []);
}

function saveClosings(closings) {
  writeJson(CLOSINGS_FILE, closings);
}

/** إضافة قاصة يوم واحد. يُرجع الكائن المُضاف. */
function addClosing(obj) {
  const list = getClosings();
  const record = {
    date: String(obj.date || ''),
    time: String(obj.time || ''),
    totalSales: Number(obj.totalSales) || 0,
    expenses: Number(obj.expenses) || 0,
    netTotal: Number(obj.netTotal) ?? (Number(obj.totalSales) || 0) - (Number(obj.expenses) || 0),
    note: String(obj.note || ''),
    orderCount: Number(obj.orderCount) || 0,
  };
  list.push(record);
  saveClosings(list);
  return record;
}

/**
 * استخراج تاريخ الفتح (YYYY-MM-DD) من سجل قاصة.
 * يعتمد على open_date أو date أو openedAt.
 */
function getClosingOpenDate(c) {
  if (!c) return null;
  if (c.open_date) return String(c.open_date).trim();
  if (c.date) return String(c.date).trim();
  if (c.openedAt) {
    const d = new Date(c.openedAt);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
  }
  return null;
}

/**
 * قاصات تم فتحها في تاريخ معيّن (حسب opened_at / open_date فقط).
 * للتقارير والأرشيف — فلترة بالتاريخ الذي فُتحت فيه القاصة وليس تاريخ الإغلاق.
 */
function getClosingsByOpenDate(dateStr) {
  const normalized = String(dateStr || '').trim();
  if (!normalized) return [];
  const list = getClosings();
  return list.filter(function (c) {
    const openDate = getClosingOpenDate(c);
    return openDate === normalized;
  });
}

/**
 * قاصات تم فتحها ضمن نطاق تواريخ (للشهر أو السنة).
 */
function getClosingsByOpenDateRange(startStr, endStr) {
  const start = String(startStr || '').trim();
  const end = String(endStr || '').trim();
  if (!start || !end) return [];
  const list = getClosings();
  return list.filter(function (c) {
    const openDate = getClosingOpenDate(c);
    if (!openDate) return false;
    return openDate >= start && openDate <= end;
  });
}

/** آخر قاصة مسجّلة (للعرض في الكاشير). تُرجع كائناً موحّداً يدعم الهيكل القديم والجديد. */
function getLastClosing() {
  const list = getClosings();
  if (list.length === 0) return null;
  const c = list[list.length - 1];
  const base = {
    date: String(c.date || ''),
    time: String(c.time || ''),
    totalSales: Number(c.totalSales) || 0,
    expenses: Number(c.expenses) || 0,
    netTotal: c.netTotal != null ? Number(c.netTotal) : (Number(c.totalSales) || 0) - (Number(c.expenses) || 0),
    note: String(c.note || ''),
    orderCount: Number(c.orderCount) || 0,
  };
  if (c.openingBalance != null) base.openingBalance = Number(c.openingBalance);
  if (c.salesCash != null) base.salesCash = Number(c.salesCash);
  if (c.salesCard != null) base.salesCard = Number(c.salesCard);
  if (c.totalExpenses != null) base.totalExpenses = Number(c.totalExpenses);
  if (c.totalWithdrawals != null) base.totalWithdrawals = Number(c.totalWithdrawals);
  if (c.net != null) base.net = Number(c.net);
  if (c.closedAt != null) base.closedAt = c.closedAt;
  if (c.closedBy != null) base.closedBy = String(c.closedBy);
  if (c.openedBy != null) base.openedBy = String(c.openedBy);
  if (c.openedAt != null) base.openedAt = c.openedAt;
  if (c.status != null) base.status = String(c.status);
  return base;
}

/** هل يوجد إغلاق لهذا التاريخ؟ */
function hasClosingForDate(dateStr) {
  const list = getClosings();
  return list.some((c) => String(c.date) === String(dateStr));
}

/**
 * أرشفة قاصة اليوم بالهيكل الموسّع (رصيد بداية، مبيعات كاش/بطاقة، مصروفات، سحوبات، صافي، closedBy).
 */
function addTillClosing(till, salesCash, salesCard) {
  const list = getClosings();
  const totalSales = (Number(salesCash) || 0) + (Number(salesCard) || 0);
  const expensesList = Array.isArray(till.expenses) ? till.expenses : [];
  const withdrawalsList = Array.isArray(till.withdrawals) ? till.withdrawals : [];
  const totalExpenses = expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWithdrawals = withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const openingBalance = Number(till.openingBalance) || 0;
  const net = openingBalance + totalSales - totalExpenses - totalWithdrawals;
  const closedAtDate = till.closedAt ? new Date(till.closedAt) : new Date();
  const openedAtDate = till.openedAt ? new Date(till.openedAt) : closedAtDate;
  const timeStr = String(closedAtDate.getHours()).padStart(2, '0') + ':' + String(closedAtDate.getMinutes()).padStart(2, '0');
  const dateStr =
    openedAtDate.getFullYear() +
    '-' +
    String(openedAtDate.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(openedAtDate.getDate()).padStart(2, '0');
  const openTimeStr =
    String(openedAtDate.getHours()).padStart(2, '0') + ':' + String(openedAtDate.getMinutes()).padStart(2, '0');
  const closeTimeStr =
    String(closedAtDate.getHours()).padStart(2, '0') + ':' + String(closedAtDate.getMinutes()).padStart(2, '0');
  const record = {
    date: String(dateStr || till.date || ''),
    open_date: String(dateStr || till.open_date || till.date || ''),
    open_time: openTimeStr,
    close_time: closeTimeStr,
    time: timeStr,
    openedAt: till.openedAt || openedAtDate.toISOString(),
    openingBalance,
    salesCash: Number(salesCash) || 0,
    salesCard: Number(salesCard) || 0,
    totalSales,
    expenses: expensesList,
    totalExpenses,
    withdrawals: withdrawalsList,
    totalWithdrawals,
    net,
    note: String(till.note || ''),
    closedAt: till.closedAt || closedAtDate.toISOString(),
    closedBy: String(till.closedBy || ''),
    openedBy: String(till.openedBy || ''),
    status: till.status || 'closed',
    orderCount: 0,
  };
  list.push(record);
  saveClosings(list);
  return record;
}

/**
 * حذف الطلبات المغلقة التي تاريخ إغلاقها يساوي dateStr (YYYY-MM-DD).
 * يُستدعى من مسار قاصات قديم (POST /api/closings) للتوافق.
 */
function clearClosedOrdersForDate(dateStr) {
  if (!dateStr) return;
  const orders = getOrders();
  const normalized = String(dateStr).trim();
  const filtered = orders.filter((o) => {
    if (!o.closed || !o.closedAt) return true;
    const d = new Date(o.closedAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const orderDate = y + '-' + m + '-' + day;
    return orderDate !== normalized;
  });
  if (filtered.length !== orders.length) saveOrders(filtered);
}

/**
 * يحدد إن كان الطلب ضمن جلسة قاصة مُغلقة (حسب tillOpenedAt أو تقدير زمني للطلبات القديمة).
 */
function orderBelongsToTillSession(o, sessionOpenedAt, closedAtIso) {
  const session = String(sessionOpenedAt);
  if (o.tillOpenedAt != null) {
    return String(o.tillOpenedAt) === session;
  }
  if (!o.createdAt) return false;
  const created = new Date(o.createdAt).getTime();
  const opened = new Date(session).getTime();
  const closed = closedAtIso ? new Date(closedAtIso).getTime() : Date.now();
  return created >= opened && created <= closed;
}

/**
 * بعد إغلاق القاصة: تصفير الملف النشط من أي طلب معلّق.
 * 1) كل طلب غير مغلق (مفتوح) يُؤرشف ويُحذف — حتى القديم من جلسات سابقة (كان يُستثنى سابقاً بسبب نافذة الزمن).
 * 2) الطلبات المغلقة التابعة لهذه الجلسة تُحذف من الملف (موجودة في الأرشيف).
 */
function purgeOrdersForTillSession(closedTill) {
  if (!closedTill || !closedTill.openedAt) return;
  const sessionOpenedAt = closedTill.openedAt;
  const closedAtIso = closedTill.closedAt || new Date().toISOString();
  const { addOrderToArchive } = require('./archive');

  const orders = getOrders();
  const filtered = orders.filter((o) => {
    if (o.closed !== true) {
      const snap = Object.assign({}, o, {
        closed: true,
        closedAt: closedAtIso,
        paymentMethod: o.paymentMethod || 'cash',
      });
      addOrderToArchive(snap);
      return false;
    }
    if (orderBelongsToTillSession(o, sessionOpenedAt, closedAtIso)) return false;
    return true;
  });
  if (filtered.length !== orders.length) saveOrders(filtered);
}

module.exports = {
  getOrdersClosedToday,
  getOrdersClosedByOpenDate,
  isToday,
  getMenu,
  getMenuItem,
  saveMenu,
  getOrders,
  getOrdersByTable,
  getOrdersBlockingTableClaim,
  getAllOrdersForTable,
  saveOrders,
  getTables,
  saveTables,
  getNextTableId,
  readJson,
  writeJson,
  getClosings,
  saveClosings,
  addClosing,
  getClosingOpenDate,
  getClosingsByOpenDate,
  getClosingsByOpenDateRange,
  getLastClosing,
  hasClosingForDate,
  clearClosedOrdersForDate,
  purgeOrdersForTillSession,
  addTillClosing,
  getNextOrderSequence,
  ensureOrderSequenceAtLeast,
  getOrderDisplayId,
  MENU_FILE,
  ORDERS_FILE,
  TABLES_FILE,
  CLOSINGS_FILE,
};
