/**
 * تخزين إعدادات الكافيه (الاسم، الشعار).
 * Supabase Single Source of Truth مع Memory Cache
 */
'use strict';
const { getClient } = require('../lib/supabase');

const DEFAULT_SETTINGS = {
  cafeName: 'Shot Cafe',
  logoUrl: null,
  requireCashierKitchenApproval: true,
};

const settingsCacheMap = new Map();

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const name = String(src.cafeName != null ? src.cafeName : DEFAULT_SETTINGS.cafeName).trim();
  const logoUrl = src.logoUrl != null && String(src.logoUrl).trim() ? String(src.logoUrl).trim() : null;
  const requireCashierKitchenApproval =
    src.requireCashierKitchenApproval !== undefined
      ? !!src.requireCashierKitchenApproval
      : DEFAULT_SETTINGS.requireCashierKitchenApproval;
  return {
    cafeName: name || DEFAULT_SETTINGS.cafeName,
    logoUrl,
    requireCashierKitchenApproval,
  };
}

async function getCafeSettings(cafeId) {
  const cid = String(cafeId || '').trim();
  if (cid && settingsCacheMap.has(cid)) {
    const cached = settingsCacheMap.get(cid);
    if (Date.now() - cached.ts < 30000) {
      return cached.data;
    }
  }

  try {
    const supabase = getClient();

    let targetId = cid;
    if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      const { data: cafes } = await supabase.from('cafes').select('id, name, logo_url').limit(1);
      if (cafes && cafes.length > 0) {
        targetId = cafes[0].id;
      }
    }

    if (!targetId) return normalizeSettings({});

    const [{ data: cafeData }, { data: settingsData }] = await Promise.all([
      supabase.from('cafes').select('name, logo_url').eq('id', targetId).limit(1),
      supabase.from('cafe_settings').select('require_cashier_kitchen_approval').eq('cafe_id', targetId).limit(1)
    ]);

    let requireCashierKitchenApproval = true;
    if (!settingsData || settingsData.length === 0) {
      await supabase.from('cafe_settings').insert([{ cafe_id: targetId, require_cashier_kitchen_approval: true }]);
    } else {
      requireCashierKitchenApproval = !!settingsData[0].require_cashier_kitchen_approval;
    }

    const cafeName = (cafeData && cafeData.length > 0) ? cafeData[0].name : DEFAULT_SETTINGS.cafeName;
    const logoUrl = (cafeData && cafeData.length > 0) ? cafeData[0].logo_url : null;

    const resObj = {
      cafeName,
      logoUrl,
      requireCashierKitchenApproval
    };
    if (cid) settingsCacheMap.set(cid, { data: resObj, ts: Date.now() });
    return resObj;
  } catch (err) {
    console.error('[cafeSettingsStore] getCafeSettings exception:', err.message);
    return normalizeSettings({});
  }
}

async function saveCafeSettings(cafeId, partial) {
  const cid = String(cafeId || '').trim();
  if (cid) settingsCacheMap.delete(cid);

  try {
    const supabase = getClient();
    let targetId = cid;
    if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      const { data: cafes } = await supabase.from('cafes').select('id').limit(1);
      if (cafes && cafes.length > 0) targetId = cafes[0].id;
    }

    if (!targetId) return normalizeSettings(partial);

    const cafeUpdates = {};
    if (partial.cafeName !== undefined) cafeUpdates.name = String(partial.cafeName).trim();
    if (partial.logoUrl !== undefined) cafeUpdates.logo_url = partial.logoUrl;

    if (Object.keys(cafeUpdates).length > 0) {
      await supabase.from('cafes').update(cafeUpdates).eq('id', targetId);
    }

    if (partial.requireCashierKitchenApproval !== undefined) {
      await supabase.from('cafe_settings').upsert([{
        cafe_id: targetId,
        require_cashier_kitchen_approval: !!partial.requireCashierKitchenApproval,
        updated_at: new Date().toISOString()
      }], { onConflict: 'cafe_id' });
    }

    return await getCafeSettings(targetId);
  } catch (err) {
    console.error('[cafeSettingsStore] saveCafeSettings exception:', err.message);
    return normalizeSettings(partial);
  }
}

async function clearLogoUrl(cafeId) {
  return await saveCafeSettings(cafeId, { logoUrl: null });
}

module.exports = {
  getCafeSettings,
  saveCafeSettings,
  clearLogoUrl,
  DEFAULT_SETTINGS,
};
