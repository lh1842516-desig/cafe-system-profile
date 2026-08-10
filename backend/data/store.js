/**
 * Data store — Phase 1: Supabase-backed with in-memory cache.
 * Reads are SYNC (from in-memory cache); writes are ASYNC (cache + Supabase).
 * initStore(cafeId) must be called before using any function.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getClient } = require('../lib/supabase');

// ── In-memory cache (per-cafe multi-tenant isolated map) ─────────────────
let _cafeId = null;
const _storesByCafe = {};

function getCafeStore(cafeId) {
  const cid = String(cafeId || _cafeId || 'default').trim();
  if (!_storesByCafe[cid]) {
    _storesByCafe[cid] = {
      menu: [],
      orders: [],
      tables: [],
      closings: [],
      sequences: {},
    };
  }
  return _storesByCafe[cid];
}

function ensureDir(dir) { }
function readJson(filePath, defaultValue = []) { return defaultValue; }
function writeJson(filePath, data) { }
async function migrateFromJsonIfNeeded() { }

// ── DB ↔ JS mappers ────────────────────────────────────────────────────────
function menuItemFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price) || 0,
    category: row.category || '',
    isAvailable: row.is_available !== false,
    imageUrl: row.image_url || '',
    ingredients: row.ingredients || '',
    options: row.options || [],
    createdAt: row.created_at,
  };
}
function menuItemToDb(item) {
  return {
    id: item.id,
    cafe_id: _cafeId,
    name: item.name,
    price: Number(item.price) || 0,
    category: item.category || '',
    is_available: item.isAvailable !== false,
    image_url: item.imageUrl || item.image_url || '',
    ingredients: item.ingredients || '',
    options: item.options || [],
    updated_at: new Date().toISOString(),
  };
}

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
    kitchenBatchId: row.kitchen_batch_id,
    bundledCustomerNames: row.bundled_customer_names || [],
    serviceMeta: row.service_meta,
    rejectedByCashier: row.rejected_by_cashier || false,
    cancelReason: row.cancel_reason,
  };
}
function orderToDb(order) {
  return {
    id: order.id,
    cafe_id: order.cafeId || order.cafe_id || _cafeId,
    table_id: order.tableId || null,
    order_type: order.orderType || 'DINE_IN',
    items: order.items || [],
    created_at: order.createdAt || new Date().toISOString(),
    open_date: order.open_date || null,
    cash_session_id: order.cash_session_id || null,
    till_opened_at: order.tillOpenedAt || null,
    closed: order.closed === true,
    closed_at: order.closedAt || null,
    payment_method: order.paymentMethod || null,
    customer_name: order.customerName || null,
    customer_session_id: order.customerSessionId || null,
    kitchen_batch_id: order.kitchenBatchId || null,
    bundled_customer_names: order.bundledCustomerNames || [],
    service_meta: order.serviceMeta || null,
    rejected_by_cashier: order.rejectedByCashier || false,
    cancel_reason: order.cancelReason || null,
  };
}

function tableFromDb(row) {
  return { id: row.id, label: row.label };
}
function tableToDb(t) {
  const id = String(t && t.id != null ? t.id : '').trim();
  const label = String(t && t.label != null ? t.label : id).trim() || id;
  return { id, cafe_id: _cafeId, label };
}

function closingFromDb(row) {
  return {
    date: row.date,
    open_date: row.open_date,
    open_time: row.open_time,
    close_time: row.close_time,
    time: row.time,
    openedAt: row.opened_at,
    openedBy: row.opened_by || '',
    closedAt: row.closed_at,
    closedBy: row.closed_by || '',
    openingBalance: Number(row.opening_balance) || 0,
    salesCash: Number(row.sales_cash) || 0,
    salesCard: Number(row.sales_card) || 0,
    totalSales: Number(row.total_sales) || 0,
    expenses: row.expenses || [],
    totalExpenses: Number(row.total_expenses) || 0,
    withdrawals: row.withdrawals || [],
    totalWithdrawals: Number(row.total_withdrawals) || 0,
    net: Number(row.net) || 0,
    netTotal: Number(row.net_total) || 0,
    note: row.note || '',
    orderCount: Number(row.order_count) || 0,
    status: row.status || 'closed',
    totalSales_legacy: Number(row.total_sales) || 0,
  };
}
function closingToDb(c) {
  const totalSales = (Number(c.salesCash) || 0) + (Number(c.salesCard) || 0) || Number(c.totalSales) || 0;
  const expensesList = Array.isArray(c.expenses) ? c.expenses : [];
  const withdrawalsList = Array.isArray(c.withdrawals) ? c.withdrawals : [];
  const totalExpenses = typeof c.totalExpenses === 'number' ? c.totalExpenses :
    expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWithdrawals = typeof c.totalWithdrawals === 'number' ? c.totalWithdrawals :
    withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const net = typeof c.net === 'number' ? c.net :
    (Number(c.openingBalance) || 0) + totalSales - totalExpenses - totalWithdrawals;
  return {
    cafe_id: _cafeId,
    date: c.date || '',
    open_date: c.open_date || c.date || '',
    open_time: c.open_time || '',
    close_time: c.close_time || '',
    time: c.time || '',
    opened_at: c.openedAt || null,
    opened_by: c.openedBy || '',
    closed_at: c.closedAt || null,
    closed_by: c.closedBy || '',
    opening_balance: Number(c.openingBalance) || 0,
    sales_cash: Number(c.salesCash) || 0,
    sales_card: Number(c.salesCard) || 0,
    total_sales: totalSales,
    expenses: expensesList,
    total_expenses: totalExpenses,
    withdrawals: withdrawalsList,
    total_withdrawals: totalWithdrawals,
    net: net,
    net_total: c.netTotal != null ? Number(c.netTotal) : net,
    note: c.note || '',
    order_count: Number(c.orderCount) || 0,
    status: c.status || 'closed',
  };
}

// ── Load from Supabase into cache ──────────────────────────────────────────
async function loadFromSupabase() {
  const supabase = getClient();
  const cid = _cafeId || 'default';
  const cafeStore = getCafeStore(cid);

  const [menuRes, ordersRes, tablesRes, closingsRes, seqRes] = await Promise.all([
    supabase.from('menu_items').select('*').eq('cafe_id', cid).order('sort_order').order('created_at'),
    supabase.from('orders').select('*').eq('cafe_id', cid),
    supabase.from('cafe_tables').select('*').eq('cafe_id', cid),
    supabase.from('closings').select('*').eq('cafe_id', cid).order('created_at'),
    supabase.from('order_sequences').select('*').eq('cafe_id', cid),
  ]);

  cafeStore.menu = (menuRes.data || []).map(menuItemFromDb);
  cafeStore.orders = (ordersRes.data || []).map(orderFromDb);
  cafeStore.tables = (tablesRes.data || []).map(tableFromDb);
  cafeStore.closings = (closingsRes.data || []).map(closingFromDb);
  cafeStore.sequences = {};
  (seqRes.data || []).forEach(row => { cafeStore.sequences[row.open_date] = row.last_sequence; });

  // If tables empty, create defaults
  if (cafeStore.tables.length === 0) {
    const defaults = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
    await supabase.from('cafe_tables').upsert(defaults.map(t => tableToDb({ ...t, cafe_id: cid })), { onConflict: 'id,cafe_id' });
    cafeStore.tables = defaults;
  }

  console.log(`  [store] [${cid}] ${cafeStore.menu.length} menu items, ${cafeStore.orders.length} orders, ${cafeStore.tables.length} tables, ${cafeStore.closings.length} closings`);
}

// ── Public init ────────────────────────────────────────────────────────────
async function initStore(cafeId) {
  _cafeId = cafeId;
  await migrateFromJsonIfNeeded();
  await loadFromSupabase();
}

// ── MENU (sync reads, async writes) ───────────────────────────────────────
function getMenu(cafeId) {
  return getCafeStore(cafeId).menu;
}

/**
 * Updates the in-memory menu cache WITHOUT writing to Supabase.
 * Called by menuRepository after fetching fresh data from Supabase.
 */
