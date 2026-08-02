'use strict';
/**
 * categoryRepository — Supabase Single Source of Truth
 */
const { getClient } = require('../lib/supabase');

function categoryName(c) {
  if (c == null) return '';
  if (typeof c === 'object' && !Array.isArray(c)) {
    return String(c.name != null ? c.name : '').trim();
  }
  return String(c).trim();
}

async function getCategories(cafeId) {
  const cid = String(cafeId || '').trim();
  try {
    const supabase = getClient();
    let query = supabase.from('categories').select('name, image_url, sort_order');
    if (cid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) {
      query = query.eq('cafe_id', cid);
    }
    const { data, error } = await query;
    if (error || !data) return [];

    const list = data.map(item => ({
      name: item.name,
      imageUrl: item.image_url || null
    }));
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    return list;
  } catch (err) {
    console.warn('[categoryRepository] getCategories exception:', err.message);
    return [];
  }
}

async function saveCategories(arr, cafeId) {
  const cid = String(cafeId || '').trim();
  if (!cid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) return;

  try {
    const supabase = getClient();
    const rows = (arr || []).map((c, idx) => {
      const name = typeof c === 'string' ? c : (c.name || '');
      const imageUrl = typeof c === 'object' ? (c.imageUrl || c.image_url || null) : null;
      return {
        cafe_id: cid,
        name: String(name).trim(),
        image_url: imageUrl,
        sort_order: idx
      };
    }).filter(r => !!r.name);

    // Delete categories no longer in list
    const currentNames = new Set(rows.map(r => r.name));
    const { data: dbItems } = await supabase.from('categories').select('name').eq('cafe_id', cid);
    if (dbItems && dbItems.length > 0) {
      const toDelete = dbItems.map(d => d.name).filter(n => !currentNames.has(n));
      if (toDelete.length > 0) {
        await supabase.from('categories').delete().in('name', toDelete).eq('cafe_id', cid);
      }
    }

    if (rows.length > 0) {
      await supabase.from('categories').upsert(rows, { onConflict: 'cafe_id,name' });
    }
  } catch (err) {
    console.error('[categoryRepository] saveCategories error:', err.message);
  }
}

module.exports = {
  getCategories,
  saveCategories,
};
