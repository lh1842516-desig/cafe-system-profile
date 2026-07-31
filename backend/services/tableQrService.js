/**
 * توليد QR للطاولات عند الطلب (On-Demand) — Node.js
 * توليد بطاقة طباعة PNG في الذاكرة دون حفظ ملفات على القرص (100% Tenant-Isolated).
 */
const os = require('os');
const QRCode = require('qrcode');
const { PORT } = require('../config');
const tableRepo = require('../repository/tableRepository');
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
  const env = (process.env.NODE_ENV || 'development').trim().toLowerCase();
  const proto = (req && req.headers && req.headers['x-forwarded-proto']) || (env === 'production' ? 'https' : 'http');
  if (env === 'production') {
    if (req && req.headers && req.headers.host) {
      let host = String(req.headers.host).trim().replace(/\/$/, '');
      return proto + '://' + host;
    }
    const ip = getLocalIP();
    return 'http://' + ip + ':' + PORT;
  }

  let devHost = (process.env.DEV_SERVER_IP || getLocalIP()).trim();
  if (devHost && !/:\d+$/.test(devHost)) {
    devHost = devHost + ':' + PORT;
  }
  return 'http://' + devHost;
}

async function tableDisplayLabel(cafeId, tableId) {
  const tid = String(tableId || '').trim();
  if (!tid) return '—';
  const tables = await tableRepo.getTables(cafeId);
  const row = tables.find(function (t) {
    return String(t.id) === tid;
  });
  const label = row && row.label != null ? String(row.label).trim() : tid;
  return label || tid;
}

function buildCustomerTableUrl(cafeId, tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) throw new Error('invalid_table_id');
  const base = resolveBaseUrl(req);
  const cid = String(cafeId || '').trim();
  return base + '/customer/?cafeId=' + encodeURIComponent(cid) + '&tableId=' + encodeURIComponent(tid) + '&qr=1';
}

async function renderTableQrCardPng(cafeId, tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) throw new Error('invalid_table_id');
  const url = buildCustomerTableUrl(cafeId, tid, req);
  const qrBuffer = await QRCode.toBuffer(url, QR_RENDER_OPTIONS);
  const settings = await cafeSettingsStore.getCafeSettings(cafeId);
  const cafeName = settings && settings.cafeName ? settings.cafeName : 'الكافيه';
  const tableLabel = await tableDisplayLabel(cafeId, tid);
  return composeTableQrCard({
    cafeName: cafeName,
    tableLabel: tableLabel,
    qrBuffer: qrBuffer,
  });
}

module.exports = {
  getLocalIP,
  resolveBaseUrl,
  renderTableQrCardPng,
  tableDisplayLabel,
  buildCustomerTableUrl,
};