function setMenuCache(menu, cafeId) {
  const cafeStore = getCafeStore(cafeId);
  cafeStore.menu = Array.isArray(menu) ? [...menu] : cafeStore.menu;
}

function getMenuItem(cafeId, id) {
  if (id == null || id === '') return null;
  const menu = getCafeStore(cafeId).menu;
  const direct = menu.find(item => item.id === id);
  if (direct) return direct;
  const s = String(id);
  return menu.find(item => String(item.id) === s) || null;
}

async function saveMenu(cafeId, menu) {
  const targetCafeId = cafeId || _cafeId;
  const cafeStore = getCafeStore(targetCafeId);
  cafeStore.menu = [...menu];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
  if (!targetCafeId || !isUuid) return;
  const supabase = getClient();
  try {
    if (menu.length > 0) {
      const { error } = await supabase.from('menu_items').upsert(
        menu.map(item => ({ ...menuItemToDb(item), cafe_id: targetCafeId })),
        { onConflict: 'id,cafe_id' }
      );
      if (error) throw error;
    }
    // Delete removed items
    const { data: dbItems } = await supabase.from('menu_items').select('id').eq('cafe_id', targetCafeId);
    if (dbItems && dbItems.length > 0) {
      const currentIds = new Set(menu.map(i => i.id));
      const toDelete = dbItems.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('menu_items').delete().in('id', toDelete).eq('cafe_id', targetCafeId);
      }
    }
  } catch (err) {
    console.error('[store] saveMenu error:', err.message);
  }
}

