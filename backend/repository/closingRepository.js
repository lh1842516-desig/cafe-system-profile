'use strict';
/**
 * closingRepository — STEP 2D.3
 *
 * READ operations strategy:
 *   - getClosings(cafeId): Fetches from Supabase 'closings' table.
 *   - getClosingOpenDate(cafeId, dateStr): Pure utility helper.
 *   - getClosingsByOpenDate(cafeId, dateStr): Fetches from Supabase where date/open_date equals dateStr.
 *   - getClosingsByOpenDateRange(cafeId, startDate, endDate): Fetches from Supabase within date range.
 *   - getLastClosing(cafeId): Fetches latest closing from Supabase.
 *   - hasClosingForDate(cafeId, dateStr): Checks existence in Supabase.
 *
 *   All reads fall back to local store array on DB offline.
 *
 * WRITE operations: delegate to store.saveClosings / store.addClosing / etc.
 */
const store = require('../data/store');
const { getClient } = require('../lib/supabase');

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
  };
}

async function getClosings(cafeId) {
  if (!cafeId) return store.getClosings(cafeId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('closings')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('created_at');
    if (error) {
      console.error('[closingRepository] getClosings error:', error.message);
      return store.getClosings(cafeId);
    }
    return (data || []).map(closingFromDb);
  } catch (err) {
    console.error('[closingRepository] getClosings exception:', err.message);
    return store.getClosings(cafeId);
  }
}

function getClosingOpenDate(cafeId, dateStr) {
  return store.getClosingOpenDate(cafeId, dateStr);
}

async function getClosingsByOpenDate(cafeId, dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return [];
  if (!cafeId) return store.getClosingsByOpenDate(cafeId, dateStr);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('closings')
      .select('*')
      .eq('cafe_id', cafeId)
      .or(`date.eq."${target}",open_date.eq."${target}"`);
    if (error) {
      console.error('[closingRepository] getClosingsByOpenDate error:', error.message);
      return store.getClosingsByOpenDate(cafeId, dateStr);
    }
    return (data || []).map(closingFromDb);
  } catch (err) {
    console.error('[closingRepository] getClosingsByOpenDate exception:', err.message);
    return store.getClosingsByOpenDate(cafeId, dateStr);
  }
}

async function getClosingsByOpenDateRange(cafeId, startDate, endDate) {
  const start = String(startDate || '').trim();
  const end = String(endDate || '').trim();
  if (!start || !end) return [];
  if (!cafeId) return store.getClosingsByOpenDateRange(cafeId, startDate, endDate);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('closings')
      .select('*')
      .eq('cafe_id', cafeId)
      .gte('open_date', start)
      .lte('open_date', end);
    if (error) {
      console.error('[closingRepository] getClosingsByOpenDateRange error:', error.message);
      return store.getClosingsByOpenDateRange(cafeId, startDate, endDate);
    }
    return (data || []).map(closingFromDb);
  } catch (err) {
    console.error('[closingRepository] getClosingsByOpenDateRange exception:', err.message);
    return store.getClosingsByOpenDateRange(cafeId, startDate, endDate);
  }
}

async function getLastClosing(cafeId) {
  if (!cafeId) return store.getLastClosing(cafeId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('closings')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[closingRepository] getLastClosing error:', error.message);
      return store.getLastClosing(cafeId);
    }
    if (!data || data.length === 0) return null;
    return closingFromDb(data[0]);
  } catch (err) {
    console.error('[closingRepository] getLastClosing exception:', err.message);
    return store.getLastClosing(cafeId);
  }
}

async function hasClosingForDate(cafeId, dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return false;
  if (!cafeId) return store.hasClosingForDate(cafeId, dateStr);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('closings')
      .select('id')
      .eq('cafe_id', cafeId)
      .eq('open_date', target)
      .limit(1);
    if (error) {
      console.error('[closingRepository] hasClosingForDate error:', error.message);
      return store.hasClosingForDate(cafeId, dateStr);
    }
    return data && data.length > 0;
  } catch (err) {
    console.error('[closingRepository] hasClosingForDate exception:', err.message);
    return store.hasClosingForDate(cafeId, dateStr);
  }
}

// ── WRITE operations ─────────────────────────────────────────────────────────
async function saveClosings(cafeId, closings) {
  return await store.saveClosings(cafeId, closings);
}

async function addClosing(cafeId, closingData) {
  return await store.addClosing(cafeId, closingData);
}

async function clearClosedOrdersForDate(cafeId, dateStr) {
  return await store.clearClosedOrdersForDate(cafeId, dateStr);
}

async function purgeOrdersForTillSession(cafeId, tillSessionId) {
  return await store.purgeOrdersForTillSession(cafeId, tillSessionId);
}

async function addTillClosing(cafeId, closingData, salesCash, salesCard) {
  return await store.addTillClosing(cafeId, closingData, salesCash, salesCard);
}

module.exports = {
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
};
