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

// ── In-memory cache ────────────────────────────────────────────────────────
let _cafeId = null;
let _menu = [];
let _orders = [];
let _tables = [];
let _closings = [];
let _sequences = {}; // { [openDate]: lastSeq }

// ── Legacy JSON helpers (kept for archive.js, todaySessionHistory.js, etc.) ─
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson(filePath, defaultValue = []) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) return defaultValue;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return defaultValue; }
}
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── DB → JS mappers ────────────────────────────────────────────────────────
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
    cafe_id: _cafeId,
    table_id: order.tableId || null,
    order_type: order.orderType || 'DINE_IN',
    items: order.items || [],
    created_at: order.createdAt || new Date().toISOString(),
    open_date: order.open_date || null,
    cash_session_id: order.cash_session_id || null,
    till_opened_at: order.tillOpenedAt || null,
    closed: order.closed || false,
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
    // legacy fields
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

// ── Migration from JSON files (first-run only) ─────────────────────────────
async function migrateFromJsonIfNeeded() {
  const supabase = getClient();
  const { data: chk } = await supabase
    .from('menu_items').select('id').eq('cafe_id', _cafeId).limit(1);
  if (chk && chk.length > 0) return; // already migrated

  console.log('  [store] Migrating data from JSON files...');

  // Menu
  try {
    const menuJson = readJson(path.join(DATA_DIR, 'menu.json'), []);
    if (menuJson.length) {
      const { error } = await supabase.from('menu_items').upsert(
        menuJson.map(item => menuItemToDb({ ...item, isAvailable: item.isAvailable !== false })),
        { onConflict: 'id,cafe_id' }
      );
      if (error) console.warn('[store] menu migration:', error.message);
      else console.log(`  [store] migrated ${menuJson.length} menu items`);
    }
  } catch (e) { console.warn('[store] menu migration error:', e.message); }

  // Tables
  try {
    const def = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
    const tablesJson = readJson(path.join(DATA_DIR, 'tables.json'), def);
    if (tablesJson.length) {
      await supabase.from('cafe_tables').upsert(
        tablesJson.map(t => tableToDb(t)),
        { onConflict: 'id,cafe_id' }
      );
      console.log(`  [store] migrated ${tablesJson.length} tables`);
    }
  } catch (e) { console.warn('[store] tables migration error:', e.message); }

  // Orders
  try {
    const ordersJson = readJson(path.join(DATA_DIR, 'orders.json'), []);
    if (ordersJson.length) {
      for (let i = 0; i < ordersJson.length; i += 50) {
        const chunk = ordersJson.slice(i, i + 50);
        await supabase.from('orders').upsert(
          chunk.map(o => orderToDb({
            ...o,
            tableId: o.tableId || o.table_id,
            orderType: o.orderType || o.order_type || 'DINE_IN',
            createdAt: o.createdAt || o.created_at,
            closedAt: o.closedAt || o.closed_at,
            paymentMethod: o.paymentMethod || o.payment_method,
            customerName: o.customerName || o.customer_name,
            customerSessionId: o.customerSessionId || o.customer_session_id,
            kitchenBatchId: o.kitchenBatchId || o.kitchen_batch_id,
            bundledCustomerNames: o.bundledCustomerNames || o.bundled_customer_names || [],
            serviceMeta: o.serviceMeta || o.service_meta,
            rejectedByCashier: o.rejectedByCashier || o.rejected_by_cashier || false,
            cancelReason: o.cancelReason || o.cancel_reason,
          })),
          { onConflict: 'id,cafe_id' }
        );
      }
      console.log(`  [store] migrated ${ordersJson.length} orders`);
    }
  } catch (e) { console.warn('[store] orders migration error:', e.message); }

  // Closings
  try {
    const closingsJson = readJson(path.join(DATA_DIR, 'closings.json'), []);
    if (closingsJson.length) {
      await supabase.from('closings').upsert(
        closingsJson.map(c => closingToDb({
          ...c,
          salesCash: c.salesCash || 0,
          salesCard: c.salesCard || 0,
          openedAt: c.openedAt || null,
          openedBy: c.openedBy || '',
          closedAt: c.closedAt || null,
          closedBy: c.closedBy || '',
        })),
        { onConflict: 'cafe_id,date' }
      );
      console.log(`  [store] migrated ${closingsJson.length} closings`);
    }
  } catch (e) { console.warn('[store] closings migration error:', e.message); }

  // Order sequences
  try {
    const seqJson = readJson(path.join(DATA_DIR, 'orderSequence.json'), {});
    const lastByOpenDate = (seqJson.lastByOpenDate || {});
    const entries = Object.entries(lastByOpenDate);
    if (entries.length) {
      await supabase.from('order_sequences').upsert(
        entries.map(([open_date, last_sequence]) => ({
          cafe_id: _cafeId,
          open_date,
          last_sequence: Number(last_sequence) || 0,
        })),
        { onConflict: 'cafe_id,open_date' }
      );
    }
  } catch (e) { console.warn('[store] sequences migration error:', e.message); }

  console.log('  [store] Migration complete');
}

