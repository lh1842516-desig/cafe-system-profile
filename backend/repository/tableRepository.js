'use strict';
/**
 * tableRepository — STEP 2D.2
 *
 * READ operations strategy:
 *   - getTables() is ASYNC: fetches live from Supabase. Falls back to in-memory store if DB is offline.
 *   - getNextTableId() is ASYNC: derives ID from Supabase tables list. Falls back to in-memory store.
 *
 * WRITE operations: unchanged — delegate to store.saveTables().
 */
const store = require('../data/store');
const { getClient } = require('../lib/supabase');

function tableFromDb(row) {
  const id = String(row.id || '').trim();
  const label = String(row.label != null ? row.label : id).trim() || id;
  return { id, label };
}

async function getTables(cafeId) {
  const cached = store.getTables(cafeId);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }
  if (!cafeId) return store.getTables(cafeId);
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('cafe_tables')
      .select('*')
      .eq('cafe_id', cafeId);
    if (error) {
      console.error('[tableRepository] getTables error:', error.message);
      return store.getTables(cafeId); // fallback
    }
    const mapped = (data || []).map(tableFromDb);
    store.setTablesCache(mapped);
    return mapped;
  } catch (err) {
    console.error('[tableRepository] getTables exception:', err.message);
    return store.getTables(cafeId); // fallback
  }
}

async function getNextTableId(cafeId) {
  try {
    const list = await getTables(cafeId);
    let maxNum = 0;
    list.forEach(t => {
      const n = parseInt(String(t.id || ''), 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    });
    return String(maxNum + 1);
  } catch (err) {
    console.error('[tableRepository] getNextTableId exception:', err.message);
    return store.getNextTableId(cafeId);
  }
}

async function saveTables(cafeId, tables) {
  return await store.saveTables(cafeId, tables);
}

module.exports = {
  getTables,
  saveTables,
  getNextTableId,
};
