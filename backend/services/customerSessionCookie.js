/**
 * كوكي جلسة الزبون — تخزين مستقل ينجو من إغلاق التبويب/قتل Safari ومن مسح localStorage.
 * يحمل (tableId + sessionId) فقط، ويُرسَل تلقائياً مع كل طلب فيستعيد الخادم الطلب المفتوح.
 */
const COOKIE_NAME = 'cf_cust';
const MAX_AGE_SEC = 12 * 60 * 60; // 12 ساعة

function norm(v) {
  return String(v != null ? v : '').trim();
}

function setSessionCookie(res, opts) {
  const tid = norm(opts && opts.tableId);
  const sid = norm(opts && opts.sessionId);
  if (!tid || !sid || !res || typeof res.append !== 'function') return;
  const value = encodeURIComponent(tid + '~' + sid);
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE_SEC}; Path=/; SameSite=Lax`,
  );
}

function readSessionCookie(req) {
  const raw = req && req.headers ? norm(req.headers.cookie) : '';
  if (!raw) return null;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    if (p.slice(0, idx).trim() !== COOKIE_NAME) continue;
    let v = '';
    try {
      v = decodeURIComponent(p.slice(idx + 1).trim());
    } catch (_) {
      v = p.slice(idx + 1).trim();
    }
    const sep = v.indexOf('~');
    if (sep === -1) return null;
    const tableId = norm(v.slice(0, sep));
    const sessionId = norm(v.slice(sep + 1));
    if (tableId && sessionId) return { tableId, sessionId };
    return null;
  }
  return null;
}

function clearSessionCookie(res) {
  if (!res || typeof res.append !== 'function') return;
  res.append('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`);
}

module.exports = { setSessionCookie, readSessionCookie, clearSessionCookie, COOKIE_NAME };