// ── Load from Supabase into cache ──────────────────────────────────────────
async function loadFromSupabase() {
  const supabase = getClient();
  const [menuRes, ordersRes, tablesRes, closingsRes, seqRes] = await Promise.all([
    supabase.from('menu_items').select('*').eq('cafe_id', _cafeId).order('sort_order').order('created_at'),
    supabase.from('orders').select('*').eq('cafe_id', _cafeId),
    supabase.from('cafe_tables').select('*').eq('cafe_id', _cafeId),
    supabase.from('closings').select('*').eq('cafe_id', _cafeId).order('created_at'),
    supabase.from('order_sequences').select('*').eq('cafe_id', _cafeId),
  ]);

  _menu = (menuRes.data || []).map(menuItemFromDb);
  _orders = (ordersRes.data || []).map(orderFromDb);
  _tables = (tablesRes.data || []).map(tableFromDb);
  _closings = (closingsRes.data || []).map(closingFromDb);
  _sequences = {};
  (seqRes.data || []).forEach(row => { _sequences[row.open_date] = row.last_sequence; });

  // If tables empty, create defaults
  if (_tables.length === 0) {
    const defaults = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
    await supabase.from('cafe_tables').upsert(defaults.map(tableToDb), { onConflict: 'id,cafe_id' });
    _tables = defaults;
  }

  console.log(`  [store] ${_menu.length} menu items, ${_orders.length} orders, ${_tables.length} tables, ${_closings.length} closings`);
}

// ── Public init ────────────────────────────────────────────────────────────
async function initStore(cafeId) {
  _cafeId = cafeId;
  await migrateFromJsonIfNeeded();
  await loadFromSupabase();
}

// ── MENU (sync reads, async writes) ───────────────────────────────────────
function getMenu() { return _menu; }

function getMenuItem(id) {
  if (id == null || id === '') return null;
  const direct = _menu.find(item => item.id === id);
  if (direct) return direct;
  const s = String(id);
  return _menu.find(item => String(item.id) === s) || null;
}

async function saveMenu(menu) {
  _menu = [...menu];
  if (!_cafeId) return;
  const supabase = getClient();
  try {
    if (menu.length > 0) {
      const { error } = await supabase.from('menu_items').upsert(
        menu.map(menuItemToDb),
        { onConflict: 'id,cafe_id' }
      );
      if (error) throw error;
    }
    // Delete removed items
    const { data: dbItems } = await supabase.from('menu_items').select('id').eq('cafe_id', _cafeId);
    if (dbItems && dbItems.length > 0) {
      const currentIds = new Set(menu.map(i => i.id));
      const toDelete = dbItems.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('menu_items').delete().in('id', toDelete).eq('cafe_id', _cafeId);
      }
    }
  } catch (err) {
    console.error('[store] saveMenu error:', err.message);
  }
}

// ── ORDERS (sync reads, async writes) ────────────────────────────────────
function getOrders() { return _orders; }

function getOrdersByTable(tableId) {
  const tid = String(tableId == null ? '' : tableId).trim();
  return _orders.filter(o => String(o.tableId == null ? '' : o.tableId).trim() === tid && o.closed !== true);
}

const { isOrderKitchenCompleted } = require('./kitchen');
function getOrdersBlockingTableClaim(tableId) {
  return getOrdersByTable(tableId).filter(o => !isOrderKitchenCompleted(o.id));
}
function getAllOrdersForTable(tableId) {
  return _orders.filter(o => o.tableId === tableId);
}

