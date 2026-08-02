/**
 * Till (cash drawer) — Phase 1: Supabase-backed with in-memory cache.
 * Sync reads; async writes. initTill(cafeId) must be called before use.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getClient } = require('../lib/supabase');

// ── In-memory state ────────────────────────────────────────────────────────
let _cafeId = null;
let _till = null;           // current till object (JS shape)
let _tillSessionId = null;  // UUID of the row in till_sessions

// ── Utility ────────────────────────────────────────────────────────────────
function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getOpenDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function defaultTill(dateStr, openedAt, status) {
  const now = new Date();
  const opened = openedAt === undefined ? now.toISOString() : openedAt;
  const today = getTodayDateStr();
  const openDate = opened ? (dateStr || today) : null;
  return {
    date: dateStr || today,
    openedAt: opened,
    open_date: openDate,
    openingBalance: 0,
    expenses: [],
    withdrawals: [],
    closedAt: null,
    closedBy: null,
    openedBy: null,
    status: status || 'open',
    note: '',
  };
}

// ── DB ↔ JS mappers ────────────────────────────────────────────────────────
function tillFromDb(row) {
  const openedAt = row.opened_at || new Date().toISOString();
  const open_date = row.open_date || getOpenDateFromIso(openedAt);
  return {
    date: row.open_date || getOpenDateFromIso(openedAt) || getTodayDateStr(),
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

function tillToDb(till) {
  return {
    cafe_id: _cafeId,
    status: till.status || 'open',
    opened_at: till.openedAt || new Date().toISOString(),
    closed_at: till.closedAt || null,
    opened_by: till.openedBy || '',
    closed_by: till.closedBy || null,
    opening_balance: Number(till.openingBalance) || 0,
    open_date: till.open_date || till.date || getTodayDateStr(),
    note: till.note || '',
    expenses: till.expenses || [],
    withdrawals: till.withdrawals || [],
  };
}

// ── Init & migration ────────────────────────────────────────────────────────
async function initTill(cafeId) {
  _cafeId = cafeId;
  const supabase = getClient();

  // Load the most recent till session from Supabase
  const { data: rows } = await supabase
    .from('till_sessions')
    .select('*')
    .eq('cafe_id', _cafeId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (rows && rows.length > 0) {
    _till = tillFromDb(rows[0]);
    _tillSessionId = rows[0].id;
    console.log(`  [till] ${_till.status} session loaded (${_till.open_date})`);
  } else {
    const tillData = defaultTill(getTodayDateStr(), null, 'closed');
    const { data: inserted } = await supabase
      .from('till_sessions').insert([tillToDb(tillData)]).select().single();
    if (inserted) {
      _till = tillData;
      _tillSessionId = inserted.id;
    } else {
      _till = tillData;
    }
  }
}

const _tillsByCafe = {};

function getCafeTillState(cafeId) {
  const cid = String(cafeId || _cafeId || 'default').trim();
  if (!_tillsByCafe[cid]) {
    _tillsByCafe[cid] = {
      till: defaultTill(null, null, 'closed'),
      sessionId: null
    };
  }
  return _tillsByCafe[cid];
}

// ── Sync reads ──────────────────────────────────────────────────────────────
function readCurrentTill(cafeId) {
  return getCafeTillState(cafeId).till;
}

function getActiveSessionMeta(cafeId) {
  const t = readCurrentTill(cafeId);
  if (!t || t.status !== 'open' || !t.openedAt) return null;
  const openDate = String(t.open_date || t.date || getOpenDateFromIso(t.openedAt) || '').trim();
  return {
    sessionId: String(t.openedAt),
    openDate: openDate || null,
    openedAt: String(t.openedAt),
  };
}

function hasTillOpenedOnDate(cafeId, dateStr) {
  const target = String(dateStr || '').trim();
  if (!target) return false;
  const current = readCurrentTill(cafeId);
  if (current && current.openedAt) {
    const currentOpenDate = current.open_date || getOpenDateFromIso(current.openedAt);
    if (currentOpenDate === target) return true;
  }
  // Check closings cache safely
  try {
    const store = require('./store');
    const closings = typeof store.getClosings === 'function' ? store.getClosings(cafeId) : [];
    for (const c of closings) {
      const openDate = c.open_date || c.date || (c.openedAt ? getOpenDateFromIso(c.openedAt) : null);
      if (openDate === target) return true;
    }
  } catch (_) {}
  return false;
}

function getSalesToday(cafeId) {
  const till = readCurrentTill(cafeId);
  if (!till || !till.openedAt) return { salesCash: 0, salesCard: 0, total: 0 };
  const openDate = String(till.open_date || till.date || getOpenDateFromIso(till.openedAt) || '').trim();
  const session = {
    sessionId: String(till.openedAt),
    openDate: openDate || null,
    openedAt: String(till.openedAt),
    closedAt: till.closedAt || null,
  };
  const { aggregateSalesForSession } = require('../services/cashSessionHelper');
  return aggregateSalesForSession(cafeId, session);
}

function getSalesForRange(cafeId, startIso, endIso) {
  const { getOrders } = require('./store');
  const orders = getOrders(cafeId);
  const startTs = startIso ? new Date(startIso).getTime() : -Infinity;
  const endTs = endIso ? new Date(endIso).getTime() : Infinity;
  let salesCash = 0, salesCard = 0;
  orders.forEach(o => {
    if (!o.closed || !o.closedAt) return;
    const t = new Date(o.closedAt).getTime();
    if (Number.isNaN(t) || t < startTs || t > endTs) return;
    const total = o.total != null ? o.total : (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
    if ((o.paymentMethod || 'cash').toLowerCase() === 'card') salesCard += total;
    else salesCash += total;
  });
  return { salesCash, salesCard, total: salesCash + salesCard };
}

function ensureTillForToday(cafeId) { return readCurrentTill(cafeId); }

// ── Async writes ─────────────────────────────────────────────────────────────
async function writeTill(cafeId, till) {
  const state = getCafeTillState(cafeId);
  state.till = { ...till };
  _till = { ...till };
  const targetCafeId = cafeId || _cafeId;
  if (!targetCafeId) return;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCafeId);
  if (!isUuid) return;
  const supabase = getClient();
  try {
    if (state.sessionId) {
      await supabase.from('till_sessions').update(tillToDb(till)).eq('id', state.sessionId);
    } else {
      const { data, error } = await supabase
        .from('till_sessions').insert([{ ...tillToDb(till), cafe_id: targetCafeId }]).select().single();
      if (error) throw error;
      if (data) state.sessionId = data.id;
    }
  } catch (err) {
    console.error('[till] writeTill error:', err.message);
  }
}

async function setOpeningBalance(cafeId, amount) {
  const till = readCurrentTill(cafeId);
  till.openingBalance = Number(amount) || 0;
  await writeTill(cafeId, till);
  return _till;
}

async function addExpense(cafeId, name, amount, note) {
  const till = readCurrentTill(cafeId);
  const id = 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  till.expenses = till.expenses || [];
  till.expenses.push({ id, name: String(name || 'مصروف').trim(), amount: Number(amount) || 0, note: String(note || '').trim() });
  await writeTill(cafeId, till);
  return _till;
}

async function addWithdrawal(cafeId, amount, note) {
  const till = readCurrentTill(cafeId);
  const id = 'wd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  till.withdrawals = till.withdrawals || [];
  till.withdrawals.push({ id, amount: Number(amount) || 0, note: String(note || '').trim() });
  await writeTill(cafeId, till);
  return _till;
}

async function updateExpense(cafeId, id, name, amount, note) {
  const till = readCurrentTill(cafeId);
  const exp = (till.expenses || []).find(e => String(e.id) === String(id));
  if (!exp) { const err = new Error('المصروف غير موجود'); err.code = 'NOT_FOUND'; throw err; }
  exp.name = String(name || 'مصروف').trim();
  exp.amount = Number(amount) || 0;
  exp.note = String(note || '').trim();
  await writeTill(cafeId, till);
  return _till;
}

async function updateWithdrawal(cafeId, id, amount, note) {
  const till = readCurrentTill(cafeId);
  const wd = (till.withdrawals || []).find(w => String(w.id) === String(id));
  if (!wd) { const err = new Error('عملية السحب غير موجودة'); err.code = 'NOT_FOUND'; throw err; }
  wd.amount = Number(amount) || 0;
  wd.note = String(note || '').trim();
  await writeTill(cafeId, till);
  return _till;
}

async function removeExpense(cafeId, id) {
  const till = readCurrentTill(cafeId);
  till.expenses = (till.expenses || []).filter(e => e.id !== id);
  await writeTill(cafeId, till);
  return _till;
}

async function removeWithdrawal(cafeId, id) {
  const till = readCurrentTill(cafeId);
  till.withdrawals = (till.withdrawals || []).filter(w => w.id !== id);
  await writeTill(cafeId, till);
  return _till;
}

async function setNote(cafeId, note) {
  const till = readCurrentTill(cafeId);
  till.note = String(note || '').trim();
  await writeTill(cafeId, till);
  return _till;
}

async function closeTill(cafeId, closedBy) {
  const till = readCurrentTill(cafeId);
  till.closedAt = new Date().toISOString();
  till.closedBy = String(closedBy || '').trim();
  till.status = 'closed';
  await writeTill(cafeId, till);
  return _till;
}

async function resetTillForNewDay(cafeId, openingBalance, openedBy) {
  const till = defaultTill(getTodayDateStr(), new Date().toISOString(), 'open');
  if (openingBalance !== undefined && openingBalance !== null) {
    till.openingBalance = Number(openingBalance) || 0;
  }
  if (openedBy !== undefined && openedBy !== null) {
    till.openedBy = String(openedBy || '').trim() || null;
  }
  const state = getCafeTillState(cafeId);
  state.till = { ...till };
  state.sessionId = null;
  _till = { ...till };
  await writeTill(cafeId, till);
  return state.till;
}

function setTillCache(till, sessionId) {
  if (till && typeof till === 'object') {
    _till = { ...till };
    _tillSessionId = sessionId;
  }
}

module.exports = {
  getTodayDateStr,
  getOpenDateFromIso,
  defaultTill,
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
  initTill,
  setTillCache,
  TILL_FILE: path.join(DATA_DIR, 'currentTill.json'),
};
