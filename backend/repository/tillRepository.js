'use strict';
/**
 * tillRepository — STEP 2D.5
 *
 * READ operations strategy:
 *   - readCurrentTill(cafeId): Fetches live from Supabase. Falls back to in-memory store if DB is offline.
 *   - ensureTillForToday(cafeId): Awaits readCurrentTill.
 *   - hasTillOpenedOnDate(cafeId, dateStr): Checks live from Supabase. Falls back to in-memory store.
 *   - getSalesToday(cafeId): Awaits readCurrentTill and aggregates sales.
 *   - getSalesForRange(cafeId, startIso, endIso): Queries order sales for range.
 *   - getActiveSessionMeta(cafeId): Awaits readCurrentTill and returns open metadata.
 *
 * WRITE operations: unchanged — delegate to data/till.js.
 */
const till = require('../data/till');
const { getClient } = require('../lib/supabase');

function getOpenDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function tillFromDb(row) {
  const openedAt = row.opened_at || new Date().toISOString();
  const open_date = row.open_date || getOpenDateFromIso(openedAt);
  return {
    date: row.open_date || getOpenDateFromIso(openedAt) || new Date().toISOString().split('T')[0],
    openedAt,
    open_date,
    openingBalance: Number(row.opening_balance) || 0,
    expenses: row.expenses || [],
    withdrawals: row.withdrawals || [],
    closedAt: row.closed_at || null,
    closedBy: row.closed_by || null,
    openedBy: row.opened_by || null,
    status: row.status || 'open',
    note: row.note || '',
  };
}

async function readCurrentTill(cafeId) {
  const local = till.readCurrentTill(cafeId);
  if (local && local.date) {
    return local;
  }
  if (!cafeId) return local;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
  if (!isUuid) return local;
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('till_sessions')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('opened_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) {
      return local;
    }
    const mapped = tillFromDb(data[0]);
    till.setTillCache(mapped, data[0].id);
    return mapped;
  } catch (_) {
    return local;
  }
}

async function ensureTillForToday(cafeId) {
  return await readCurrentTill(cafeId);
}

async function hasTillOpenedOnDate(cafeId, dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return false;
  if (!cafeId) return till.hasTillOpenedOnDate(cafeId, dateStr);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
  if (!isUuid) return till.hasTillOpenedOnDate(cafeId, dateStr);
  try {
    const supabase = getClient();
    const { data: tillRows, error: tillErr } = await supabase
      .from('till_sessions')
      .select('id')
      .eq('cafe_id', cafeId)
      .eq('open_date', target)
      .limit(1);
    if (!tillErr && tillRows && tillRows.length > 0) return true;

    // Check closings table in Supabase
    const { data: closingRows, error: closingErr } = await supabase
      .from('closings')
      .select('id')
      .eq('cafe_id', cafeId)
      .eq('open_date', target)
      .limit(1);
    if (!closingErr && closingRows && closingRows.length > 0) return true;

    return till.hasTillOpenedOnDate(cafeId, dateStr);
  } catch (err) {
    console.error('[tillRepository] hasTillOpenedOnDate exception:', err.message);
    return till.hasTillOpenedOnDate(cafeId, dateStr);
  }
}

async function getSalesToday(cafeId) {
  if (!cafeId) return till.getSalesToday(cafeId);
  try {
    const current = await readCurrentTill(cafeId);
    if (!current || !current.openedAt) return { salesCash: 0, salesCard: 0, total: 0 };
    const openDate = String(current.open_date || current.date || getOpenDateFromIso(current.openedAt) || '').trim();
    const session = {
      sessionId: String(current.openedAt),
      openDate: openDate || null,
      openedAt: String(current.openedAt),
      closedAt: current.closedAt || null,
    };
    const { aggregateSalesForSession } = require('../services/cashSessionHelper');
    return aggregateSalesForSession(cafeId, session);
  } catch (err) {
    console.error('[tillRepository] getSalesToday exception:', err.message);
    return till.getSalesToday(cafeId);
  }
}

async function getSalesForRange(cafeId, startIso, endIso) {
  return till.getSalesForRange(cafeId, startIso, endIso);
}

async function getActiveSessionMeta(cafeId) {
  if (!cafeId) return till.getActiveSessionMeta(cafeId);
  try {
    const t = await readCurrentTill(cafeId);
    if (!t || t.status !== 'open' || !t.openedAt) return null;
    const openDate = String(t.open_date || t.date || getOpenDateFromIso(t.openedAt) || '').trim();
    return {
      sessionId: String(t.openedAt),
      openDate: openDate || null,
      openedAt: String(t.openedAt),
    };
  } catch (err) {
    console.error('[tillRepository] getActiveSessionMeta exception:', err.message);
    return till.getActiveSessionMeta(cafeId);
  }
}

// ── WRITE operations (UNCHANGED — delegate to data/till.js) ──────────────────
async function writeTill(cafeId, tillObj) {
  return await till.writeTill(cafeId, tillObj);
}

async function setOpeningBalance(cafeId, amount) {
  return await till.setOpeningBalance(cafeId, amount);
}

async function addExpense(cafeId, name, amount, note) {
  return await till.addExpense(cafeId, name, amount, note);
}

async function updateExpense(cafeId, id, name, amount, note) {
  return await till.updateExpense(cafeId, id, name, amount, note);
}

async function addWithdrawal(cafeId, amount, note) {
  return await till.addWithdrawal(cafeId, amount, note);
}

async function updateWithdrawal(cafeId, id, amount, note) {
  return await till.updateWithdrawal(cafeId, id, amount, note);
}

async function removeExpense(cafeId, id) {
  return await till.removeExpense(cafeId, id);
}

async function removeWithdrawal(cafeId, id) {
  return await till.removeWithdrawal(cafeId, id);
}

async function setNote(cafeId, note) {
  return await till.setNote(cafeId, note);
}

async function closeTill(cafeId, closedBy) {
  return await till.closeTill(cafeId, closedBy);
}

async function resetTillForNewDay(cafeId, openingBalance, openedBy) {
  return await till.resetTillForNewDay(cafeId, openingBalance, openedBy);
}

module.exports = {
  getTodayDateStr: till.getTodayDateStr,
  getOpenDateFromIso,
  defaultTill: till.defaultTill,
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
};
