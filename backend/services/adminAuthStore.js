/**
 * بيانات دخول الأدمن — اسم المستخدم ورمز الدخول.
 * Supabase Single Source of Truth مع Memory Cache
 */
'use strict';
const { getClient } = require('../lib/supabase');

const DEFAULT_AUTH = {
  username: 'admin',
  password: '20262026',
};

let _authCache = { ...DEFAULT_AUTH };
let _loaded = false;

function normalizeAuth(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const username = String(src.username != null ? src.username : DEFAULT_AUTH.username).trim();
  const password = String(src.password != null ? src.password : DEFAULT_AUTH.password);
  return {
    username: username || DEFAULT_AUTH.username,
    password: password || DEFAULT_AUTH.password,
  };
}

async function loadAuthFromSupabase() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase.from('admin_auth').select('*').limit(1);
    if (!error && data && data.length > 0) {
      _authCache = normalizeAuth(data[0]);
    } else {
      // Seed default admin in Supabase if none exists
      const { data: inserted } = await supabase.from('admin_auth').upsert([{
        username: DEFAULT_AUTH.username,
        password: DEFAULT_AUTH.password,
        updated_at: new Date().toISOString()
      }], { onConflict: 'username' }).select();
      if (inserted && inserted.length > 0) {
        _authCache = normalizeAuth(inserted[0]);
      }
    }
  } catch (err) {
    console.warn('[adminAuthStore] Exception loading admin auth:', err.message);
  }
  _loaded = true;
  return _authCache;
}

function getAdminAuth() {
  if (!_loaded) {
    // Background async load to keep memory sync
    loadAuthFromSupabase().catch(() => {});
  }
  return _authCache;
}

async function getAdminAuthAsync() {
  await loadAuthFromSupabase();
  return _authCache;
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

async function changePassword(currentPassword, newPassword, confirmPassword) {
  await loadAuthFromSupabase();
  const auth = _authCache;
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

  const updated = normalizeAuth({ username: auth.username, password: next });
  _authCache = updated;

  try {
    const supabase = getClient();
    await supabase.from('admin_auth').upsert([{
      username: updated.username,
      password: updated.password,
      updated_at: new Date().toISOString()
    }], { onConflict: 'username' });
  } catch (err) {
    console.error('[adminAuthStore] Failed to update admin password in Supabase:', err.message);
  }

  return { ok: true };
}

// Initial load call
loadAuthFromSupabase().catch(() => {});

module.exports = {
  getAdminAuth,
  getAdminAuthAsync,
  verifyLogin,
  changePassword,
  DEFAULT_AUTH,
};
