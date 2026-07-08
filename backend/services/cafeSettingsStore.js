/**
 * تخزين إعدادات الكافيه (الاسم، الشعار).
 */
const fs = require('fs');
const path = require('path');
const { CAFE_SETTINGS_FILE } = require('../config');

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

function getCafeSettings() {
  return normalizeSettings(readSettingsRaw());
}

function saveCafeSettings(partial) {
  const current = getCafeSettings();
  const next = normalizeSettings(Object.assign({}, current, partial || {}));
  ensureSettingsFile();
  fs.writeFileSync(CAFE_SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function clearLogoUrl() {
  return saveCafeSettings({ logoUrl: null });
}

module.exports = {
  getCafeSettings,
  saveCafeSettings,
  clearLogoUrl,
  DEFAULT_SETTINGS,
};
