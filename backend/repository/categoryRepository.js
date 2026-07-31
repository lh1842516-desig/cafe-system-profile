'use strict';
/**
 * categoryRepository — STEP 2C.1 / Categories Repository
 *
 * READ operations:
 *   - getCategories(cafeId): Fetches categories from Supabase (public.categories),
 *     maps image_url <-> imageUrl, sorts them, and falls back to categories.json
 *     if the database is empty or offline.
 *
 * WRITE operations:
 *   - None for now (per strict instructions not to modify WRITE operations).
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getClient } = require('../lib/supabase');

const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function categoryName(c) {
  if (c == null) return '';
  if (typeof c === 'object' && !Array.isArray(c)) {
    return String(c.name != null ? c.name : '').trim();
  }
  return String(c).trim();
}

function normalizeCategoryEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const name = String(entry.name != null ? entry.name : '').trim();
    if (!name) return null;
    const raw = entry.imageUrl;
    const imageUrl = raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
    return { name, imageUrl };
  }
  const name = String(entry).trim();
  if (!name) return null;
  return { name, imageUrl: null };
}

function normalizeCategoryList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach((raw) => {
    const n = normalizeCategoryEntry(raw);
    if (n) out.push(n);
  });
  return out;
}

/** Reads categories from the local categories file per cafeId. */
function readCategoriesLocal(cafeId) {
  const cid = String(cafeId || '').trim();
  if (!cid) {
    const defaultFile = path.join(DATA_DIR, 'categories.json');
    ensureDir(path.dirname(defaultFile));
    if (!fs.existsSync(defaultFile)) return [];
    try {
      const data = fs.readFileSync(defaultFile, 'utf8');
      return normalizeCategoryList(JSON.parse(data));
    } catch { return []; }
  }
  const file = path.join(DATA_DIR, `categories_${cid}.json`);
  ensureDir(path.dirname(file));
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const data = fs.readFileSync(file, 'utf8');
    return normalizeCategoryList(JSON.parse(data));
  } catch {
    return [];
  }
}

/**
 * Fetches categories from Supabase and falls back to categories_<cafeId>.json if empty or on error.
 * Maps image_url to imageUrl and sorts categories alphabetically using Arabic locale.
 *
 * @param {string} cafeId
 * @returns {Promise<Array<{name: string, imageUrl: string|null}>>}
 */
async function getCategories(cafeId) {
  const cid = String(cafeId || '').trim();
  if (!cid) {
    return readCategoriesLocal();
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
  if (!isUuid) {
    return readCategoriesLocal(cid);
  }

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('categories')
      .select('name, image_url')
      .eq('cafe_id', cid);

    if (error) {
      console.warn('[categoryRepository] error fetching from Supabase, falling back to local file:', error.message);
      return readCategoriesLocal(cid);
    }

    if (data && data.length > 0) {
      const list = data.map(item => ({
        name: item.name,
        imageUrl: item.image_url || null
      }));
      // Sort alphabetically using Arabic locale
      list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
      return list;
    }

    // Fallback if DB returns empty list
    return readCategoriesLocal(cid);
  } catch (err) {
    console.warn('[categoryRepository] exception fetching from Supabase, falling back to local file:', err.message);
    return readCategoriesLocal(cid);
  }
}

module.exports = {
  getCategories,
};
