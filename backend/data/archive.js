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

  const daysMap = {};
  const ordersById = new Map();

  function addRowToMap(r) {
    const id = String(r.id || '');
    if (!id || ordersById.has(id)) return;

    const items = (r.items || []).map((it) => ({
      name: it.name || '',
      qty: Number(it.qty || it.quantity) || 1,
      price: Number(it.price) || 0,
    }));
    let total = Number(r.total);
    if (Number.isNaN(total) || total == null || total === 0) {
      total = items.reduce((s, it) => s + it.price * it.qty, 0);
    }
    const closedAt = r.closed_at || r.closedAt || r.created_at || r.createdAt || null;
    const createdAt = r.created_at || r.createdAt || closedAt;
    const openDate = r.open_date || r.openDate || (closedAt ? String(closedAt).slice(0, 10) : '');
    const tableId = r.table_id != null ? String(r.table_id) : (r.table != null ? String(r.table) : '');

    const rec = {
      id,
      table: tableId,
      orderType: r.order_type || r.orderType || 'DINE_IN',
      paymentMethod: r.payment_method || r.paymentMethod || 'cash',
      total,
      items,
      time: closedAt ? (typeof closedAt === 'string' ? closedAt.slice(11, 16) : '') : '',
      closedAt,
      createdAt,
      open_date: openDate,
    };
    ordersById.set(id, rec);

    const dayKey = openDate || 'unknown';
    if (!daysMap[dayKey]) {
      daysMap[dayKey] = { totalProfit: 0, totalOrders: 0, topProduct: '', topProductCount: 0, orders: [] };
    }
    daysMap[dayKey].orders.push(rec);
    daysMap[dayKey].totalOrders += 1;
    daysMap[dayKey].totalProfit += rec.total;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (isUuid) {
    try {
      const supabase = getClient();
      const parts = dateStr.trim().split('-');

      let archiveQuery = supabase.from('archive_orders').select('*').eq('cafe_id', cid);
      let ordersQuery = supabase.from('orders').select('*').eq('cafe_id', cid).eq('closed', true);

      if (type === 'day' && parts.length >= 3) {
        archiveQuery = archiveQuery.eq('open_date', dateStr.trim());
        ordersQuery = ordersQuery.eq('open_date', dateStr.trim());
      } else if (type === 'month' && parts.length >= 2) {
        const monthPrefix = `${parts[0]}-${parts[1].padStart(2, '0')}`;
        archiveQuery = archiveQuery.like('open_date', `${monthPrefix}%`);
        ordersQuery = ordersQuery.like('open_date', `${monthPrefix}%`);
      } else if (type === 'year') {
        archiveQuery = archiveQuery.like('open_date', `${parts[0]}%`);
        ordersQuery = ordersQuery.like('open_date', `${parts[0]}%`);
      }

      const [archiveRes, ordersRes] = await Promise.all([
        archiveQuery.catch(() => ({ data: [] })),
        ordersQuery.catch(() => ({ data: [] })),
      ]);

      (archiveRes.data || []).forEach(addRowToMap);
      (ordersRes.data || []).forEach(addRowToMap);
    } catch (err) {
      console.error('[archive] Error fetching report async:', err.message);
    }
  }

  if (ordersById.size === 0) {
    try {
      const store = require('./store');
      let localOrders = [];
      if (type === 'day') {
        localOrders = store.getOrdersClosedByOpenDate(cid, dateStr.trim());
      } else {
        const all = store.getOrders(cid) || [];
        const parts = dateStr.trim().split('-');
        localOrders = all.filter((o) => {
          if (!o || !o.closed) return false;
          const od = o.open_date || (o.closedAt ? String(o.closedAt).slice(0, 10) : '');
          if (!od) return false;
          if (type === 'month') return od.startsWith(`${parts[0]}-${parts[1].padStart(2, '0')}`);
          if (type === 'year') return od.startsWith(parts[0]);
          return false;
        });
      }
      localOrders.forEach(addRowToMap);
    } catch (_) {}
  }

  return aggregateDays(daysMap);
}

function getReport(cafeId, type, dateStr) {
  try {
    const store = require('./store');
    const localOrders = store.getOrdersClosedByOpenDate(cafeId, dateStr);
    if (!localOrders || !localOrders.length) return aggregateDays({});
    const daysMap = {};
    localOrders.forEach((o) => {
      const rec = orderToArchiveRecord(o);
      const dayKey = o.open_date || (o.closedAt ? String(o.closedAt).slice(0, 10) : 'unknown');
      if (!daysMap[dayKey]) {
        daysMap[dayKey] = { totalProfit: 0, totalOrders: 0, topProduct: '', topProductCount: 0, orders: [] };
      }
      daysMap[dayKey].orders.push(rec);
      daysMap[dayKey].totalOrders += 1;
      daysMap[dayKey].totalProfit += rec.total;
    });
    return aggregateDays(daysMap);
  } catch (_) {
    return aggregateDays({});
  }
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
