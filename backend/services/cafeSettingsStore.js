/**
 * تخزين إعدادات الكافيه (الاسم، الشعار).
 */
const fs = require('fs');
const path = require('path');
const { getClient } = require('../lib/supabase');
const config = require('../config');
const { CAFE_SETTINGS_FILE } = config;

const DEFAULT_SETTINGS = {
  cafeName: 'Shot Cafe',
  logoUrl: null,
  /** طلبات الزبائن من المنيو تنتظر موافقة الكاشير قبل المطبخ */
  requireCashierKitchenApproval: true,
};

function ensureSettingsFile() {
  const dir = path.dirname(CAFE_SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CAFE_SETTINGS_FILE)) {
    fs.writeFileSync(CAFE_SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
  }
}

function readSettingsRaw() {
  ensureSettingsFile();
  try {
    const data = JSON.parse(fs.readFileSync(CAFE_SETTINGS_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

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

const settingsCacheMap = new Map();

async function getCafeSettings(cafeId) {
  if (cafeId && settingsCacheMap.has(cafeId)) {
    const cached = settingsCacheMap.get(cafeId);
    if (Date.now() - cached.ts < 30000) {
      return cached.data;
    }
  }
  if (config.SAAS_AUTH_ENABLED && cafeId) {
    try {
      const supabase = getClient();
      
      const { data: cafeData, error: cafeErr } = await supabase
        .from('cafes')
        .select('name, logo_url')
        .eq('id', cafeId)
        .limit(1);

      if (cafeErr) {
        console.error('[cafeSettingsStore] getCafeSettings cafes error:', cafeErr.message);
        return normalizeSettings(readSettingsRaw());
      }
      
      let { data: settingsData, error: settingsErr } = await supabase
        .from('cafe_settings')
        .select('require_cashier_kitchen_approval')
        .eq('cafe_id', cafeId)
        .limit(1);

      if (settingsErr) {
        console.error('[cafeSettingsStore] getCafeSettings cafe_settings error:', settingsErr.message);
        return normalizeSettings(readSettingsRaw());
      }

      let requireCashierKitchenApproval = true;
      if (!settingsData || settingsData.length === 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from('cafe_settings')
          .insert([{ cafe_id: cafeId, require_cashier_kitchen_approval: true }])
          .select();
        if (insertErr) {
          console.error('[cafeSettingsStore] Failed to insert default settings:', insertErr.message);
        }
      } else {
        requireCashierKitchenApproval = !!settingsData[0].require_cashier_kitchen_approval;
      }

      const cafeName = (cafeData && cafeData.length > 0) ? cafeData[0].name : 'Shot Cafe';
      const logoUrl = (cafeData && cafeData.length > 0) ? cafeData[0].logo_url : null;

      const resObj = {
        cafeName,
        logoUrl,
        requireCashierKitchenApproval
      };
      if (cafeId) settingsCacheMap.set(cafeId, { data: resObj, ts: Date.now() });
      return resObj;
    } catch (err) {
      console.error('[cafeSettingsStore] getCafeSettings exception:', err.message);
      return normalizeSettings(readSettingsRaw());
    }
  }

  return normalizeSettings(readSettingsRaw());
}

async function saveCafeSettings(cafeId, partial) {
  if (cafeId) settingsCacheMap.delete(cafeId);
  if (config.SAAS_AUTH_ENABLED && cafeId) {
    try {
      const supabase = getClient();

      const cafeUpdates = {};
      if (partial.cafeName !== undefined) cafeUpdates.name = String(partial.cafeName).trim();
      if (partial.logoUrl !== undefined) cafeUpdates.logo_url = partial.logoUrl;

      if (Object.keys(cafeUpdates).length > 0) {
        const { error: cafeErr } = await supabase
          .from('cafes')
          .update(cafeUpdates)
          .eq('id', cafeId);
        if (cafeErr) {
          console.error('[cafeSettingsStore] saveCafeSettings cafes error:', cafeErr.message);
        }
      }

      if (partial.requireCashierKitchenApproval !== undefined) {
        const { error: settingsErr } = await supabase
          .from('cafe_settings')
          .upsert([{
            cafe_id: cafeId,
            require_cashier_kitchen_approval: !!partial.requireCashierKitchenApproval,
            updated_at: new Date().toISOString()
          }], { onConflict: 'cafe_id' });
        if (settingsErr) {
          console.error('[cafeSettingsStore] saveCafeSettings settings error:', settingsErr.message);
        }
      }

      return await getCafeSettings(cafeId);
    } catch (err) {
      console.error('[cafeSettingsStore] saveCafeSettings exception:', err.message);
      return saveLocalSettings(partial);
    }
  }

  return saveLocalSettings(partial);
}

function saveLocalSettings(partial) {
  const current = normalizeSettings(readSettingsRaw());
  const next = normalizeSettings(Object.assign({}, current, partial || {}));
  ensureSettingsFile();
  fs.writeFileSync(CAFE_SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
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
