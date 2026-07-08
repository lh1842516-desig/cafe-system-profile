/**
 * تخطيط بطاقة QR للطاولة — مصدر واحد للتصميم (اسم الكافيه، QR، رقم الطاولة، تعليمات Wi-Fi).
 */
const sharp = require('sharp');

const WIFI_INSTRUCTION =
  'يرجى الاتصال بشبكة Wi-Fi الخاصة بالكافيه قبل مسح الكود';

const LAYOUT = {
  width: 560,
  paddingX: 48,
  paddingTop: 48,
  paddingBottom: 48,
  qrSize: 380,
  cafeNameFontSize: 28,
  tableLabelFontSize: 24,
  wifiFontSize: 20,
  gapAfterCafe: 20,
  gapAfterQr: 24,
  gapAfterTable: 16,
  wifiBlockHeight: 80,
};

function escapeXml(str) {
  return String(str != null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTableQrCardSvg(opts) {
  const cafeName = escapeXml(opts.cafeName || 'الكافيه');
  const tableLine = escapeXml('طاولة رقم ' + (opts.tableLabel || '—'));
  const qrBase64 = opts.qrBase64 || '';
  const W = LAYOUT.width;
  const qrSize = LAYOUT.qrSize;
  const qrX = (W - qrSize) / 2;

  const cafeY = LAYOUT.paddingTop + 32;
  const qrY = cafeY + LAYOUT.gapAfterCafe;
  const tableY = qrY + qrSize + LAYOUT.gapAfterQr + 26;
  const wifiY = tableY + LAYOUT.gapAfterTable + 8;
  const wifiLine1 = escapeXml('📶 يرجى الاتصال بشبكة Wi-Fi الخاصة بالكافيه');
  const wifiLine2 = escapeXml('قبل مسح الكود');
  const H = wifiY + LAYOUT.wifiBlockHeight + LAYOUT.paddingBottom;
  const cx = W / 2;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg width="' +
    W +
    '" height="' +
    H +
    '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="100%" height="100%" fill="#FFFFFF"/>' +
    '<text x="' +
    cx +
    '" y="' +
    cafeY +
    '" text-anchor="middle" direction="rtl" ' +
    'font-family="Tahoma, Segoe UI, Arial, sans-serif" font-size="' +
    LAYOUT.cafeNameFontSize +
    '" font-weight="700" fill="#1a1a1a">' +
    cafeName +
    '</text>' +
    '<image x="' +
    qrX +
    '" y="' +
    qrY +
    '" width="' +
    qrSize +
    '" height="' +
    qrSize +
    '" href="data:image/png;base64,' +
    qrBase64 +
    '"/>' +
    '<text x="' +
    cx +
    '" y="' +
    tableY +
    '" text-anchor="middle" direction="rtl" ' +
    'font-family="Tahoma, Segoe UI, Arial, sans-serif" font-size="' +
    LAYOUT.tableLabelFontSize +
    '" font-weight="700" fill="#1a1a1a">' +
    tableLine +
    '</text>' +
    '<text x="' +
    cx +
    '" y="' +
    (wifiY + 22) +
    '" text-anchor="middle" direction="rtl" ' +
    'font-family="Tahoma, Segoe UI, Arial, sans-serif" font-size="' +
    LAYOUT.wifiFontSize +
    '" font-weight="600" fill="#374151">' +
    '<tspan x="' +
    cx +
    '" dy="0">' +
    wifiLine1 +
    '</tspan>' +
    '<tspan x="' +
    cx +
    '" dy="26">' +
    wifiLine2 +
    '</tspan>' +
    '</text></svg>'
  );
}

/**
 * @param {{ cafeName: string, tableLabel: string, qrBuffer: Buffer }} opts
 * @returns {Promise<Buffer>}
 */
async function composeTableQrCard(opts) {
  const qrBuffer = opts && opts.qrBuffer;
  if (!Buffer.isBuffer(qrBuffer) || !qrBuffer.length) {
    throw new Error('invalid_qr_buffer');
  }
  const svg = buildTableQrCardSvg({
    cafeName: opts.cafeName,
    tableLabel: opts.tableLabel,
    qrBase64: qrBuffer.toString('base64'),
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  WIFI_INSTRUCTION,
  LAYOUT,
  composeTableQrCard,
};
