/**
 * Kitchen state — Phase 1: Supabase-backed with in-memory cache.
 * Reads are SYNC (from in-memory map); writes are ASYNC (cache + Supabase).
 * initKitchenState(cafeId) must be called before use.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getClient } = require('../lib/supabase');

let _cafeId = null;
let _kitchenState = {}; // { [orderId]: { status, createdAt, updatedAt } }

// ── Migration & Init ───────────────────────────────────────────────────────
async function initKitchenState(cafeId) {
  _cafeId = cafeId;
  const supabase = getClient();

  // Load from Supabase
  const { data: rows, error } = await supabase
    .from('kitchen_state').select('*').eq('cafe_id', _cafeId);

  if (error) {
    console.warn('[kitchen] load error:', error.message);
    _kitchenState = {};
    return;
  }

  _kitchenState = {};
  (rows || []).forEach(row => {
    _kitchenState[row.order_id] = {
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  console.log(`  [kitchen] ${Object.keys(_kitchenState).length} entries loaded`);
}

// ── Sync reads ─────────────────────────────────────────────────────────────
function readKitchenState(cafeId) { return _kitchenState; }

function getKitchenStatus(cafeId, orderId) {
  return _kitchenState[orderId] || null;
}

function normalizeKitchenStatusRead(raw) {
  if (!raw || raw === 'pending') return 'new';
  if (raw === 'editing') return 'editing';
  if (raw === 'prepared') return 'preparing';
  if (raw === 'closed') return 'completed';
  if (raw === 'held') return 'held';
  if (raw === 'new' || raw === 'preparing' || raw === 'completed') return String(raw).toLowerCase();
  return 'new';
}

function isOrderKitchenCompleted(cafeId, orderId) {
  const ks = getKitchenStatus(cafeId, orderId);
  return normalizeKitchenStatusRead(ks && ks.status) === 'completed';
}

// ── Async writes ───────────────────────────────────────────────────────────
async function setKitchenStatus(cafeId, orderId, status) {
  const now = new Date().toISOString();
  const prev = _kitchenState[orderId] || {};
  const entry = { status, updatedAt: now, createdAt: prev.createdAt || now };
  _kitchenState[orderId] = entry;

  const targetCafeId = cafeId || _cafeId;
  if (targetCafeId) {
    const supabase = getClient();
    try {
      const { error } = await supabase.from('kitchen_state').upsert(
        [{ order_id: orderId, cafe_id: targetCafeId, status, created_at: entry.createdAt, updated_at: now }],
        { onConflict: 'order_id,cafe_id' }
      );
      if (error) console.error('[kitchen] setKitchenStatus error:', error.message);
    } catch (err) {
      if (!err.message.includes('fetch failed')) {
        console.error('[kitchen] setKitchenStatus error:', err.message);
      }
    }
  }
  return entry;
}

async function removeKitchenEntry(cafeId, orderId) {
  const id = orderId != null ? String(orderId).trim() : '';
  if (!id || !_kitchenState[id]) return false;
  delete _kitchenState[id];

  const targetCafeId = cafeId || _cafeId;
  if (targetCafeId) {
    const supabase = getClient();
    try {
      await supabase.from('kitchen_state').delete().eq('order_id', id).eq('cafe_id', targetCafeId);
    } catch (err) {
      if (!err.message.includes('fetch failed')) {
        console.error('[kitchen] removeKitchenEntry error:', err.message);
      }
    }
  }
  return true;
}

async function saveKitchenState(cafeId, state) {
  _kitchenState = { ...state };
  const targetCafeId = cafeId || _cafeId;
  if (!targetCafeId) return;
  const supabase = getClient();
  try {
    // Delete all and re-insert
    await supabase.from('kitchen_state').delete().eq('cafe_id', targetCafeId);
    const entries = Object.entries(state);
    if (entries.length > 0) {
      const now = new Date().toISOString();
      await supabase.from('kitchen_state').insert(
        entries.map(([order_id, ks]) => ({
          order_id,
          cafe_id: _cafeId,
          status: ks.status || 'new',
          created_at: ks.createdAt || now,
          updated_at: ks.updatedAt || now,
        }))
      );
    }
  } catch (err) {
    console.error('[kitchen] saveKitchenState error:', err.message);
  }
}

async function resetKitchenState(cafeId) {
  _kitchenState = {};
  const targetCafeId = cafeId || _cafeId;
  if (targetCafeId) {
    const supabase = getClient();
    try {
      await supabase.from('kitchen_state').delete().eq('cafe_id', targetCafeId);
    } catch (err) {
      console.error('[kitchen] resetKitchenState error:', err.message);
    }
  }
}

function setKitchenStateCache(state) {
  if (state && typeof state === 'object') {
    _kitchenState = { ...state };
  }
}

module.exports = {
  initKitchenState,
  readKitchenState,
  getKitchenState: readKitchenState,
  saveKitchenState,
  resetKitchenState,
  getKitchenStatus,
  setKitchenStatus,
  removeKitchenEntry,
  normalizeKitchenStatusRead,
  isOrderKitchenCompleted,
  setKitchenStateCache,
};
