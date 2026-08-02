/**
 * أرشيف الطلبات — Supabase Single Source of Truth
 * الهيكل: سنة → أشهر (01..12) → أيام (01..31) مع الطلبات والإحصائيات.
 */
'use strict';
const { getClient } = require('../lib/supabase');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function orderToArchiveRecord(order) {
  const items = (order.items || []).map((it) => ({
    name: it.name,
    qty: it.quantity || it.qty || 1,
    price: it.price || 0,
  }));
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  const d = order.closedAt ? new Date(order.closedAt) : new Date();
  const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const tableId = order.tableId != null ? String(order.tableId) : (order.table != null ? String(order.table) : '');
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

async function addOrderToArchive(order) {
  if (!order || !order.closed || !order.closedAt) return;
  const cafeId = String(order.cafeId || order.cafe_id || '').trim();
  if (!cafeId) return;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
  if (!isUuid) return;

  const rec = orderToArchiveRecord(order);
  const openDate = order.open_date || new Date(order.closedAt).toISOString().slice(0, 10);

  try {
    const supabase = getClient();
    await supabase.from('archive_orders').upsert([{
      id: String(order.id),
      cafe_id: cafeId,
      table_id: rec.table,
      order_type: rec.orderType,
      items: rec.items,
      open_date: openDate,
      closed_at: order.closedAt,
      total: rec.total,
      archived_at: new Date().toISOString()
    }], { onConflict: 'id,cafe_id' });
  } catch (err) {
    console.error('[archive] Exception adding order to archive:', err.message);
  }
}

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
        productCount[name] = (productCount[name] || 0) + (it.qty || it.quantity || 1);
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

async function getReportAsync(cafeId, type, dateStr) {
  const cid = String(cafeId || '').trim();
  if (!cid || !dateStr || !type) return aggregateDays({});

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (!isUuid) return aggregateDays({});

  try {
    const supabase = getClient();
    let query = supabase.from('archive_orders').select('*').eq('cafe_id', cid);

    const parts = dateStr.trim().split('-');
    if (type === 'day' && parts.length >= 3) {
      query = query.eq('open_date', dateStr.trim());
    } else if (type === 'month' && parts.length >= 2) {
      const monthPrefix = `${parts[0]}-${parts[1].padStart(2, '0')}`;
      query = query.like('open_date', `${monthPrefix}%`);
    } else if (type === 'year') {
      query = query.like('open_date', `${parts[0]}%`);
    }

    const { data: rows, error } = await query;
    if (error || !rows) return aggregateDays({});

    const daysMap = {};
    rows.forEach(r => {
      const dayKey = r.open_date || (r.closed_at ? r.closed_at.slice(0, 10) : 'unknown');
      if (!daysMap[dayKey]) {
        daysMap[dayKey] = { totalProfit: 0, totalOrders: 0, topProduct: '', topProductCount: 0, orders: [] };
      }
      const rec = {
        id: r.id,
        table: r.table_id || '',
        orderType: r.order_type || 'DINE_IN',
        total: Number(r.total) || 0,
        items: (r.items || []).map(it => ({ name: it.name, qty: it.qty || it.quantity || 1, price: it.price || 0 })),
        time: r.closed_at ? r.closed_at.slice(11, 16) : '',
        closedAt: r.closed_at
      };
      daysMap[dayKey].orders.push(rec);
      daysMap[dayKey].totalOrders += 1;
      daysMap[dayKey].totalProfit += rec.total;
    });

    return aggregateDays(daysMap);
  } catch (err) {
    console.error('[archive] Error fetching report:', err.message);
    return aggregateDays({});
  }
}

function getReport(cafeId, type, dateStr) {
  // Return empty default synchronously for immediate response if sync called, but getReportAsync is available
  return aggregateDays({});
}

function getSampleReport(type, dateStr) {
  return aggregateDays({});
}

function readYearFile(cafeId, year) {
  return { year: Number(year), months: {} };
}

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
  getReportAsync,
  getSampleReport,
  readYearFile,
  syncClosedOrdersToArchive,
};
