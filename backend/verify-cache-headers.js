/**
 * verify-cache-headers.js
 * Run this AFTER the backend is started: node verify-cache-headers.js
 * It checks Cache-Control headers for /customer, /customer/assets/*.js, /customer/assets/*.css
 */
const http = require('http');
const path = require('path');
const fs   = require('fs');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Discover actual asset filenames from the dist/assets folder
const distAssets = path.join(__dirname, '..', 'frontend', 'customer', 'dist', 'assets');
const assetFiles = fs.readdirSync(distAssets);
const jsFile  = assetFiles.find(f => f.endsWith('.js')  && f.startsWith('index-'));
const cssFile = assetFiles.find(f => f.endsWith('.css') && f.startsWith('index-'));

const CHECKS = [
  {
    label : '/customer (index.html via SPA route)',
    path  : '/customer',
    expect: 'no-store',
  },
  {
    label : `/customer/assets/${jsFile} (hashed JS)`,
    path  : `/customer/assets/${jsFile}`,
    expect: 'public, max-age=31536000, immutable',
  },
  {
    label : `/customer/assets/${cssFile} (hashed CSS)`,
    path  : `/customer/assets/${cssFile}`,
    expect: 'public, max-age=31536000, immutable',
  },
];

let passed = 0;
let failed = 0;

function checkUrl({ label, path: urlPath, expect }) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: urlPath }, (res) => {
      const actual = res.headers['cache-control'] || '(none)';
      const ok = actual.includes(expect);
      if (ok) {
        console.log(`  ✅ PASS  ${label}`);
        console.log(`         cache-control: ${actual}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL  ${label}`);
        console.log(`         expected : ${expect}`);
        console.log(`         received : ${actual}`);
        failed++;
      }
      res.resume(); // drain
      resolve();
    });
    req.on('error', (err) => {
      console.log(`  ❌ ERROR ${label}: ${err.message}`);
      failed++;
      resolve();
    });
  });
}

(async () => {
  console.log(`\nVerifying Cache-Control headers on http://${HOST}:${PORT}\n`);
  for (const check of CHECKS) {
    await checkUrl(check);
  }
  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
