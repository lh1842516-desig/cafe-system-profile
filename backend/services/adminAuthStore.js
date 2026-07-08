/**
 * بيانات دخول الأدمن — اسم المستخدم ورمز الدخول.
 */
const fs = require('fs');
const path = require('path');
const { ADMIN_AUTH_FILE } = require('../config');

const DEFAULT_AUTH = {
  username: 'admin',
  password: '20262026',
};

function ensureAuthFile() {
  const dir = path.dirname(ADMIN_AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ADMIN_AUTH_FILE)) {
    fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(DEFAULT_AUTH, null, 2), 'utf8');
  }
}

function readAuthRaw() {
  ensureAuthFile();
  try {
    const data = JSON.parse(fs.readFileSync(ADMIN_AUTH_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function normalizeAuth(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const username = String(src.username != null ? src.username : DEFAULT_AUTH.username).trim();
  const password = String(src.password != null ? src.password : DEFAULT_AUTH.password);
  return {
    username: username || DEFAULT_AUTH.username,
    password: password || DEFAULT_AUTH.password,
  };
}

function getAdminAuth() {
  return normalizeAuth(readAuthRaw());
}

function verifyLogin(username, password) {
  const auth = getAdminAuth();
  const user = String(username || '').trim();
  const pass = String(password != null ? password : '');
  if (!user || !pass) {
    return { ok: false, code: 'missing_fields' };
  }
  if (user !== auth.username || pass !== auth.password) {
    return { ok: false, code: 'invalid_credentials' };
  }
  return { ok: true };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function changePassword(currentPassword, newPassword, confirmPassword) {
  const auth = getAdminAuth();
  const cur = String(currentPassword != null ? currentPassword : '');
  const next = String(newPassword != null ? newPassword : '');
  const confirm = String(confirmPassword != null ? confirmPassword : '');

  if (!cur || !next || !confirm) {
    return { ok: false, code: 'missing_fields', message: 'يرجى تعبئة جميع الحقول' };
  }
  if (cur !== auth.password) {
    return { ok: false, code: 'wrong_current', message: 'رمز الدخول الحالي غير صحيح' };
  }
  if (next.length < 6) {
    return { ok: false, code: 'weak_password', message: 'الرمز الجديد يجب أن يكون 6 أحرف على الأقل' };
  }
  if (next !== confirm) {
    return { ok: false, code: 'mismatch', message: 'تأكيد الرمز الجديد غير مطابق' };
  }
  if (next === cur) {
    return { ok: false, code: 'same_password', message: 'الرمز الجديد يجب أن يختلف عن الرمز الحالي' };
  }

  const updated = normalizeAuth(Object.assign({}, auth, { password: next }));
  ensureAuthFile();
  fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return { ok: true };
}

module.exports = {
  getAdminAuth,
  verifyLogin,
  changePassword,
  DEFAULT_AUTH,
};