// ── ORDERS (sync reads, async writes) ────────────────────────────────────
function getOrders(cafeId) {
  return getCafeStore(cafeId).orders;
}

/**
 * Updates the in-memory orders cache WITHOUT writing to Supabase.
 * Called by orderRepository after fetching fresh data from Supabase.
 */
function setOrdersCache(orders, cafeId) {
  const cafeStore = getCafeStore(cafeId);
  if (Array.isArray(orders)) cafeStore.orders = [...orders];
}

function getOrdersByTable(cafeId, tableId) {
  const tid = String(tableId == null ? '' : tableId).trim();
  const orders = getCafeStore(cafeId).orders;
  return orders.filter(o => String(o.tableId == null ? '' : o.tableId).trim() === tid && o.closed !== true);
}

const { isOrderKitchenCompleted } = require('./kitchen');
function getOrdersBlockingTableClaim(cafeId, tableId) {
  return getOrdersByTable(cafeId, tableId).filter(o => !isOrderKitchenCompleted(o.id));
}
function getAllOrdersForTable(cafeId, tableId) {
  const orders = getCafeStore(cafeId).orders;
  return orders.filter(o => o.tableId === tableId);
}

async function saveOrders(cafeId, orders) {
  const targetCafeId = cafeId || _cafeId;
  const cafeStore = getCafeStore(targetCafeId);
  cafeStore.orders = [...orders];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
  if (!targetCafeId || !isUuid) return;
  const supabase = getClient();
  try {
    if (orders.length > 0) {
      const { error } = await supabase.from('orders').upsert(
        orders.map(order => ({ ...orderToDb(order), cafe_id: targetCafeId })),
        { onConflict: 'id,cafe_id' }
      );
      if (error) throw error;
    }
    // Delete removed orders
    const { data: dbOrders } = await supabase.from('orders').select('id').eq('cafe_id', targetCafeId);
    if (dbOrders && dbOrders.length > 0) {
      const currentIds = new Set(orders.map(o => o.id));
      const toDelete = dbOrders.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('orders').delete().in('id', toDelete).eq('cafe_id', targetCafeId);
      }
    }
  } catch (err) {
    console.error('[store] saveOrders error:', err.message);
  }
}

// ── TABLES (sync reads, async writes) ────────────────────────────────────
function normalizeTableRow(t) {
  const id = String(t && t.id != null ? t.id : '').trim();
  const label = String(t && t.label != null ? t.label : id).trim() || id;
  return { id, label };
}

function getTables(cafeId) {
  return getCafeStore(cafeId).tables.map(t => normalizeTableRow(t)).filter(t => t.id);
}

/**
 * Updates the in-memory tables cache WITHOUT writing to Supabase.
 * Called by tableRepository after fetching fresh data from Supabase.
 */
function setTablesCache(tables, cafeId) {
  if (Array.isArray(tables)) {
    const cafeStore = getCafeStore(cafeId);
    cafeStore.tables = tables.map(t => normalizeTableRow(t)).filter(t => t.id);
  }
}