async function saveOrders(orders) {
  _orders = [...orders];
  if (!_cafeId) return;
  const supabase = getClient();
  try {
    if (orders.length > 0) {
      const { error } = await supabase.from('orders').upsert(
        orders.map(orderToDb),
        { onConflict: 'id,cafe_id' }
      );
      if (error) throw error;
    }
    // Delete removed orders
    const { data: dbOrders } = await supabase.from('orders').select('id').eq('cafe_id', _cafeId);
    if (dbOrders && dbOrders.length > 0) {
      const currentIds = new Set(orders.map(o => o.id));
      const toDelete = dbOrders.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('orders').delete().in('id', toDelete).eq('cafe_id', _cafeId);
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

function getTables() {
  return _tables.map(t => normalizeTableRow(t)).filter(t => t.id);
}

async function saveTables(tables) {
  const list = (Array.isArray(tables) ? tables : [])
    .map(t => normalizeTableRow(t))
    .filter(t => t.id);
  _tables = list;
  if (!_cafeId) return;
  const supabase = getClient();
  try {
    if (list.length > 0) {
      await supabase.from('cafe_tables').upsert(list.map(tableToDb), { onConflict: 'id,cafe_id' });
    }
    // Delete removed tables
    const { data: dbTables } = await supabase.from('cafe_tables').select('id').eq('cafe_id', _cafeId);
    if (dbTables && dbTables.length > 0) {
      const currentIds = new Set(list.map(t => t.id));
      const toDelete = dbTables.map(r => r.id).filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from('cafe_tables').delete().in('id', toDelete).eq('cafe_id', _cafeId);
      }
    }
  } catch (err) {
    console.error('[store] saveTables error:', err.message);
  }
  return getTables();
}

function getNextTableId() {
  let maxNum = 0;
  _tables.forEach(t => {
    const n = parseInt(String(t.id || ''), 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  });
  return String(maxNum + 1);
}

// ── ORDER SEQUENCES (async) ────────────────────────────────────────────────
function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function getNextOrderSequence(openDate) {
  const normalized = String(openDate || '').trim() || getTodayDateStr();
  const current = typeof _sequences[normalized] === 'number' ? _sequences[normalized] : 0;
  const next = current + 1;
  _sequences[normalized] = next;
  // Fire-and-forget persist (sequence is low-stakes)
  if (_cafeId) {
    const supabase = getClient();
    supabase.from('order_sequences').upsert(
      [{ cafe_id: _cafeId, open_date: normalized, last_sequence: next }],
      { onConflict: 'cafe_id,open_date' }
    ).then(({ error }) => {
      if (error) console.error('[store] sequence persist error:', error.message);
    });
  }
  return next;
}

async function ensureOrderSequenceAtLeast(openDate, minSeq) {
  const normalized = String(openDate || '').trim() || getTodayDateStr();
  if (typeof minSeq !== 'number' || minSeq < 1) return;
  const cur = typeof _sequences[normalized] === 'number' ? _sequences[normalized] : 0;
  if (minSeq > cur) {
    _sequences[normalized] = minSeq;
    if (_cafeId) {
      const supabase = getClient();
      supabase.from('order_sequences').upsert(
        [{ cafe_id: _cafeId, open_date: normalized, last_sequence: minSeq }],
        { onConflict: 'cafe_id,open_date' }
      ).then(({ error }) => {
        if (error) console.error('[store] sequence ensure error:', error.message);
      });
    }
  }
}

// ── ORDER DISPLAY ID ────────────────────────────────────────────────────────
function getOrderDisplayId(id) {
  if (id == null || typeof id !== 'string') return '—';
  const s = id.trim();
  if (/^T\d+-\d{1,}$/.test(s)) return s;
  if (/^K-\d{1,}$/.test(s)) return s;
  if (/^D-\d{1,}$/.test(s)) return s;
  return '—';
}

// ── DATE HELPERS ───────────────────────────────────────────────────────────
function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function getOrdersClosedToday() { return _orders.filter(o => o.closed && isToday(o.closedAt)); }
function getOrdersClosedByOpenDate(openDate) {
  const want = String(openDate || '').trim();
  if (!want) return [];
  return _orders.filter(o => {
    if (!o || o.closed !== true) return false;
    if (o.open_date) return String(o.open_date).trim() === want;
    if (!o.closedAt) return false;
    const d = new Date(o.closedAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') === want;
  });
}

// ── CLOSINGS (sync reads, async writes) ───────────────────────────────────
function getClosings() { return _closings; }

async function saveClosings(closings) {
  _closings = [...closings];
}

function getClosingOpenDate(c) {
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

function getClosingsByOpenDate(dateStr) {
  const normalized = String(dateStr || '').trim();
  if (!normalized) return [];
  return _closings.filter(c => getClosingOpenDate(c) === normalized);
}

function getClosingsByOpenDateRange(startStr, endStr) {
  const start = String(startStr || '').trim();
  const end = String(endStr || '').trim();
  if (!start || !end) return [];
  return _closings.filter(c => {
    const openDate = getClosingOpenDate(c);
    if (!openDate) return false;
    return openDate >= start && openDate <= end;
  });
}

function getLastClosing() {
  if (_closings.length === 0) return null;
  const c = _closings[_closings.length - 1];
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

function hasClosingForDate(dateStr) {
  return _closings.some(c => String(c.date) === String(dateStr));
}

async function addClosing(obj) {
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
  _closings.push(record);
  if (_cafeId) {
    const supabase = getClient();
    try {
      await supabase.from('closings').insert([closingToDb(record)]);
    } catch (err) {
      console.error('[store] addClosing error:', err.message);
    }
  }
  return record;
}

async function addTillClosing(till, salesCash, salesCard) {
  const totalSales = (Number(salesCash) || 0) + (Number(salesCard) || 0);
  const expensesList = Array.isArray(till.expenses) ? till.expenses : [];
  const withdrawalsList = Array.isArray(till.withdrawals) ? till.withdrawals : [];
  const totalExpenses = expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWithdrawals = withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const openingBalance = Number(till.openingBalance) || 0;
  const net = openingBalance + totalSales - totalExpenses - totalWithdrawals;
  const closedAtDate = till.closedAt ? new Date(till.closedAt) : new Date();
  const openedAtDate = till.openedAt ? new Date(till.openedAt) : closedAtDate;
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = openedAtDate.getFullYear() + '-' + pad2(openedAtDate.getMonth() + 1) + '-' + pad2(openedAtDate.getDate());
  const record = {
    date: String(dateStr || till.date || ''),
    open_date: String(dateStr || till.open_date || till.date || ''),
    open_time: pad2(openedAtDate.getHours()) + ':' + pad2(openedAtDate.getMinutes()),
    close_time: pad2(closedAtDate.getHours()) + ':' + pad2(closedAtDate.getMinutes()),
    time: pad2(closedAtDate.getHours()) + ':' + pad2(closedAtDate.getMinutes()),
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
  _closings.push(record);
  if (_cafeId) {
    const supabase = getClient();
    try {
      await supabase.from('closings').insert([closingToDb(record)]);
    } catch (err) {
      console.error('[store] addTillClosing error:', err.message);
    }
  }
  return record;
}

async function clearClosedOrdersForDate(dateStr) {
  if (!dateStr) return;
  const normalized = String(dateStr).trim();
  const filtered = _orders.filter(o => {
    if (!o.closed || !o.closedAt) return true;
    const d = new Date(o.closedAt);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return ds !== normalized;
  });
  if (filtered.length !== _orders.length) await saveOrders(filtered);
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

async function purgeOrdersForTillSession(closedTill) {
  if (!closedTill || !closedTill.openedAt) return;
  const { addOrderToArchive } = require('./archive');
  const sessionOpenedAt = closedTill.openedAt;
  const closedAtIso = closedTill.closedAt || new Date().toISOString();
  const filtered = _orders.filter(o => {
    if (o.closed !== true) {
      const snap = Object.assign({}, o, { closed: true, closedAt: closedAtIso, paymentMethod: o.paymentMethod || 'cash' });
      addOrderToArchive(snap); // sync JSON call
      return false;
    }
    if (orderBelongsToTillSession(o, sessionOpenedAt, closedAtIso)) return false;
    return true;
  });
  if (filtered.length !== _orders.length) await saveOrders(filtered);
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  initStore,
  getMenu, getMenuItem, saveMenu,
  getOrders, getOrdersByTable, getOrdersBlockingTableClaim, getAllOrdersForTable, saveOrders,
  getTables, saveTables, getNextTableId,
  getClosings, saveClosings, addClosing, getClosingOpenDate,
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
