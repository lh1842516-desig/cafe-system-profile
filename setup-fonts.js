// This file was used once to bundle fonts into frontend/fonts/.
// Font files are now committed to the repository. Delete this file.

'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const FONTS_DIR = path.join(__dirname, 'frontend', 'fonts');
fs.mkdirSync(FONTS_DIR, { recursive: true });

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        // Chrome UA → Google returns WOFF2 instead of TTF
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return getBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  // ── 1. Copy Tajawal WOFF2 from customer/public/fonts/ ──────────────────
  console.log('\n── Step 1: Copying Tajawal WOFF2 files from customer/public/fonts/');
  const tajawalSrc = path.join(__dirname, 'frontend', 'customer', 'public', 'fonts');
  for (const w of ['400', '500', '700', '800']) {
    const from = path.join(tajawalSrc, `tajawal-${w}.woff2`);
    const to   = path.join(FONTS_DIR,  `tajawal-${w}.woff2`);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, to);
      const kb = (fs.statSync(to).size / 1024).toFixed(1);
      console.log(`  ✅ tajawal-${w}.woff2  (${kb} KB)`);
    } else {
      console.error(`  ❌ Source not found: ${from}`);
      process.exitCode = 1;
    }
  }

  // ── 2. Download Cairo WOFF2 via Google Fonts CSS API ───────────────────
  console.log('\n── Step 2: Downloading Cairo WOFF2 files via Google Fonts CSS API');
  const cairoWeights = [400, 500, 600, 700, 800, 900];
  for (const w of cairoWeights) {
    try {
      const cssUrl = `https://fonts.googleapis.com/css2?family=Cairo:wght@${w}&display=swap`;
      const css    = (await getBuffer(cssUrl)).toString('utf8');
      // Extract the first woff2 URL from the CSS response
      const match  = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
      if (!match) throw new Error('No woff2 URL found in CSS response');
      const fontBuf = await getBuffer(match[1]);
      const dest    = path.join(FONTS_DIR, `cairo-${w}.woff2`);
      fs.writeFileSync(dest, fontBuf);
      const kb = (fontBuf.length / 1024).toFixed(1);
      console.log(`  ✅ cairo-${w}.woff2  (${kb} KB)`);
    } catch (e) {
      console.error(`  ❌ cairo-${w}: ${e.message}`);
      process.exitCode = 1;
    }
  }

  // ── 3. Summary ──────────────────────────────────────────────────────────
  console.log('\n── Files now in frontend/fonts/:');
  fs.readdirSync(FONTS_DIR)
    .filter(f => f.endsWith('.woff2'))
    .sort()
    .forEach(f => {
      const kb = (fs.statSync(path.join(FONTS_DIR, f)).size / 1024).toFixed(1);
      console.log(`  ${f}  (${kb} KB)`);
    });

  if (process.exitCode) {
    console.error('\n❌ Some files failed. Investigate before deleting this script.');
  } else {
    console.log('\n✅ All font files ready. Delete setup-fonts.js now.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