async function saveTables(cafeId, tables) {
  const list = (Array.isArray(tables) ? tables : [])
    .map(t => normalizeTableRow(t))
    .filter(t => t.id);
  const targetCafeId = cafeId || _cafeId;
  const cafeStore = getCafeStore(targetCafeId);
  cafeStore.tables = list;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
  if (!targetCafeId || !isUuid) return getTables(targetCafeId);
  const supabase = getClient();
  try {
    if (list.length > 0) {
      await supabase.from('cafe_tables').upsert(
        list.map(t => ({ ...tableToDb(t), cafe_id: targetCafeId })),
        { onConflict: 'id,cafe_id' }
      );
    }
    // Delete removed tables
    const { data: dbTables } = await supabase.from('cafe_tables').select('id').eq('cafe_id', targetCafeId);
    if (dbTables && dbTables.length > 0) {
      const currentIds = new Set(list.map(t => t.id));
      const toDelete = dbTables.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('cafe_tables').delete().in('id', toDelete).eq('cafe_id', targetCafeId);
      }
    }
  } catch (err) {
    console.error('[store] saveTables error:', err.message);
  }
  return getTables(targetCafeId);
}

function getNextTableId(cafeId) {
  let maxNum = 0;
  const tables = getCafeStore(cafeId).tables;
  tables.forEach(t => {
    const n = parseInt(String(t.id || ''), 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1);
}

// ── ORDER SEQUENCES (async) ────────────────────────────────────────────────
function getTodayDateStr(timeZone = 'Asia/Baghdad') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(new Date());
  } catch (_) {
    const d = new Date(Date.now() + 3 * 3600 * 1000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
}

async function getNextOrderSequence(cafeId, openDate) {
  const normalized = String(openDate || '').trim() || getTodayDateStr();
  const sequences = getCafeStore(cafeId).sequences;
  const current = typeof sequences[normalized] === 'number' ? sequences[normalized] : 0;
  const next = current + 1;
  sequences[normalized] = next;
  const targetCafeId = cafeId || _cafeId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
  // Fire-and-forget persist (sequence is low-stakes)
  if (targetCafeId && isUuid) {
    const supabase = getClient();
    supabase.from('order_sequences').upsert(
      [{ cafe_id: targetCafeId, open_date: normalized, last_sequence: next }],
      { onConflict: 'cafe_id,open_date' }
    ).then(({ error }) => {
      if (error) console.error('[store] sequence persist error:', error.message);
    });
  }
  return next;
}

async function ensureOrderSequenceAtLeast(cafeId, openDate, minSeq) {
  const normalized = String(openDate || '').trim() || getTodayDateStr();
  if (typeof minSeq !== 'number' || minSeq < 1) return;
  const sequences = getCafeStore(cafeId).sequences;
  const cur = typeof sequences[normalized] === 'number' ? sequences[normalized] : 0;
  if (minSeq > cur) {
    sequences[normalized] = minSeq;
    const targetCafeId = cafeId || _cafeId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
    if (targetCafeId && isUuid) {
      const supabase = getClient();
      supabase.from('order_sequences').upsert(
        [{ cafe_id: targetCafeId, open_date: normalized, last_sequence: minSeq }],
        { onConflict: 'cafe_id,open_date' }
      ).then(({ error }) => {
        if (error) console.error('[store] sequence ensure error:', error.message);
      });
    }
  }
}

// ── ORDER DISPLAY ID ────────────────────────────────────────────────────────
function getOrderDisplayId(cafeId, id) {
  if (id == null || typeof id !== 'string') return '—';
  const s = id.trim();
  if (/^T\d+-\d{1,}$/.test(s)) return s;
  if (/^K-\d{1,}$/.test(s)) return s;
  if (/^D-\d{1,}$/.test(s)) return s;
  return '—';
}

// ── DATE HELPERS ───────────────────────────────────────────────────────────
function isToday(cafeId, dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function getOrdersClosedToday(cafeId) {
  const orders = getCafeStore(cafeId).orders;
  return orders.filter(o => o.closed && isToday(cafeId, o.closedAt));
}
function getOrdersClosedByOpenDate(cafeId, openDate) {
  const want = String(openDate || '').trim();
  if (!want) return [];
  const orders = getCafeStore(cafeId).orders;
  return orders.filter(o => {
    if (!o || o.closed !== true) return false;
    if (o.open_date) return String(o.open_date).trim() === want;
    if (!o.closedAt) return false;
    const d = new Date(o.closedAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') === want;
  });
}

// ── CLOSINGS (sync reads, async writes) ───────────────────────────────────
function getClosings(cafeId) {
  return getCafeStore(cafeId).closings;
}

function setClosingsCache(closings, cafeId) {
  if (Array.isArray(closings)) {
    getCafeStore(cafeId).closings = [...closings];
  }
}

async function saveClosings(cafeId, closings) {
  getCafeStore(cafeId).closings = [...closings];
}

function getClosingOpenDate(cafeId, c) {
  if (!c) return null;
  if (c.open_date) return String(c.open_date).trim();
  if (c.date) return String(c.date).trim();
  if (c.openedAt) {
    const d = new Date(c.openedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  }
  return null;
}

function getClosingsByOpenDate(cafeId, dateStr) {
  const normalized = String(dateStr || '').trim();
  if (!normalized) return [];
  const closings = getCafeStore(cafeId).closings;
  return closings.filter(c => getClosingOpenDate(cafeId, c) === normalized);
}

function getClosingsByOpenDateRange(cafeId, startStr, endStr) {
  const start = String(startStr || '').trim();
  const end = String(endStr || '').trim();
  if (!start || !end) return [];
  const closings = getCafeStore(cafeId).closings;
  return closings.filter(c => {
    const openDate = getClosingOpenDate(cafeId, c);
    if (!openDate) return false;
    return openDate >= start && openDate <= end;
  });
}

function getLastClosing(cafeId) {
  const closings = getCafeStore(cafeId).closings;
  if (closings.length === 0) return null;
  const c = closings[closings.length - 1];
  const base = {
    date: String(c.date || ''),
    time: String(c.time || ''),
    totalSales: c.totalSales || Number(c.salesCash || 0) + Number(c.salesCard || 0),
    expenses: c.totalExpenses || Number(c.expenses) || 0,
    netTotal: c.netTotal || c.net || 0,
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

function hasClosingForDate(cafeId, dateStr) {
  const closings = getCafeStore(cafeId).closings;
  return closings.some(c => String(c.date) === String(dateStr));
}

async function addClosing(cafeId, obj) {
  const record = {
    date: String(obj.date || ''),
    time: String(obj.time || ''),
    totalSales: Number(obj.totalSales) || 0,
    expenses: Number(obj.expenses) || 0,
    netTotal: obj.netTotal != null ? Number(obj.netTotal) : (Number(obj.totalSales) || 0) - (Number(obj.expenses) || 0),
    note: String(obj.note || ''),
    orderCount: Number(obj.orderCount) || 0,
    status: 'closed',
  };
  const targetCafeId = cafeId || _cafeId;
  getCafeStore(targetCafeId).closings.push(record);
  if (targetCafeId) {
    const supabase = getClient();
    try {
      await supabase.from('closings').insert([closingToDb(record)]);
    } catch (err) {
      console.error('[store] addClosing error:', err.message);
    }
  }
  return record;
}

async function addTillClosing(cafeId, till, salesCash, salesCard) {
  const totalSales = (Number(salesCash) || 0) + (Number(salesCard) || 0);
  const expensesList = Array.isArray(till.expenses) ? till.expenses : [];
  const withdrawalsList = Array.isArray(till.withdrawals) ? till.withdrawals : [];
  const totalExpenses = expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWithdrawals = withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const openingBalance = Number(till.openingBalance) || 0;
  const net = openingBalance + totalSales - totalExpenses - totalWithdrawals;
  const tillData = require('./till');
  const closedAtDate = till.closedAt ? new Date(till.closedAt) : new Date();
  const openedAtDate = till.openedAt ? new Date(till.openedAt) : closedAtDate;
  
  function getTimeStrInTimezone(isoOrDate, timeZone = 'Asia/Baghdad') {
    if (!isoOrDate) return '00:00';
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (Number.isNaN(d.getTime())) return '00:00';
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
      return formatter.format(d);
    } catch (_) {
      const dLocal = new Date(d.getTime() + 3 * 3600 * 1000);
      return String(dLocal.getUTCHours()).padStart(2, '0') + ':' + String(dLocal.getUTCMinutes()).padStart(2, '0');
    }
  }

  const openDateStr = String(till.open_date || till.date || (till.openedAt ? tillData.getOpenDateFromIso(till.openedAt) : tillData.getTodayDateStr()) || '').trim();
  const openTimeStr = getTimeStrInTimezone(till.openedAt || openedAtDate);
  const closeTimeStr = getTimeStrInTimezone(till.closedAt || closedAtDate);

  const record = {
    date: openDateStr,
    open_date: openDateStr,
    open_time: openTimeStr,
    close_time: closeTimeStr,
    time: closeTimeStr,
    openedAt: till.openedAt || openedAtDate.toISOString(),
    openedBy: String(till.openedBy || ''),
    openingBalance,
    salesCash: Number(salesCash) || 0,
    salesCard: Number(salesCard) || 0,
    totalSales,
    expenses: expensesList,
    totalExpenses,
    withdrawals: withdrawalsList,
    totalWithdrawals,
    net,
    netTotal: net,
    note: String(till.note || ''),
    closedAt: till.closedAt || closedAtDate.toISOString(),
    closedBy: String(till.closedBy || ''),
    status: till.status || 'closed',
    orderCount: 0,
  };
  const targetCafeId = cafeId || _cafeId;
  getCafeStore(targetCafeId).closings.push(record);
  if (targetCafeId) {
    const supabase = getClient();
    try {
      await supabase.from('closings').insert([{ ...closingToDb(record), cafe_id: targetCafeId }]);
    } catch (err) {
      console.error('[store] addTillClosing error:', err.message);
    }
  }
  return record;
}

async function clearClosedOrdersForDate(cafeId, dateStr) {
  if (!dateStr) return;
  const targetCafeId = cafeId || _cafeId;
  const orders = getCafeStore(targetCafeId).orders;
  const normalized = String(dateStr).trim();
  const filtered = orders.filter(o => {
    if (!o.closed || !o.closedAt) return true;
    const d = new Date(o.closedAt);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return ds !== normalized;
  });
  if (filtered.length !== orders.length) await saveOrders(targetCafeId, filtered);
}

function orderBelongsToTillSession(o, sessionOpenedAt, closedAtIso) {
  const session = String(sessionOpenedAt);
  if (o.tillOpenedAt != null) return String(o.tillOpenedAt) === session;
  if (!o.createdAt) return false;
  const created = new Date(o.createdAt).getTime();
  const opened = new Date(session).getTime();
  const closed = closedAtIso ? new Date(closedAtIso).getTime() : Date.now();
  return created >= opened && created <= closed;
}

async function purgeOrdersForTillSession(cafeId, closedTill) {
  if (!closedTill || !closedTill.openedAt) return;
  const targetCafeId = cafeId || _cafeId;
  const orders = getCafeStore(targetCafeId).orders;
  const { addOrderToArchive } = require('./archive');
  const sessionOpenedAt = closedTill.openedAt;
  const closedAtIso = closedTill.closedAt || new Date().toISOString();
  const filtered = orders.filter(o => {
    if (o.closed !== true) {
      const snap = Object.assign({}, o, { closed: true, closedAt: closedAtIso, paymentMethod: o.paymentMethod || 'cash' });
      addOrderToArchive(snap); // sync JSON call
      return false;
    }
    if (orderBelongsToTillSession(o, sessionOpenedAt, closedAtIso)) return false;
    return true;
  });
  if (filtered.length !== orders.length) await saveOrders(targetCafeId, filtered);
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  initStore,
  getMenu, getMenuItem, setMenuCache, saveMenu,
  getOrders, setOrdersCache, getOrdersByTable, getOrdersBlockingTableClaim, getAllOrdersForTable, saveOrders,
  getTables, setTablesCache, saveTables, getNextTableId,
  getClosings, setClosingsCache, saveClosings, addClosing, getClosingOpenDate,
  getClosingsByOpenDate, getClosingsByOpenDateRange, getLastClosing,
  hasClosingForDate, clearClosedOrdersForDate, purgeOrdersForTillSession, addTillClosing,
  getNextOrderSequence, ensureOrderSequenceAtLeast, getOrderDisplayId,
  isToday, getOrdersClosedToday, getOrdersClosedByOpenDate,
  // legacy helpers (used by other JSON-based services)
  readJson, writeJson,
  MENU_FILE: path.join(DATA_DIR, 'menu.json'),
  ORDERS_FILE: path.join(DATA_DIR, 'orders.json'),
  TABLES_FILE: path.join(DATA_DIR, 'tables.json'),
  CLOSINGS_FILE: path.join(DATA_DIR, 'closings.json'),
};
