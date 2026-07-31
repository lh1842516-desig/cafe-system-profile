'use strict';
/**
 * menuRepository — STEP 2D.1
 *
 * READ operations strategy:
 *   - getMenu() is ASYNC: fetches live from Supabase. Falls back to in-memory store if DB is offline.
 *   - getMenuItem() is ASYNC: fetches live from Supabase by ID. Falls back to in-memory store if DB is offline.
 *
 * WRITE operations: unchanged — delegate to store.saveMenu().
 */
const store = require('../data/store');
const { getClient } = require('../lib/supabase');

// ── DB → JS mapper (mirrors store.js menuItemFromDb) ───────────────────────
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

// ── READ: getMenu (ASYNC) ───────────────────────────────────────────────────
async function getMenu(cafeId) {
  const cached = store.getMenu(cafeId);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  if (!cafeId) return store.getMenu(cafeId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
  if (!isUuid) return store.getMenu(cafeId);

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('sort_order')
      .order('created_at');
    if (error) {
      console.error('[menuRepository] getMenu error:', error.message);
      return store.getMenu(cafeId); // fallback to cache
    }
    const mapped = (data || []).map(menuItemFromDb);
    store.setMenuCache(mapped, cafeId);
    return mapped;
  } catch (err) {
    console.error('[menuRepository] getMenu exception:', err.message);
    return store.getMenu(cafeId); // fallback to cache
  }
}

// ── READ: getMenuItem (ASYNC) ───────────────────────────────────────────────
async function getMenuItem(cafeId, id) {
  if (id == null || id === '') return null;
  const cached = store.getMenuItem(cafeId, id);
  if (cached) return cached;
  if (!cafeId) return store.getMenuItem(cafeId, id);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
  if (!isUuid) return store.getMenuItem(cafeId, id);

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('id', String(id))
      .maybeSingle();
    if (error) {
      console.error('[menuRepository] getMenuItem error:', error.message);
      return store.getMenuItem(cafeId, id); // fallback to cache
    }
    if (!data) return store.getMenuItem(cafeId, id);
    return menuItemFromDb(data);
  } catch (err) {
    console.error('[menuRepository] getMenuItem exception:', err.message);
    return store.getMenuItem(cafeId, id); // fallback to cache
  }
}

// ── WRITE: saveMenu (UNCHANGED — delegates to store) ───────────────────────
async function saveMenu(cafeId, menu) {
  return await store.saveMenu(cafeId, menu);
}

module.exports = {
  getMenu,
  getMenuItem,
  saveMenu,
};
