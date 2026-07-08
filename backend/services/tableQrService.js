/**
 * توليد QR للطاولات — Node.js (رابط المسح + بطاقة طباعة مع تعليمات Wi-Fi).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { TABLE_QRS_DIR, PORT } = require('../config');
const { getTables } = require('../data/store');
const cafeSettingsStore = require('./cafeSettingsStore');
const { composeTableQrCard } = require('./tableQrLayout');

const QR_RENDER_OPTIONS = {
  errorCorrectionLevel: 'M',
  type: 'png',
  width: 380,
  margin: 2,
  color: { dark: '#000000', light: '#FFFFFF' },
};

function getLocalIP() {
  const nets = os.networkInterfaces();
  const candidates = [];
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    });
  });
  const wifiLan = candidates.find(function (a) {
    return /^192\.168\.\d+\.\d+$/.test(a);
  });
  return wifiLan || candidates[0] || '127.0.0.1';
}

function resolveBaseUrl(req) {
  if (req && req.headers && req.headers.host) {
    let host = String(req.headers.host).trim();
    if (host) {
      host = host.replace(/\/$/, '');
      if (!/:\d+$/.test(host)) {
        host = host + ':' + PORT;
      }
      return 'http://' + host;
    }
  }
  const ip = getLocalIP();
  return 'http://' + ip + ':' + PORT;
}

function qrFileName(tableId) {
  return 'table_' + String(tableId).trim() + '.png';
}

function qrFilePath(tableId) {
  return path.join(TABLE_QRS_DIR, qrFileName(tableId));
}

function qrPublicPath(tableId) {
  return '/table-qrs/' + qrFileName(tableId);
}

function qrExists(tableId) {
  try {
    return fs.existsSync(qrFilePath(tableId));
  } catch (_) {
    return false;
  }
}

function tableDisplayLabel(tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return '—';
  const row = getTables().find(function (t) {
    return String(t.id) === tid;
  });
  const label = row && row.label != null ? String(row.label).trim() : tid;
  return label || tid;
}

function buildCustomerTableUrl(tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) throw new Error('invalid_table_id');
  const base = resolveBaseUrl(req);
  return base + '/customer/' + encodeURIComponent(tid);
}

async function renderTableQrCardPng(tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) throw new Error('invalid_table_id');
  const url = buildCustomerTableUrl(tid, req);
  const qrBuffer = await QRCode.toBuffer(url, QR_RENDER_OPTIONS);
  const settings = cafeSettingsStore.getCafeSettings();
  const cafeName = settings && settings.cafeName ? settings.cafeName : 'الكافيه';
  return composeTableQrCard({
    cafeName: cafeName,
    tableLabel: tableDisplayLabel(tid),
    qrBuffer: qrBuffer,
  });
}

async function generateTableQr(tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) throw new Error('invalid_table_id');
  const url = buildCustomerTableUrl(tid, req);
  fs.mkdirSync(TABLE_QRS_DIR, { recursive: true });
  const out = qrFilePath(tid);
  const cardPng = await renderTableQrCardPng(tid, req);
  fs.writeFileSync(out, cardPng);
  return {
    tableId: tid,
    url,
    filePath: out,
    publicPath: qrPublicPath(tid),
  };
}

function deleteTableQr(tableId) {
  const fp = qrFilePath(tableId);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  } catch (_) {
    return false;
  }
}

async function regenerateAllTableQrs(tableIds, req) {
  const ids = Array.isArray(tableIds) ? tableIds : [];
  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const tid = String(ids[i].id != null ? ids[i].id : ids[i]).trim();
    if (!tid) continue;
    results.push(await generateTableQr(tid, req));
  }
  return results;
}

module.exports = {
  getLocalIP,
  resolveBaseUrl,
  qrFilePath,
  qrPublicPath,
  qrExists,
  generateTableQr,
  deleteTableQr,
  regenerateAllTableQrs,
  renderTableQrCardPng,
  tableDisplayLabel,
  buildCustomerTableUrl,
};
