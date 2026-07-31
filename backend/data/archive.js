/**
 * أرشيف الطلبات — ملف واحد لكل سنة: data/YYYY.json
 * الهيكل: سنة → أشهر (01..12) → أيام (01..31) مع الطلبات والإحصائيات.
 * يُحمّل فقط ملف السنة المطلوبة لضمان أداء خفيف.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getYearFilePath(cafeId, year) {
  const cid = String(cafeId || '').trim();
  const dir = cid ? path.join(ARCHIVE_DIR, cid) : ARCHIVE_DIR;
  ensureDir(dir);
  return path.join(dir, String(year) + '.json');
}

/** قراءة ملف السنة لكافيه معين. إذا لم يوجد يُرجع هيكل فارغ. */
function readYearFile(cafeId, year) {
  const filePath = getYearFilePath(cafeId, year);
  if (!fs.existsSync(filePath)) {
    return { year: Number(year), months: {} };
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      year: data.year || Number(year),
      months: data.months || {},
    };
  } catch {
    return { year: Number(year), months: {} };
  }
}

/** كتابة ملف السنة لكافيه معين. */
function writeYearFile(cafeId, year, data) {
  const filePath = getYearFilePath(cafeId, year);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** تنسيق شهر/يوم برقمين. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** تحويل طلب مغلق إلى صيغة أرشيف مضغوطة. */
function orderToArchiveRecord(order) {
  const items = (order.items || []).map((it) => ({
    name: it.name,
    qty: it.quantity || 1,
    price: it.price || 0,
  }));
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  const d = order.closedAt ? new Date(order.closedAt) : new Date();
  const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const tableId = order.tableId != null ? String(order.tableId) : '';
  let orderType = order.orderType;
  if (!orderType) {
    if (tableId === 'TAKEAWAY') orderType = 'TAKEAWAY';
    else if (tableId === 'DELIVERY') orderType = 'DELIVERY';
    else orderType = 'DINE_IN';
  }
  return {
    id: order.id,
    table: tableId,
    orderType,
    total,
    items,
    time,
    closedAt: order.closedAt,
  };
}

function inferArchiveOrderType(o) {
  if (!o) return 'DINE_IN';
  const t = String(o.orderType || '').trim().toUpperCase();
  if (t === 'TAKEAWAY' || t === 'DELIVERY') return t;
  const tid = String(o.table != null ? o.table : '').trim().toUpperCase();
  if (tid === 'TAKEAWAY') return 'TAKEAWAY';
  if (tid === 'DELIVERY') return 'DELIVERY';
  return 'DINE_IN';
}

/** تحديث إحصائيات يوم واحد (أرباح، عدد طلبات، أكثر منتج). */
function updateDayStats(dayData) {
  const orders = dayData.orders || [];
  dayData.totalOrders = orders.length;
  dayData.totalProfit = orders.reduce((s, o) => s + (o.total || 0), 0);
  const productCount = {};
  orders.forEach((o) => {
    (o.items || []).forEach((it) => {
      const name = it.name || '';
      productCount[name] = (productCount[name] || 0) + (it.qty || 1);
    });
  });
  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
  dayData.topProduct = top ? top[0] : '';
  dayData.topProductCount = top ? top[1] : 0;
}

/** إضافة طلب مغلق إلى أرشيف الكافيه (السنة → الشهر → اليوم). */
function addOrderToArchive(order) {
  if (!order || !order.closed || !order.closedAt) return;
  const cafeId = String(order.cafeId || order.cafe_id || '').trim();
  if (!cafeId) return;

  let year;
  let monthKey;
  let dayKey;
  if (order.open_date && /^\d{4}-\d{2}-\d{2}$/.test(String(order.open_date).trim())) {
    const parts = String(order.open_date).trim().split('-');
    year = Number(parts[0]);
    monthKey = parts[1];
    dayKey = parts[2];
  } else {
    const d = new Date(order.closedAt);
    year = d.getFullYear();
    monthKey = pad2(d.getMonth() + 1);
    dayKey = pad2(d.getDate());
  }

  const data = readYearFile(cafeId, year);
  if (!data.months[monthKey]) data.months[monthKey] = { days: {} };
  const month = data.months[monthKey];
  if (!month.days[dayKey]) {
    month.days[dayKey] = { totalProfit: 0, totalOrders: 0, topProduct: '', topProductCount: 0, orders: [] };
  }
  const dayData = month.days[dayKey];
  if (dayData.orders.some((o) => o.id === order.id)) return;

  dayData.orders.push(orderToArchiveRecord(order));
  updateDayStats(dayData);
  writeYearFile(cafeId, year, data);
}

/** تجميع إحصائيات وأوامر من خريطة أيام (يوم أو شهر أو سنة). */
function aggregateDays(daysMap) {
  const orders = [];
  let totalProfit = 0;
  let totalOrders = 0;
  let dineInOrders = 0;
  let takeawayOrders = 0;
  let deliveryOrders = 0;
  const productCount = {};

  Object.values(daysMap || {}).forEach((dayData) => {
    totalProfit += dayData.totalProfit || 0;
    totalOrders += (dayData.orders || []).length;
    (dayData.orders || []).forEach((o) => {
      orders.push({ ...o, closedAt: o.closedAt || null });
      const type = inferArchiveOrderType(o);
      if (type === 'TAKEAWAY') takeawayOrders += 1;
      else if (type === 'DELIVERY') deliveryOrders += 1;
      else dineInOrders += 1;
    });
    (dayData.orders || []).forEach((o) => {
      (o.items || []).forEach((it) => {
        const name = it.name || '';
        productCount[name] = (productCount[name] || 0) + (it.qty || 1);
      });
    });
  });

  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
  const itemsSold = Object.values(productCount).reduce((s, n) => s + n, 0);
  return {
    totalProfit,
    totalOrders,
    dineInOrders,
    takeawayOrders,
    deliveryOrders,
    itemsSold,
    topProduct: top ? top[0] : '',
    topProductCount: top ? top[1] : 0,
    orders: orders.sort((a, b) => (a.closedAt || a.time || '').localeCompare(b.closedAt || b.time || '')),
  };
}

function syncSessionsWithArchive(cafeId) {
  try {
    const historyStore = require('./todaySessionHistory');
    const cid = String(cafeId || '').trim();
    if (!cid) return;
    const sessions = historyStore.readAll().filter((s) => s && String(s.cafeId) === cid);
    sessions.forEach((s) => {
      (s.orders || []).forEach((o) => {
        const orderId = o.orderId || o.displayOrderId || s.displayId;
        const closedAt = o.closedAt || s.paymentAt || s.createdAt || new Date().toISOString();
        const openDate = s.openDate || (closedAt ? closedAt.split('T')[0] : null);
        addOrderToArchive({
          id: orderId,
          cafeId: cid,
          tableId: s.tableId,
          orderType: s.orderType,
          closed: true,
          closedAt: closedAt,
          open_date: openDate,
          items: (o.items || []).map((it) => ({
            name: it.name,
            quantity: it.quantity || 1,
            price: it.price || 0,
          })),
        }, cid);
      });
    });
  } catch (_) {}
}

/**
 * جلب تقرير لكافيه معني حسب الفترة — يقرأ فقط ملف سنة الكافيه ذاته.
 * cafeId: string
 * type: 'day' | 'month' | 'year'
 * dateStr: YYYY-MM-DD | YYYY-MM | YYYY
 */
function getReport(cafeId, type, dateStr) {
  const cid = String(cafeId || '').trim();
  if (!cid || !dateStr || !type) return aggregateDays({});

  syncSessionsWithArchive(cid);

  const parts = dateStr.trim().split('-');
  const year = parts[0];
  if (!year) return aggregateDays({});

  const data = readYearFile(cid, year);
  const months = data.months || {};

  if (type === 'day' && parts.length >= 3) {
    const monthKey = (parts[1] || '').padStart(2, '0');
    const dayKey = (parts[2] || '').length === 1 ? '0' + parts[2] : (parts[2] || '');
    const month = months[monthKey];
    const daysMap = month && month.days && month.days[dayKey]
      ? { [dayKey]: month.days[dayKey] }
      : {};
    return aggregateDays(daysMap);
  }

  if (type === 'month' && parts.length >= 2) {
    const monthKey = (parts[1] || '').padStart(2, '0');
    const month = months[monthKey];
    return aggregateDays(month && month.days ? month.days : {});
  }

  if (type === 'year') {
    const daysMap = {};
    Object.keys(months).forEach((monthKey) => {
      const month = months[monthKey];
      if (month && month.days) {
        Object.keys(month.days).forEach((dayKey) => {
          daysMap[monthKey + '-' + dayKey] = month.days[dayKey];
        });
      }
    });
    return aggregateDays(daysMap);
  }

  return aggregateDays({});
}

/**
 * دالة ملغاة — تُرجع تقريراً فارغاً دائماً لمنع تسرب أي بيانات وهمية.
 */
function getSampleReport(type, dateStr) {
  return aggregateDays({});
}

/** مزامنة الطلبات المغلقة الحالية إلى الأرشيف. */
function syncClosedOrdersToArchive(getOrdersFn) {
  const orders = (getOrdersFn && getOrdersFn()) || [];
  const closed = orders.filter((o) => o.closed && o.closedAt);
  closed.forEach((order) => {
    try {
      addOrderToArchive(order);
    } catch (_) {}
  });
}

module.exports = {
  addOrderToArchive,
  getReport,
  getSampleReport,
  readYearFile,
  syncClosedOrdersToArchive,
};
