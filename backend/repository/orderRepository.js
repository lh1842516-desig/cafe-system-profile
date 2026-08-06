'use strict';
/**
 * orderRepository — STEP 2D.6
 *
 * READ operations strategy:
 *   - getOrders(cafeId): Fetches live from Supabase. Falls back to local store cache if offline.
 *   - getOrdersByTable(cafeId, tableId): Fetches live from Supabase. Falls back to local store.
 *   - getOrdersBlockingTableClaim(cafeId, tableId): Fetches live from Supabase. Falls back to local store.
 *   - getAllOrdersForTable(cafeId, tableId): Fetches live from Supabase. Falls back to local store.
 *   - getOrdersClosedToday(cafeId): Fetches live from Supabase. Falls back to local store.
 *   - getOrdersClosedByOpenDate(cafeId, dateStr): Fetches live from Supabase. Falls back to local store.
 *   - getOrderDisplayId(cafeId, seq): Sync utility helper.
 *   - isToday(cafeId, dateStr): Sync utility helper.
 *
 * WRITE operations: unchanged — delegate to store.saveOrders().
 */
const store = require('../data/store');
const { getClient } = require('../lib/supabase');

function orderFromDb(row) {
  return {
    id: row.id,
    cafeId: row.cafe_id,
    cafe_id: row.cafe_id,
    tableId: row.table_id,
    orderType: row.order_type,
    items: row.items || [],
    createdAt: row.created_at,
    open_date: row.open_date,
    cash_session_id: row.cash_session_id,
    tillOpenedAt: row.till_opened_at,
    closed: row.closed,
    closedAt: row.closed_at,
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    customerSessionId: row.customer_session_id,
    customerId: row.customer_id,
    kitchenBatchId: row.kitchen_batch_id,
    bundledCustomerNames: row.bundled_customer_names || [],
    serviceMeta: row.service_meta,
    rejectedByCashier: row.rejected_by_cashier || false,
    cancelReason: row.cancel_reason,
  };
}

async function getOrders(cafeId) {
  const cached = store.getOrders(cafeId);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  if (!cafeId) return store.getOrders(cafeId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId);
    if (error) {
      console.error('[orderRepository] getOrders error:', error.message);
      return store.getOrders(cafeId);
    }
    const mapped = (data || []).map(orderFromDb);
    store.setOrdersCache(mapped);
    return mapped;
  } catch (err) {
    console.error('[orderRepository] getOrders exception:', err.message);
    return store.getOrders(cafeId);
  }
}

async function getOrdersByTable(cafeId, tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return [];
  const cached = store.getOrdersByTable(cafeId, tid);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  if (!cafeId) return store.getOrdersByTable(cafeId, tableId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('table_id', tid);
    if (error) {
      console.error('[orderRepository] getOrdersByTable error:', error.message);
      return store.getOrdersByTable(cafeId, tableId);
    }
    return (data || []).map(orderFromDb);
  } catch (err) {
    console.error('[orderRepository] getOrdersByTable exception:', err.message);
    return store.getOrdersByTable(cafeId, tableId);
  }
}

async function getOrdersBlockingTableClaim(cafeId, tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return [];
  if (!cafeId) return store.getOrdersBlockingTableClaim(cafeId, tableId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('table_id', tid)
      .eq('closed', false);
    if (error) {
      console.error('[orderRepository] getOrdersBlockingTableClaim error:', error.message);
      return store.getOrdersBlockingTableClaim(cafeId, tableId);
    }
    return (data || []).map(orderFromDb);
  } catch (err) {
    console.error('[orderRepository] getOrdersBlockingTableClaim exception:', err.message);
    return store.getOrdersBlockingTableClaim(cafeId, tableId);
  }
}

async function getAllOrdersForTable(cafeId, tableId) {
  return await getOrdersByTable(cafeId, tableId);
}

function getOrderDisplayId(cafeId, seq) {
  return store.getOrderDisplayId(cafeId, seq);
}

function isToday(cafeId, dateStr) {
  return store.isToday(cafeId, dateStr);
}

async function getOrdersClosedToday(cafeId) {
  if (!cafeId) return store.getOrdersClosedToday(cafeId);
  try {
    let today = '';
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' });
      today = formatter.format(new Date());
    } catch (_) {
      const d = new Date(Date.now() + 3 * 3600 * 1000);
      today = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    const supabase = getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('closed', true)
      .eq('open_date', today);
    if (error) {
      console.error('[orderRepository] getOrdersClosedToday error:', error.message);
      return store.getOrdersClosedToday(cafeId);
    }
    return (data || []).map(orderFromDb);
  } catch (err) {
    console.error('[orderRepository] getOrdersClosedToday exception:', err.message);
    return store.getOrdersClosedToday(cafeId);
  }
}

async function getOrdersClosedByOpenDate(cafeId, dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return [];
  if (!cafeId) return store.getOrdersClosedByOpenDate(cafeId, dateStr);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('closed', true)
      .eq('open_date', target);
    if (error) {
      console.error('[orderRepository] getOrdersClosedByOpenDate error:', error.message);
      return store.getOrdersClosedByOpenDate(cafeId, dateStr);
    }
    return (data || []).map(orderFromDb);
  } catch (err) {
    console.error('[orderRepository] getOrdersClosedByOpenDate exception:', err.message);
    return store.getOrdersClosedByOpenDate(cafeId, dateStr);
  }
}

// ── WRITE operations (UNCHANGED — delegate to store) ────────────────────────
async function saveOrders(cafeId, orders) {
  return await store.saveOrders(cafeId, orders);
}

async function getNextOrderSequence(cafeId, openDate) {
  return await store.getNextOrderSequence(cafeId, openDate);
}

async function ensureOrderSequenceAtLeast(cafeId, openDate, minSeq) {
  return await store.ensureOrderSequenceAtLeast(cafeId, openDate, minSeq);
}

module.exports = {
  getOrders,
  getOrdersByTable,
  getOrdersBlockingTableClaim,
  getAllOrdersForTable,
  saveOrders,
  getNextOrderSequence,
  ensureOrderSequenceAtLeast,
  getOrderDisplayId,
  isToday,
  getOrdersClosedToday,
  getOrdersClosedByOpenDate,
};
