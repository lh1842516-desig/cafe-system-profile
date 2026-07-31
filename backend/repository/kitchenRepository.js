'use strict';
/**
 * kitchenRepository — STEP 2D.4
 *
 * READ operations strategy:
 *   - getKitchenState(cafeId): Fetches live from Supabase. Falls back to in-memory store if DB is offline.
 *   - getKitchenStatus(cafeId, orderId): Fetches live from Supabase. Falls back to in-memory store.
 *   - isOrderKitchenCompleted(cafeId, orderId): Checks live status from Supabase. Falls back to in-memory store.
 *
 * WRITE operations: unchanged — delegate to data/kitchen.js.
 */
const kitchen = require('../data/kitchen');
const { getClient } = require('../lib/supabase');

async function getKitchenState(cafeId) {
  const cached = kitchen.getKitchenState(cafeId);
  if (cached && typeof cached === 'object') {
    return cached;
  }
  if (!cafeId) return kitchen.getKitchenState(cafeId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('kitchen_state')
      .select('*')
      .eq('cafe_id', cafeId);
    if (error) {
      console.error('[kitchenRepository] getKitchenState error:', error.message);
      return kitchen.getKitchenState(cafeId);
    }
    const state = {};
    (data || []).forEach(row => {
      state[row.order_id] = {
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
    return state;
  } catch (err) {
    console.error('[kitchenRepository] getKitchenState exception:', err.message);
    return kitchen.getKitchenState(cafeId);
  }
}

async function getKitchenStatus(cafeId, orderId) {
  if (!orderId) return null;
  const cached = kitchen.getKitchenStatus(cafeId, orderId);
  if (cached) return cached;
  if (!cafeId) return kitchen.getKitchenStatus(cafeId, orderId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('kitchen_state')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('order_id', String(orderId))
      .maybeSingle();
    if (error) {
      console.error('[kitchenRepository] getKitchenStatus error:', error.message);
      return kitchen.getKitchenStatus(cafeId, orderId);
    }
    if (!data) return kitchen.getKitchenStatus(cafeId, orderId);
    return {
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error('[kitchenRepository] getKitchenStatus exception:', err.message);
    return kitchen.getKitchenStatus(cafeId, orderId);
  }
}

async function isOrderKitchenCompleted(cafeId, orderId) {
  if (!orderId) return false;
  if (!cafeId) return kitchen.isOrderKitchenCompleted(cafeId, orderId);
  try {
    const statusObj = await getKitchenStatus(cafeId, orderId);
    return statusObj && String(statusObj.status || '').toLowerCase() === 'completed';
  } catch (err) {
    console.error('[kitchenRepository] isOrderKitchenCompleted exception:', err.message);
    return kitchen.isOrderKitchenCompleted(cafeId, orderId);
  }
}

function normalizeKitchenStatusRead(raw) {
  return kitchen.normalizeKitchenStatusRead(raw);
}

// ── WRITE operations (UNCHANGED — delegate to data/kitchen.js) ───────────────
async function setKitchenStatus(cafeId, orderId, status) {
  return await kitchen.setKitchenStatus(cafeId, orderId, status);
}

async function removeKitchenEntry(cafeId, orderId) {
  return await kitchen.removeKitchenEntry(cafeId, orderId);
}

async function clearKitchenState(cafeId) {
  return await kitchen.resetKitchenState(cafeId);
}

async function removeKitchenEntriesForTillSession(cafeId, tillSessionId) {
  return await kitchen.resetKitchenState(cafeId);
}

module.exports = {
  getKitchenState,
  getKitchenStatus,
  isOrderKitchenCompleted,
  normalizeKitchenStatusRead,
  setKitchenStatus,
  removeKitchenEntry,
  clearKitchenState,
  removeKitchenEntriesForTillSession,
};
