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

function getYearFilePath(year) {
  ensureDir(ARCHIVE_DIR);
  return path.join(ARCHIVE_DIR, String(year) + '.json');
}

/** قراءة ملف السنة. إذا لم يوجد يُرجع هيكل فارغ. */
function readYearFile(year) {
  const filePath = getYearFilePath(year);
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

/** كتابة ملف السنة. */
function writeYearFile(year, data) {
  const filePath = getYearFilePath(year);
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

/** إضافة طلب مغلق إلى أرشيف السنة → الشهر → اليوم. */
function addOrderToArchive(order) {
  if (!order.closed || !order.closedAt) return;
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

  const data = readYearFile(year);
  if (!data.months[monthKey]) data.months[monthKey] = { days: {} };
  const month = data.months[monthKey];
  if (!month.days[dayKey]) {
    month.days[dayKey] = { totalProfit: 0, totalOrders: 0, topProduct: '', topProductCount: 0, orders: [] };
  }
  const dayData = month.days[dayKey];
  if (dayData.orders.some((o) => o.id === order.id)) return;

  dayData.orders.push(orderToArchiveRecord(order));
  updateDayStats(dayData);
  writeYearFile(year, data);
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

/**
 * جلب تقرير حسب الفترة — يقرأ فقط ملف السنة المعنية.
 * type: 'day' | 'month' | 'year'
 * dateStr: YYYY-MM-DD | YYYY-MM | YYYY
 */
function getReport(type, dateStr) {
  if (!dateStr || !type) return aggregateDays({});

  const parts = dateStr.trim().split('-');
  const year = parts[0];
  if (!year) return aggregateDays({});

  const data = readYearFile(year);
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
 * بيانات تجريبية للعرض فقط — لا تُحفظ.
 */
function getSampleReport(type, dateStr) {
  const [y, m] = (dateStr || '').split('-');
  const year = y || '2026';
  const month = (m || '01').padStart(2, '0');
  const baseDate = year + '-' + month + '-';
  const sampleOrders = [
    { id: 'sample-1', table: '1', total: 15000, items: [{ name: 'لاتيه', qty: 2, price: 5000 }, { name: 'إسبريسو', qty: 1, price: 5000 }], closedAt: baseDate + '05T10:30:00.000Z' },
    { id: 'sample-2', table: '3', total: 7500, items: [{ name: 'قهوة تركية', qty: 1, price: 2500 }, { name: 'كيك', qty: 1, price: 5000 }], closedAt: baseDate + '05T12:15:00.000Z' },
    { id: 'sample-3', table: '2', total: 5000, items: [{ name: 'إسبريسو', qty: 1, price: 5000 }], closedAt: baseDate + '06T09:00:00.000Z' },
    { id: 'sample-4', table: '5', total: 25000, items: [{ name: 'لاتيه', qty: 3, price: 5000 }, { name: 'عصير برتقال', qty: 2, price: 5000 }], closedAt: baseDate + '07T14:45:00.000Z' },
    { id: 'sample-5', table: '1', total: 10000, items: [{ name: 'كابتشينو', qty: 2, price: 5000 }], closedAt: baseDate + '08T11:20:00.000Z' },
  ];
  const totalProfit = sampleOrders.reduce((s, o) => s + (o.total || 0), 0);
  const productCount = {};
  sampleOrders.forEach((o) => {
    (o.items || []).forEach((it) => {
      const name = it.name || '';
      productCount[name] = (productCount[name] || 0) + (it.qty || 1);
    });
  });
  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
  const itemsSold = Object.values(productCount).reduce((s, n) => s + n, 0);
  let dineInOrders = 0;
  let takeawayOrders = 0;
  let deliveryOrders = 0;
  sampleOrders.forEach((o) => {
    const type = inferArchiveOrderType(o);
    if (type === 'TAKEAWAY') takeawayOrders += 1;
    else if (type === 'DELIVERY') deliveryOrders += 1;
    else dineInOrders += 1;
  });
  return {
    totalProfit,
    totalOrders: sampleOrders.length,
    dineInOrders,
    takeawayOrders,
    deliveryOrders,
    itemsSold,
    topProduct: top ? top[0] : 'لاتيه',
    topProductCount: top ? top[1] : 5,
    orders: sampleOrders,
  };
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
