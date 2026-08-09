const path = require('path');
const fs = require('fs');

const LOCAL_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'cafe-settings.json');

function readLocalSettings() {
  try {
    if (fs.existsSync(LOCAL_SETTINGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_SETTINGS_FILE, 'utf8');
      return JSON.parse(raw) || {};
    }
  } catch (_) {}
  return {};
}

function writeLocalSettings(updates) {
  try {
    const current = readLocalSettings();
    const merged = Object.assign({}, current, updates);
    fs.writeFileSync(LOCAL_SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    console.error('[cafeSettingsStore] writeLocalSettings error:', err.message);
  }
}

const DEFAULT_SETTINGS = {
  cafeName: 'Shot Cafe',
  logoUrl: null,
  requireCashierKitchenApproval: true,
  latitude: 35.4681,
  longitude: 44.3922,
  allowedRadius: 100,
  enableGeofence: false,
};

const settingsCacheMap = new Map();

function normalizeSettings(raw) {
  const local = readLocalSettings();
  const src = Object.assign({}, local, raw && typeof raw === 'object' ? raw : {});

  const name = String(src.cafeName != null ? src.cafeName : (local.cafeName || DEFAULT_SETTINGS.cafeName)).trim();
  const logoUrl = src.logoUrl != null && String(src.logoUrl).trim() ? String(src.logoUrl).trim() : (local.logoUrl || null);
  const requireCashierKitchenApproval =
    src.requireCashierKitchenApproval !== undefined
      ? !!src.requireCashierKitchenApproval
      : (local.requireCashierKitchenApproval !== undefined ? !!local.requireCashierKitchenApproval : DEFAULT_SETTINGS.requireCashierKitchenApproval);

  const latitude = src.latitude !== undefined && src.latitude !== null ? Number(src.latitude) : (local.latitude != null ? Number(local.latitude) : DEFAULT_SETTINGS.latitude);
  const longitude = src.longitude !== undefined && src.longitude !== null ? Number(src.longitude) : (local.longitude != null ? Number(local.longitude) : DEFAULT_SETTINGS.longitude);
  const allowedRadius = src.allowedRadius !== undefined && src.allowedRadius !== null ? Number(src.allowedRadius) : (local.allowedRadius != null ? Number(local.allowedRadius) : DEFAULT_SETTINGS.allowedRadius);
  const enableGeofence = src.enableGeofence !== undefined ? !!src.enableGeofence : (local.enableGeofence !== undefined ? !!local.enableGeofence : DEFAULT_SETTINGS.enableGeofence);

  return {
    cafeName: name || DEFAULT_SETTINGS.cafeName,
    logoUrl,
    requireCashierKitchenApproval,
    latitude: isNaN(latitude) ? DEFAULT_SETTINGS.latitude : latitude,
    longitude: isNaN(longitude) ? DEFAULT_SETTINGS.longitude : longitude,
    allowedRadius: isNaN(allowedRadius) || allowedRadius <= 0 ? DEFAULT_SETTINGS.allowedRadius : allowedRadius,
    enableGeofence,
  };
}

async function getCafeSettings(cafeId) {
  const cid = String(cafeId || '').trim();
  if (cid && settingsCacheMap.has(cid)) {
    const cached = settingsCacheMap.get(cid);
    if (Date.now() - cached.ts < 2000) {
      return cached.data;
    }
  }

  const local = readLocalSettings();

  try {
    const supabase = getClient();

    let targetId = cid;
    if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      const { data: cafes } = await supabase.from('cafes').select('id, name, logo_url').limit(1);
      if (cafes && cafes.length > 0) {
        targetId = cafes[0].id;
      }
    }

    if (!targetId) return normalizeSettings(local);

    let cafeName = local.cafeName || DEFAULT_SETTINGS.cafeName;
    let logoUrl = local.logoUrl || null;
    let requireCashierKitchenApproval = local.requireCashierKitchenApproval !== undefined ? local.requireCashierKitchenApproval : true;
    let latitude = local.latitude != null ? Number(local.latitude) : DEFAULT_SETTINGS.latitude;
    let longitude = local.longitude != null ? Number(local.longitude) : DEFAULT_SETTINGS.longitude;
    let allowedRadius = local.allowedRadius != null ? Number(local.allowedRadius) : DEFAULT_SETTINGS.allowedRadius;
    let enableGeofence = local.enableGeofence !== undefined ? !!local.enableGeofence : DEFAULT_SETTINGS.enableGeofence;

    try {
      const [{ data: cafeData }, { data: settingsData }] = await Promise.all([
        supabase.from('cafes').select('name, logo_url').eq('id', targetId).limit(1),
        supabase.from('cafe_settings').select('require_cashier_kitchen_approval, latitude, longitude, allowed_radius, enable_geofence').eq('cafe_id', targetId).limit(1)
      ]);

      if (cafeData && cafeData.length > 0) {
        if (cafeData[0].name) cafeName = cafeData[0].name;
        if (cafeData[0].logo_url) logoUrl = cafeData[0].logo_url;
      }

      if (settingsData && settingsData.length > 0) {
        const s = settingsData[0];
        if (s.require_cashier_kitchen_approval != null) requireCashierKitchenApproval = !!s.require_cashier_kitchen_approval;
        if (s.latitude != null) latitude = Number(s.latitude);
        if (s.longitude != null) longitude = Number(s.longitude);
        if (s.allowed_radius != null) allowedRadius = Number(s.allowed_radius);
        if (s.enable_geofence != null) enableGeofence = !!s.enable_geofence;
      }
    } catch (_) {}

    const resObj = normalizeSettings({
      cafeName,
      logoUrl,
      requireCashierKitchenApproval,
      latitude,
      longitude,
      allowedRadius,
      enableGeofence,
    });
    if (cid) settingsCacheMap.set(cid, { data: resObj, ts: Date.now() });
    return resObj;
  } catch (err) {
    console.error('[cafeSettingsStore] getCafeSettings exception:', err.message);
    return normalizeSettings(local);
  }
}

async function saveCafeSettings(cafeId, partial) {
  settingsCacheMap.clear();
  writeLocalSettings(partial);
  const cid = String(cafeId || '').trim();

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

    const settingsUpdates = {
      cafe_id: targetId,
      updated_at: new Date().toISOString()
    };
    if (partial.requireCashierKitchenApproval !== undefined) {
      settingsUpdates.require_cashier_kitchen_approval = !!partial.requireCashierKitchenApproval;
    }
    if (partial.latitude !== undefined) settingsUpdates.latitude = Number(partial.latitude);
    if (partial.longitude !== undefined) settingsUpdates.longitude = Number(partial.longitude);
    if (partial.allowedRadius !== undefined) settingsUpdates.allowed_radius = Number(partial.allowedRadius);
    if (partial.enableGeofence !== undefined) settingsUpdates.enable_geofence = !!partial.enableGeofence;

    try {
      await supabase.from('cafe_settings').upsert([settingsUpdates], { onConflict: 'cafe_id' });
    } catch (_) {}

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
