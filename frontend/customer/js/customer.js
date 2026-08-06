/**
 * واجهة الزبون — منيو الطلب الذاتي
 * نظام إدارة الكافيه
 *
 * ثلاث شاشات: ترحيب → منيو → تتبع الطلب
 * كل شيء في ملف واحد — لا مكتبات خارجية
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   1. CONSTANTS & PARSE URL
══════════════════════════════════════════════════════════ */
var params = new URLSearchParams(window.location.search);

var rawCafeId = (params.get('cafeId') || '').trim();
if (rawCafeId) {
  try {
    sessionStorage.setItem('cust_cafe_id', rawCafeId);
    localStorage.setItem('cust_last_cafe_id', rawCafeId);
  } catch (_) {}
}
var CAFE_ID = rawCafeId || (function() {
  try { return sessionStorage.getItem('cust_cafe_id') || localStorage.getItem('cust_last_cafe_id') || ''; } catch(_) { return ''; }
})();

var rawTableId = (params.get('tableId') || '').trim();
if (rawTableId) {
  try {
    sessionStorage.setItem('cust_table_id', rawTableId);
    localStorage.setItem('cust_last_table_id', rawTableId);
  } catch (_) {}
}
var TABLE_ID = rawTableId || (function() {
  try { return sessionStorage.getItem('cust_table_id') || localStorage.getItem('cust_last_table_id') || ''; } catch(_) { return ''; }
})();

var IS_QR_SCAN = params.get('qr') === '1' || params.get('scan') === '1' || params.get('qrScan') === 'true' || !!params.get('t');

// Storage Helpers (Robust Persistence across iOS Safari App Switcher & browser restarts)
function getPersistedItem(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch (_) { return null; }
}

function setPersistedItem(key, val) {
  try { localStorage.setItem(key, val); } catch (_) {}
  try { sessionStorage.setItem(key, val); } catch (_) {}
}

function removePersistedItem(key) {
  try { localStorage.removeItem(key); } catch (_) {}
  try { sessionStorage.removeItem(key); } catch (_) {}
}

if ((IS_QR_SCAN || rawTableId) && TABLE_ID) {
  try {
    removePersistedItem('cust_table_closed_' + TABLE_ID);
    if (IS_QR_SCAN && window.history && window.history.replaceState) {
      var cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname +
        '?cafeId=' + encodeURIComponent(CAFE_ID) + '&tableId=' + encodeURIComponent(TABLE_ID);
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    }
  } catch (_) {}
}
var TABLE_LABEL = TABLE_ID ? 'طاولة ' + TABLE_ID : '—';

/* ══════════════════════════════════════════════════════════
   1.5. PERSISTENT CUSTOMER IDENTITY (PCI Layer)
   يُحفظ في localStorage — يبقى بعد إغلاق المتصفح وApp Switch.
   يحتوي فقط على: customerId, sessionId, cafeId, tableId.
   لا يحتوي على طلبات أو سلة أو سجل — المصدر الحقيقي هو قاعدة البيانات.
   مفتاح التخزين: cpid_<cafeId>_<tableId>
══════════════════════════════════════════════════════════ */
var PCI_KEY = CAFE_ID && TABLE_ID ? 'cpid_' + CAFE_ID + '_' + TABLE_ID : (TABLE_ID ? 'cpid_' + TABLE_ID : '');

function getPCI() {
  if (!TABLE_ID) return null;
  try {
    var raw = (PCI_KEY ? localStorage.getItem(PCI_KEY) : null) || localStorage.getItem('cpid_' + TABLE_ID) || localStorage.getItem('cpid_global');
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || (d.tableId && String(d.tableId) !== String(TABLE_ID))) return null;
    return d;
  } catch (_) { return null; }
}

function savePCI(data) {
  if (!data) return;
  try {
    if (PCI_KEY) localStorage.setItem(PCI_KEY, JSON.stringify(data));
    if (TABLE_ID) localStorage.setItem('cpid_' + TABLE_ID, JSON.stringify(data));
    localStorage.setItem('cpid_global', JSON.stringify(data));
  } catch (_) {}
}

function clearPCI() {
  try {
    if (PCI_KEY) localStorage.removeItem(PCI_KEY);
    if (TABLE_ID) localStorage.removeItem('cpid_' + TABLE_ID);
    localStorage.removeItem('cpid_global');
  } catch (_) {}
}

// Session ID — يُحمَّل أولاً من sessionStorage، وعند انتهائه يُستعاد من PCI (Persistent Identity)
var SESSION_ID = (function () {
  try {
    var k = 'cust_session_' + TABLE_ID;
    var v = getPersistedItem(k); // sessionStorage أولاً
    if (!v) {
      // sessionStorage انتهى (إغلاق المتصفح/App Switch) — حاول الاستعادة من PCI
      var pci = getPCI();
      v = (pci && pci.sessionId) ? pci.sessionId
        : ((typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'cs-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      setPersistedItem(k, v); // أعد حفظ في sessionStorage
    }
    return v;
  } catch (_) {
    return 'cs-' + Date.now();
  }
}());

// تهيئة أو تحديث Persistent Customer Identity بعد تحديد SESSION_ID النهائي
(function initPCI() {
  if (!CAFE_ID || !TABLE_ID) return;
  try {
    var pci = getPCI();
    var custId = (pci && pci.customerId) ? pci.customerId
      : ((typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    savePCI({ customerId: custId, sessionId: SESSION_ID, cafeId: CAFE_ID, tableId: TABLE_ID });
  } catch (_) {}
}());

// Persisted customer name
var CUSTOMER_NAME_KEY = 'cust_name';
function getSavedName() {
  try { return (getPersistedItem(CUSTOMER_NAME_KEY) || '').trim(); } catch(_) { return ''; }
}
function saveName(n) {
  try { setPersistedItem(CUSTOMER_NAME_KEY, (n || '').trim()); } catch(_) {}
}

// Instant Active Order Cache (per table)
var ACTIVE_ORDER_CACHE_KEY = 'cust_active_order_' + TABLE_ID;
function saveActiveOrderCache(data) {
  try {
    if (!data) { removePersistedItem(ACTIVE_ORDER_CACHE_KEY); return; }
    setPersistedItem(ACTIVE_ORDER_CACHE_KEY, JSON.stringify(data));
  } catch (_) {}
}
function getActiveOrderCache() {
  try {
    var raw = getPersistedItem(ACTIVE_ORDER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

// Waiter cooldown: 60s between calls
var WAITER_COOLDOWN_MS = 60000;
var lastWaiterCall = 0;

/* ══════════════════════════════════════════════════════════
   2. STATE
══════════════════════════════════════════════════════════ */
var state = {
  cafeInfo: {},        // { cafeName, logoUrl }
  menu: [],        // raw menu items from API
  categories: [],        // derived category list
  cart: [],        // [{ item, qty, options, note }]
  activeCategory: '',        // '' = all
  searchQuery: '',
  currentSheet: null,      // 'product' | 'cart' | null
  productSheetItem: null,   // item being viewed
  productSheetQty: 1,
  productSheetOpts: {},     // { [groupTitle]: value | value[] }
  orderId: null,     // after order placed
  orderItems: [],       // items in placed order (for display)
  orderStatus: null,     // kitchen status string
  orderDisplayId: null,     // e.g. "T3-001"
  editingOrderId: null,     // orderId currently being edited
  customerName: '',
  isBillRequested: false,   // true if bill requested for table
  socket: null,
  pollingTimer: null,
};

/* ══════════════════════════════════════════════════════════
   3. DOM SHORTCUTS
══════════════════════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }

var screens = {
  welcome: $('screenWelcome'),
  menu: $('screenMenu'),
  tracker: $('screenTracker'),
};

/* ══════════════════════════════════════════════════════════
   4. API HELPERS
══════════════════════════════════════════════════════════ */
var API_BASE = (function () {
  var o = window.location.origin;
  if (o && o !== 'null') return o;
  return 'http://127.0.0.1:3000';
}());

function resolveAssetUrl(url) {
  if (!url) return '';
  var s = String(url).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^data:/i.test(s)) return s;
  var base = String(API_BASE || '').replace(/\/$/, '');
  return base + (s.charAt(0) === '/' ? s : '/' + s);
}

async function apiFetch(path, opts) {
  var options = Object.assign({ headers: {}, credentials: 'same-origin' }, opts || {});
  options.headers['x-cafe-id'] = CAFE_ID;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  var res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    var err;
    try { err = await res.json(); } catch (_) { err = { error: 'خطأ في الخادم' }; }
    throw new Error(err.error || 'خطأ في الخادم');
  }
  return res.json();
}

/* ══════════════════════════════════════════════════════════
   5. SCREEN MANAGER
══════════════════════════════════════════════════════════ */
var currentScreen = 'welcome';

function showScreen(name) {
  if (currentScreen === name) return;

  var oldEl = screens[currentScreen];
  var newEl = screens[name];
  if (!newEl) return;

  // Animate out old
  if (oldEl) {
    oldEl.classList.add('screen--exiting');
    setTimeout(function () {
      oldEl.hidden = true;
      oldEl.classList.remove('screen--exiting');
    }, 350);
  }

  // Animate in new
  newEl.hidden = false;
  newEl.classList.add('screen--entering');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      newEl.classList.remove('screen--entering');
    });
  });

  currentScreen = name;
}

/* ══════════════════════════════════════════════════════════
   6. TOAST SYSTEM
══════════════════════════════════════════════════════════ */
function showToast(msg, type, durationMs) {
  var container = $('toastContainer');
  if (!container) return;
  var existingToasts = container.querySelectorAll('.toast');
  for (var i = 0; i < existingToasts.length; i++) {
    if (existingToasts[i].textContent === msg) return;
  }
  var el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  container.appendChild(el);

  var ttl = durationMs || 3200;
  setTimeout(function () {
    el.classList.add('toast-exit');
    setTimeout(function () { el.remove(); }, 350);
  }, ttl);
}

/* ══════════════════════════════════════════════════════════
   7. FORMAT HELPERS
══════════════════════════════════════════════════════════ */
function fmtPrice(p) {
  var num = Number(p || 0);
  return num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' IQD';
}

function optionsSummary(opts) {
  if (!opts || !Object.keys(opts).length) return '';
  return Object.values(opts).map(function (v) {
    return Array.isArray(v) ? v.join('، ') : v;
  }).join(' · ');
}

function cartItemSubtotal(ci) {
  return (ci.item.price || 0) * (ci.qty || 1);
}

function getCartTotal() {
  return state.cart.reduce(function (s, ci) { return s + cartItemSubtotal(ci); }, 0);
}

function getCartCount() {
  return state.cart.reduce(function (s, ci) { return s + (ci.qty || 1); }, 0);
}

/* ══════════════════════════════════════════════════════════
   8. WELCOME SCREEN
══════════════════════════════════════════════════════════ */
function renderWelcome() {
  // Validate URL params
  if (!CAFE_ID || !TABLE_ID) {
    $('welcomeContent').hidden = true;
    $('welcomeError').hidden = false;
    return;
  }

  $('welcomeContent').hidden = false;
  $('welcomeError').hidden = true;
  $('welcomeTableLabel').textContent = TABLE_LABEL;
  $('welcomeTableBadge').setAttribute('aria-label', 'رقم الطاولة: ' + TABLE_LABEL);
  if (state.cafeInfo && state.cafeInfo.cafeName) {
    $('welcomeCafeName').textContent = state.cafeInfo.cafeName;
    var btn = $('btnStartOrdering');
    btn.disabled = false;
    $('btnStartOrderingLabel').textContent = 'ابدأ الطلب ←';
    $('btnStartOrderingSpinner').hidden = true;
  } else {
    $('welcomeCafeName').textContent = 'يتم التحميل...';
    var btn = $('btnStartOrdering');
    btn.disabled = true;
    $('btnStartOrderingLabel').textContent = 'جارٍ التحميل...';
    $('btnStartOrderingSpinner').hidden = false;
  }
}

function setWelcomeCafeInfo(info) {
  if (!info) return;
  if (info.cafeName) {
    $('welcomeCafeName').textContent = info.cafeName;
  } else {
    $('welcomeCafeName').textContent = 'أهلاً بك 👋';
  }

  if (info.logoUrl) {
    var img = document.createElement('img');
    img.src = resolveAssetUrl(info.logoUrl);
    img.alt = 'شعار الكافيه';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.onerror = function () { /* keep placeholder */ };
    var wrap = $('welcomeLogoWrap');
    wrap.innerHTML = '';
    wrap.appendChild(img);
  }

  var btn = $('btnStartOrdering');
  btn.disabled = false;
  $('btnStartOrderingLabel').textContent = 'ابدأ الطلب ←';
  $('btnStartOrderingSpinner').hidden = true;
}

/* ══════════════════════════════════════════════════════════
   9. MENU SCREEN — SETUP
══════════════════════════════════════════════════════════ */
function renderMenuHeader() {
  var info = state.cafeInfo;
  $('menuCafeName').textContent = info.cafeName || 'الكافيه';
  $('menuTableLabel').textContent = TABLE_LABEL;
  $('trackerCafeName').textContent = info.cafeName || 'الكافيه';
  $('trackerTableLabel').textContent = TABLE_LABEL;

  if (info.logoUrl) {
    var img = document.createElement('img');
    img.src = resolveAssetUrl(info.logoUrl);
    img.alt = 'شعار';
    img.className = 'menu-header-logo';
    img.onerror = function () { };
    var wrap = $('menuLogoEl');
    wrap.parentNode.replaceChild(img, wrap);
  }

  // Cart sheet table badge
  $('cartSheetTableBadge').textContent = TABLE_LABEL;
}

function buildCategories() {
  var cats = [];
  if (Array.isArray(state.allCategories)) {
    state.allCategories.forEach(function (c) {
      var name = typeof c === 'object' && c ? String(c.name || '').trim() : String(c || '').trim();
      if (name && !cats.includes(name)) cats.push(name);
    });
  }
  state.menu.forEach(function (item) {
    var c = (item.category || '').trim();
    if (c && !cats.includes(c)) cats.push(c);
  });
  state.categories = cats;
}

function renderCategories() {
  var nav = $('menuCategories');
  nav.innerHTML = '';

  // "الكل"
  var allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = 'cat-tab' + (state.activeCategory === '' ? ' active' : '');
  allTab.textContent = 'الكل';
  allTab.setAttribute('aria-pressed', state.activeCategory === '' ? 'true' : 'false');
  allTab.addEventListener('click', function () { selectCategory(''); });
  nav.appendChild(allTab);

  state.categories.forEach(function (cat) {
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'cat-tab' + (state.activeCategory === cat ? ' active' : '');
    tab.textContent = cat;
    tab.setAttribute('aria-pressed', state.activeCategory === cat ? 'true' : 'false');
    tab.addEventListener('click', function () { selectCategory(cat); });
    nav.appendChild(tab);
  });
}

function selectCategory(cat) {
  state.activeCategory = cat;
  state.searchQuery = '';
  renderCategories();
  renderProducts();
  // Scroll categories tab into view
  var active = $('menuCategories').querySelector('.cat-tab.active');
  if (active) active.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════
   10. PRODUCT GRID
══════════════════════════════════════════════════════════ */
var FOOD_EMOJIS = ['🍕', '🍔', '🌮', '🍜', '🍣', '☕', '🧁', '🥗', '🍰', '🥤', '🧆', '🍗', '🧇', '🥙'];

function randEmoji(name) {
  var idx = 0;
  for (var i = 0; i < name.length; i++) idx += name.charCodeAt(i);
  return FOOD_EMOJIS[idx % FOOD_EMOJIS.length];
}

function getFilteredProducts() {
  var items = state.menu;

  if (state.searchQuery) {
    var q = state.searchQuery.toLowerCase();
    items = items.filter(function (m) {
      return (m.name || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q);
    });
  } else if (state.activeCategory) {
    items = items.filter(function (m) { return m.category === state.activeCategory; });
  }

  return items;
}

function renderProducts() {
  var items = getFilteredProducts();
  var grid = $('menuProductsGrid');
  var empty = $('menuEmpty');

  grid.innerHTML = '';

  if (!items.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach(function (item) {
    var isAvail = item.isAvailable !== false && item.is_available !== false;
    var card = document.createElement('div');
    card.className = 'product-card' + (isAvail ? '' : ' is-unavailable');
    card.setAttribute('role', 'button');
    if (isAvail) {
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', item.name + ' — ' + fmtPrice(item.price));
    } else {
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('aria-label', item.name + ' — غير متوفر');
    }

    // Image
    var imgHtml = '';
    if (item.imageUrl) {
      imgHtml = '<div class="product-card-img-wrap"><img src="' + resolveAssetUrl(item.imageUrl) + '" alt="' + (item.name || '') + '" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=&quot;product-card-placeholder&quot;>' + randEmoji(item.name || '') + '</div>\'"></div>';
    } else {
      imgHtml = '<div class="product-card-img-wrap"><div class="product-card-placeholder">' + randEmoji(item.name || '') + '</div></div>';
    }

    var unavailableBadgeHtml = isAvail ? '' : '<div class="product-card-badge-unavailable">غير متوفر</div>';

    card.innerHTML =
      unavailableBadgeHtml +
      imgHtml +
      '<div class="product-card-body">' +
      '<div class="product-card-name">' + escHtml(item.name || '') + '</div>' +
      '<div class="product-card-price">' + fmtPrice(item.price) + '</div>' +
      '</div>' +
      (isAvail ? '<button type="button" class="product-card-add" aria-label="إضافة ' + escHtml(item.name || '') + '">+</button>' : '');

    // Tap card → open sheet (only if available)
    card.addEventListener('click', function (e) {
      if (!isAvail) {
        // Product is unavailable: do nothing, do not open model sheet or show alert
        return;
      }
      if (e.target.classList.contains('product-card-add')) return;
      openProductSheet(item);
    });
    card.addEventListener('keydown', function (e) {
      if (!isAvail) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProductSheet(item); }
    });

    // Tap + button
    if (isAvail) {
      var addBtn = card.querySelector('.product-card-add');
      if (addBtn) {
        addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openProductSheet(item);
        });
      }
    }

    grid.appendChild(card);
  });
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

/* ══════════════════════════════════════════════════════════
   11. PRODUCT BOTTOM SHEET
══════════════════════════════════════════════════════════ */
function openProductSheet(item) {
  if (!item || item.isAvailable === false || item.is_available === false) return;
  state.productSheetItem = item;
  state.productSheetQty = 1;
  state.productSheetOpts = {};

  // Image
  var imgWrap = $('productSheetImgWrap');
  if (item.imageUrl) {
    imgWrap.innerHTML = '<img class="product-sheet-img" src="' + resolveAssetUrl(item.imageUrl) + '" alt="' + escHtml(item.name || '') + '" onerror="this.parentNode.innerHTML=\'<div class=&quot;product-sheet-img-placeholder&quot;>' + randEmoji(item.name || '') + '</div>\'">';
  } else {
    imgWrap.innerHTML = '<div class="product-sheet-img-placeholder">' + randEmoji(item.name || '') + '</div>';
  }

  $('productSheetName').textContent = item.name || '';
  $('productSheetPrice').textContent = fmtPrice(item.price);
  $('productSheetDesc').textContent = item.ingredients || '';
  $('productNote').value = '';
  $('qtyVal').textContent = '1';
  $('qtyMinus').disabled = true;

  // Options
  var optsContainer = $('productSheetOptions');
  optsContainer.innerHTML = '';
  var groups = Array.isArray(item.options) ? item.options : [];
  groups.forEach(function (g) {
    if (!g || !g.title || !Array.isArray(g.values) || !g.values.length) return;
    var isMulti = g.type === 'multi';

    var groupEl = document.createElement('div');
    groupEl.className = 'options-group';

    var titleEl = document.createElement('div');
    titleEl.className = 'options-group-title';
    titleEl.textContent = g.title;
    groupEl.appendChild(titleEl);

    var pillsEl = document.createElement('div');
    pillsEl.className = 'options-pills';

    g.values.forEach(function (val) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'option-pill';
      pill.textContent = val;
      pill.setAttribute('aria-pressed', 'false');
      pill.addEventListener('click', function () {
        if (isMulti) {
          // Toggle
          pill.classList.toggle('selected');
          pill.setAttribute('aria-pressed', String(pill.classList.contains('selected')));
          var selected = Array.from(pillsEl.querySelectorAll('.option-pill.selected')).map(function (p) { return p.textContent; });
          if (selected.length) state.productSheetOpts[g.title] = selected;
          else delete state.productSheetOpts[g.title];
        } else {
          // Single — toggle selection (allow unselecting)
          var wasSelected = pill.classList.contains('selected');
          pillsEl.querySelectorAll('.option-pill').forEach(function (p) {
            p.classList.remove('selected');
            p.setAttribute('aria-pressed', 'false');
          });
          if (wasSelected) {
            delete state.productSheetOpts[g.title];
          } else {
            pill.classList.add('selected');
            pill.setAttribute('aria-pressed', 'true');
            state.productSheetOpts[g.title] = val;
          }
        }
        updateAddToCartBtn();
      });
      pillsEl.appendChild(pill);
    });

    groupEl.appendChild(pillsEl);
    optsContainer.appendChild(groupEl);
  });

  updateAddToCartBtn();
  openSheet('product');
}

function updateAddToCartBtn() {
  var item = state.productSheetItem;
  var btn = $('btnAddToCart');
  if (!btn) return;
  btn.disabled = false;
  var total = (item ? item.price : 0) * state.productSheetQty;
  btn.textContent = 'إضافة إلى السلة · ' + fmtPrice(total);
}

function addToCart() {
  var item = state.productSheetItem;
  if (!item) return;

  state.cart.push({
    item: item,
    qty: state.productSheetQty,
    options: Object.assign({}, state.productSheetOpts),
    note: ($('productNote').value || '').trim(),
  });

  closeSheet('product');
  updateCartBar();
  showToast('✓ تمت الإضافة: ' + item.name, 'success', 2200);
}

/* ══════════════════════════════════════════════════════════
   12. CART BAR (always visible)
══════════════════════════════════════════════════════════ */
function updateCartBar() {
  var count = getCartCount();
  var badgeEl = $('cartFabBadge');
  if (badgeEl) {
    if (count > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = count;
    } else {
      badgeEl.hidden = true;
      badgeEl.textContent = '0';
    }
  }
}

/* ══════════════════════════════════════════════════════════
   12.5. NAVIGATION DRAWER
══════════════════════════════════════════════════════════ */
function openDrawer() {
  var overlay = $('drawerOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeDrawer() {
  var overlay = $('drawerOverlay');
  if (overlay) overlay.classList.remove('open');
}

/* ══════════════════════════════════════════════════════════
   13. CART BOTTOM SHEET
══════════════════════════════════════════════════════════ */
function renderCartSheet() {
  var list = $('cartItemsList');
  list.innerHTML = '';

  state.cart.forEach(function (ci, idx) {
    var opts = optionsSummary(ci.options);
    var sub = cartItemSubtotal(ci);

    var row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML =
      '<div>' +
      '<div class="cart-item-name">' + escHtml(ci.item.name || '') + '</div>' +
      (opts ? '<div class="cart-item-options">' + escHtml(opts) + '</div>' : '') +
      (ci.note ? '<div class="cart-item-note">📝 ' + escHtml(ci.note) + '</div>' : '') +
      '<div class="cart-item-subtotal">' + fmtPrice(sub) + '</div>' +
      '</div>' +
      '<div class="cart-item-controls">' +
      '<div class="cart-item-qty-stepper" role="group" aria-label="كمية ' + escHtml(ci.item.name || '') + '">' +
      '<button type="button" class="qty-btn" data-idx="' + idx + '" data-action="minus" aria-label="تقليل" ' + (ci.qty <= 1 ? 'disabled' : '') + '>−</button>' +
      '<span class="qty-val">' + ci.qty + '</span>' +
      '<button type="button" class="qty-btn" data-idx="' + idx + '" data-action="plus" aria-label="زيادة">+</button>' +
      '</div>' +
      '<button type="button" class="btn-cart-remove" data-idx="' + idx + '" aria-label="حذف ' + escHtml(ci.item.name || '') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>' +
      '</div>';

    list.appendChild(row);
  });

  $('cartSheetTotal').textContent = fmtPrice(getCartTotal());

  var sendBtn = $('btnSendOrder');
  if (sendBtn) {
    if (state.editingOrderId) {
      sendBtn.textContent = 'تأكيد تعديل الطلب ✓';
    } else {
      sendBtn.textContent = 'إرسال الطلب 🚀';
    }
    sendBtn.disabled = (state.cart.length === 0);
  }

  // Bind qty/remove buttons
  list.querySelectorAll('.qty-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = parseInt(btn.dataset.idx, 10);
      var act = btn.dataset.action;
      if (act === 'plus') state.cart[i].qty += 1;
      if (act === 'minus') state.cart[i].qty = Math.max(1, state.cart[i].qty - 1);
      updateCartBar();
      renderCartSheet();
    });
  });
  list.querySelectorAll('.btn-cart-remove').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var targetBtn = e.target.closest('.btn-cart-remove') || btn;
      var i = parseInt(targetBtn.dataset.idx, 10);
      state.cart.splice(i, 1);
      updateCartBar();
      if (state.cart.length === 0) {
        renderCartSheet();
        showToast('🛒 السلة فارغة', '', 2000);
      } else {
        renderCartSheet();
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════
   14. SHEET MANAGER (open / close)
══════════════════════════════════════════════════════════ */
function getSheetOverlayId(which) {
  if (which === 'product') return 'productSheetOverlay';
  if (which === 'cart') return 'cartSheetOverlay';
  if (which === 'history') return 'historySheetOverlay';
  return null;
}

function openSheet(which) {
  var overlayId = getSheetOverlayId(which);
  var overlay = $(overlayId);
  if (!overlay) return;

  if (which === 'cart') renderCartSheet();

  overlay.classList.add('open');
  state.currentSheet = which;
  document.body.style.overflow = 'hidden';
}

function closeSheet(which) {
  var overlayId = getSheetOverlayId(which);
  var overlay = $(overlayId);
  if (!overlay) return;

  overlay.classList.remove('open');
  if (state.currentSheet === which) state.currentSheet = null;
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════════════════════
   14.5. ORDER HISTORY SHEET (سجل طلباتي)
══════════════════════════════════════════════════════════ */
async function openHistorySheet() {
  closeDrawer();
  $('historySheetTableBadge').textContent = TABLE_LABEL;
  openSheet('history');
  await renderHistorySheet();
}

async function renderHistorySheet() {
  var body = $('historySheetBody');
  body.innerHTML = '<div class="history-empty"><span class="spinner dark"></span> جاري تحضير السجل...</div>';

  var ordersList = [];
  try {
    var allOrders = await apiFetch('/api/orders/table/' + TABLE_ID);
    if (Array.isArray(allOrders)) {
      ordersList = allOrders.filter(function (o) {
        if (String(o.tableId) !== TABLE_ID) return false;
        if (o.closed) return false;
        if (o.cancelledByCustomer || o.cancelReason === 'customer_cancel_pending') return false;
        // فلترة صارمة بـ SESSION_ID فقط — لمنع تسرب بيانات زبائن آخرين على نفس الطاولة
        if (o.customerSessionId && o.customerSessionId === SESSION_ID) return true;
        if (state.orderId && String(o.id) === String(state.orderId)) return true;
        return false;
      });
    }
  } catch (_) {
    ordersList = [];
  }

  body.innerHTML = '';

  if (!ordersList.length) {
    body.innerHTML =
      '<div class="history-empty">' +
      '<div class="history-empty-icon">🍽️</div>' +
      '<div class="history-empty-text">لا توجد طلبات في جلسة الطاولة الحالية</div>' +
      '</div>';
    $('historyGrandTotal').textContent = fmtPrice(0);
    return;
  }

  var grandTotal = 0;

  var ordersWithStatus = await Promise.all(ordersList.map(async function (order) {
    var statusText = 'مكتمل ✅';
    var statusCls = 'completed';

    if (order.closed) {
      var wasRejected = Boolean(order.rejectedByCashier) || order.cancelReason === 'cashier_rejected_approval';
      if (wasRejected) {
        statusText = 'تعذّر الطلب ❌';
        statusCls = 'rejected';
      } else {
        statusText = 'مكتمل ✅';
        statusCls = 'completed';
      }
    } else {
      try {
        var kData = await apiFetch('/api/orders/' + order.id + '/kitchen-status');
        var raw = (kData && kData.status) || 'pending';
        var held = Boolean(kData && kData.awaitingCashierApproval);
        if (held) {
          statusText = 'بانتظار الموافقة ⏳';
          statusCls = 'held';
        } else if (raw === 'preparing') {
          statusText = 'جاري التجهيز 👨‍🍳';
          statusCls = 'preparing';
        } else if (raw === 'done' || raw === 'completed') {
          statusText = 'جاهز! 🎉';
          statusCls = 'completed';
        } else if (raw === 'rejected') {
          statusText = 'تعذّر الطلب ❌';
          statusCls = 'rejected';
        } else {
          statusText = 'في الانتظار 🔵';
          statusCls = 'waiting';
        }
      } catch (_) {
        statusText = 'في الانتظار 🔵';
        statusCls = 'waiting';
      }
    }
    return { order: order, statusText: statusText, statusCls: statusCls };
  }));

  ordersWithStatus.forEach(function (item, idx) {
    var order = item.order;
    var statusText = item.statusText;
    var statusCls = item.statusCls;

    var orderNum = 'الطلب #' + (idx + 1) + (order.displayOrderId ? ' (' + order.displayOrderId + ')' : '');

    var subtotal = (order.items || []).reduce(function (sum, it) {
      return sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1));
    }, 0);
    grandTotal += subtotal;

    var card = document.createElement('div');
    card.className = 'history-order-card';

    var itemsHtml = (order.items || []).map(function (it) {
      var opts = optionsSummary(it.selectedOptions);
      return '<div class="history-order-item-row">' +
        '<span class="history-order-item-name">• ' + (it.quantity || 1) + ' × ' + escHtml(it.name || '') + (opts ? ' (' + escHtml(opts) + ')' : '') + '</span>' +
        '<span class="history-order-item-qty">' + fmtPrice((it.price || 0) * (it.quantity || 1)) + '</span>' +
        '</div>';
    }).join('');

    card.innerHTML =
      '<div class="history-order-header">' +
      '<span class="history-order-num">' + escHtml(orderNum) + '</span>' +
      '<span class="history-order-status-badge ' + statusCls + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="history-order-items">' + itemsHtml + '</div>' +
      '<div class="history-order-footer">' +
      '<span class="history-order-subtotal-label">الإجمالي:</span>' +
      '<span class="history-order-subtotal-val">' + fmtPrice(subtotal) + '</span>' +
      '</div>';

    body.appendChild(card);
  });

  $('historyGrandTotal').textContent = fmtPrice(grandTotal);
}

/* ══════════════════════════════════════════════════════════
   15. NAME MODAL
══════════════════════════════════════════════════════════ */
function openNameModal() {
  var saved = getSavedName();
  $('customerNameInput').value = saved || '';
  $('nameModalOverlay').classList.add('open');
  // Delay autofocus to let transition play
  setTimeout(function () { $('customerNameInput').focus(); }, 300);
}

function closeNameModal() {
  $('nameModalOverlay').classList.remove('open');
}

/* ══════════════════════════════════════════════════════════
   16. ORDER SUBMISSION
══════════════════════════════════════════════════════════ */
async function submitOrder() {
  var name = ($('customerNameInput').value || '').trim().slice(0, 30);
  if (!name) {
    $('customerNameInput').focus();
    showToast('يرجى إدخال اسمك', 'error');
    return;
  }
  saveName(name);
  state.customerName = name;

  var btn = $('btnConfirmOrder');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جارٍ الإرسال...';

  try {
    if (state.editingOrderId) {
      try {
        await apiFetch('/api/orders/' + state.editingOrderId + '/cancel-by-customer', {
          method: 'POST',
          body: { tableId: TABLE_ID },
        });
      } catch (cancelErr) {
        if (cancelErr.message && cancelErr.message.includes('التجهيز')) {
          showToast('❌ لا يمكن التعديل لأن المطبخ بدأ تجهيز الطلب السابق', 'error', 4000);
          btn.disabled = false;
          btn.textContent = 'تأكيد الطلب ✓';
          return;
        }
      }
      state.editingOrderId = null;
    }

    var items = state.cart.map(function (ci) {
      return {
        menuId: ci.item.id,
        quantity: ci.qty,
        note: ci.note || '',
        selectedOptions: ci.options || {},
      };
    });

    var order = await apiFetch('/api/orders', {
      method: 'POST',
      body: {
        tableId: TABLE_ID,
        items: items,
        customerName: name,
        customerSessionId: SESSION_ID,
        customerId: (getPCI() && getPCI().customerId) || undefined,
        orderType: 'DINE_IN',
      },
    });

    state.orderId = order.id;
    state.orderItems = order.items || [];
    state.orderDisplayId = order.displayOrderId || order.id;
    state.orderStatus = 'waiting';
    setPersistedItem('cust_last_order_id_' + TABLE_ID, order.id);
    saveActiveOrderCache({
      id: order.id,
      displayOrderId: order.displayOrderId || order.id,
      items: order.items || [],
      customerName: name,
      status: 'waiting'
    });

    // Connect socket (if not already)
    connectSocket();

    // Immediately fetch actual kitchen status (held vs waiting/new)
    await fetchAndUpdateStatus();

    // Clear cart
    state.cart = [];
    updateCartBar();

    // Close overlays
    closeNameModal();
    closeSheet('cart');

    // Navigate to tracker
    renderTracker();
    showScreen('tracker');

    // Show order status card on menu
    updateOrderStatusCard();

  } catch (err) {
    showToast('❌ ' + (err.message || 'فشل الإرسال'), 'error', 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الطلب ✓';
  }
}

/* ══════════════════════════════════════════════════════════
   16.5. RESET CUSTOMER SESSION & RETURN TO WELCOME (إعادة تعيين الطاولة)
══════════════════════════════════════════════════════════ */
function resetCustomerSessionAndReturnToWelcome() {
  if (currentScreen === 'welcome' && !state.orderId && (!state.cart || state.cart.length === 0)) {
    return;
  }

  // 1. Clear local session items for this table & flag table closed by cashier
  try {
    removePersistedItem('cust_session_' + TABLE_ID);
    removePersistedItem('cust_name');
    removePersistedItem('cust_active_order_' + TABLE_ID);
    removePersistedItem('cust_last_order_id_' + TABLE_ID);
    setPersistedItem('cust_table_closed_' + TABLE_ID, '1');
    clearPCI(); // حذف Persistent Customer Identity عند إغلاق الطاولة
  } catch (_) {}

  // 2. Generate a fresh new Customer Session ID
  SESSION_ID = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'cs-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  // حفظ PCI جديدة للجلسة التالية (إن استمر نفس المتصفح في الاستخدام على الطاولة)
  try {
    var _nCid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID() : 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    savePCI({ customerId: _nCid, sessionId: SESSION_ID, cafeId: CAFE_ID, tableId: TABLE_ID });
  } catch (_) {}

  // 3. Reset internal app state
  state.orderId = null;
  state.orderItems = [];
  state.orderStatus = null;
  state.orderDisplayId = null;
  state.editingOrderId = null;
  state.customerName = '';
  state.isBillRequested = false;
  state.cart = [];

  stopPolling();

  // 4. Update UI & Close sheets/drawers
  updateCartBar();
  updateOrderStatusCard();
  closeSheet('cart');
  closeSheet('history');
  closeSheet('product');
  closeDrawer();

  // 5. Navigate to Welcome Screen
  renderWelcome();
  showScreen('welcome');
  showToast('✨ تم إغلاق حساب الطاولة بنجاح، يمكنك الآن البدء بالطلب!', 'success', 5000);
}

/* ══════════════════════════════════════════════════════════
   17. SOCKET.IO
══════════════════════════════════════════════════════════ */
function connectSocket() {
  if (state.socket && state.socket.connected) return;
  if (typeof io === 'undefined') { startPolling(); return; }

  try {
    var sock = io({ query: { cafeId: CAFE_ID }, transports: ['websocket', 'polling'] });
    state.socket = sock;

    sock.on('connect', function () {
      // Join the table room
      sock.emit('join_table_room', { cafeId: CAFE_ID, tableId: TABLE_ID });
    });

    sock.on('table_bill_requested', function (data) {
      if (!data) return;
      var tid = String(data.tableId || '');
      if (tid === TABLE_ID) {
        state.isBillRequested = true;
      }
    });

    sock.on('table_bill_closed', function (data) {
      var tid = data && data.tableId != null ? String(data.tableId) : '';
      if (tid && tid !== TABLE_ID) return;
      state.isBillRequested = false;
      resetCustomerSessionAndReturnToWelcome();
    });

    sock.on('table-status-updated', function (data) {
      if (!data) return;
      var tid = String(data.tableId || '');
      if (tid === TABLE_ID && data.status === 'available' && (data.reason === 'table_bill_closed' || data.closedByCashier || data.isCashierClosure)) {
        state.isBillRequested = false;
        resetCustomerSessionAndReturnToWelcome();
      }
    });

    sock.on('kitchen-updated', function (data) {
      if (!state.orderId) return;
      var oid = (data && (data.orderId || data.id)) || '';
      var matchesOrder = oid && (String(oid) === String(state.orderId) || String(oid) === String(state.orderDisplayId));
      if (!matchesOrder) return;
      if (data && data.status) {
        var s = String(data.status).toLowerCase();
        if (s === 'preparing') state.orderStatus = 'preparing';
        else if (s === 'completed' || s === 'done') state.orderStatus = 'completed';
        else if (s === 'new' || s === 'waiting' || s === 'pending') state.orderStatus = 'waiting';
        else if (s === 'held') state.orderStatus = 'held';
        renderTrackerStatus();
        updateOrderStatusCard();
      }
      fetchAndUpdateStatus();
      var hist = $('historySheetOverlay');
      if (hist && hist.classList.contains('open')) renderHistorySheet();
    });

    sock.on('order_ready', function (data) {
      if (!state.orderId) return;
      var oid = (data && (data.orderId || data.id)) || '';
      var matchesOrder = oid && (String(oid) === String(state.orderId) || String(oid) === String(state.orderDisplayId));
      if (!matchesOrder) return;
      state.orderStatus = 'completed';
      renderTrackerStatus();
      updateOrderStatusCard();
      showToast('🎉 طلبك جاهز! تفضل!', 'success', 5000);
      var hist = $('historySheetOverlay');
      if (hist && hist.classList.contains('open')) renderHistorySheet();
    });

    sock.on('new-order', function (data) {
      // After cashier approval, order goes from held to new
      if (!state.orderId) return;
      var oid = (data && (data.orderId || data.id)) || '';
      var matchesOrder = oid && (String(oid) === String(state.orderId) || String(oid) === String(state.orderDisplayId));
      if (!matchesOrder) return;
      fetchAndUpdateStatus();
    });

    sock.on('cashier-approval-rejected', function (data) {
      // Cashier rejected the order — redirect customer to menu with a clear notice
      if (!data) return;
      var oid = (data.orderId) || '';
      var matchesOrder = oid && state.orderId && (String(oid) === String(state.orderId) || String(oid) === String(state.orderDisplayId));
      var matchesSid = data.customerSessionId && data.customerSessionId === SESSION_ID;
      if (!matchesOrder && !matchesSid) return;
      handleCashierRejection();
    });

    sock.on('menu-updated', function (data) {
      if (!data) return;
      Promise.all([
        apiFetch('/api/menu'),
        apiFetch('/api/categories').catch(function () { return []; })
      ]).then(function (res) {
        state.menu = Array.isArray(res[0]) ? res[0] : [];
        state.allCategories = Array.isArray(res[1]) ? res[1] : [];
        buildCategories();
        if (state.activeCategory && !state.categories.includes(state.activeCategory)) {
          state.activeCategory = '';
        }
        renderCategories();
        renderProducts();
      }).catch(function () {});
    });

    sock.on('disconnect', function () { startPolling(); });
    sock.on('connect_error', function () { startPolling(); });

  } catch (_) { startPolling(); }
}

function startPolling() {
  if (state.pollingTimer) return;
  state.pollingTimer = setInterval(fetchAndUpdateStatus, 20000);
}

function stopPolling() {
  if (state.pollingTimer) { clearInterval(state.pollingTimer); state.pollingTimer = null; }
}

async function fetchAndUpdateStatus() {
  if (!state.orderId || !CAFE_ID) return;
  try {
    var data = await apiFetch('/api/orders/' + state.orderId + '/kitchen-status');
    if (data && data.closed) {
      if (data.cancelledByCustomer) {
        state.orderId = null;
        state.orderItems = [];
        state.orderStatus = null;
        state.orderDisplayId = null;
        state.editingOrderId = null;
        saveActiveOrderCache(null);
        stopPolling();
        updateCartBar();
        updateOrderStatusCard();
        showScreen('menu');
        return;
      }
      // Check if rejected by cashier — return to menu with message, not welcome
      if (data.rejected || data.rejectedByCashier || data.cancelReason === 'cashier_rejected_approval' || data.status === 'rejected') {
        handleCashierRejection();
        return;
      }
      resetCustomerSessionAndReturnToWelcome();
      return;
    }
    var raw = data.status || 'pending';
    var held = data.awaitingCashierApproval;

    var mapped;
    if (held) mapped = 'held';
    else if (raw === 'preparing') mapped = 'preparing';
    else if (raw === 'done' || raw === 'completed') mapped = 'completed';
    else if (raw === 'rejected') mapped = 'rejected';
    else mapped = 'waiting';

    if (mapped !== state.orderStatus) {
      state.orderStatus = mapped;
      renderTrackerStatus();
      updateOrderStatusCard();
    }

    if (state.orderId) {
      saveActiveOrderCache({
        id: state.orderId,
        displayOrderId: state.orderDisplayId,
        items: state.orderItems,
        customerName: state.customerName,
        status: state.orderStatus
      });
    }

    if (mapped === 'completed' || mapped === 'rejected') stopPolling();
  } catch (_) { }
}

/* ══════════════════════════════════════════════════════════
   16.6. CASHIER REJECTION — العودة للمنيو مع رسالة توضيحية
══════════════════════════════════════════════════════════ */
function handleCashierRejection() {
  // Clear the rejected order from state but keep session alive (not full reset)
  state.orderId = null;
  state.orderItems = [];
  state.orderStatus = null;
  state.orderDisplayId = null;
  state.editingOrderId = null;
  state.cart = [];
  saveActiveOrderCache(null);

  stopPolling();
  updateCartBar();
  updateOrderStatusCard();

  // Navigate back to menu (not welcome — customer stays in session)
  showScreen('menu');

  // Show a clear, well-formatted rejection notification
  var msg =
    '❌ تم رفض طلبك من قِبل الكاشير\n' +
    'يُرجى مراجعة الكاشير لإعادة الطلب.';
  showRejectionNotice();
}

function showRejectionNotice() {
  // Remove any existing rejection notice
  var old = document.getElementById('cashierRejectionNotice');
  if (old) old.remove();

  var notice = document.createElement('div');
  notice.id = 'cashierRejectionNotice';
  notice.setAttribute('role', 'alert');
  notice.innerHTML =
    '<div class="rejection-notice__icon">❌</div>' +
    '<div class="rejection-notice__body">' +
      '<div class="rejection-notice__title">تم رفض طلبك</div>' +
      '<div class="rejection-notice__sub">لم يوافق الكاشير على طلبك، يُرجى مراجعة الكاشير لإعادة الطلب.</div>' +
    '</div>' +
    '<button class="rejection-notice__close" aria-label="إغلاق">✕</button>';

  notice.querySelector('.rejection-notice__close').addEventListener('click', function () {
    notice.classList.add('rejection-notice--hiding');
    setTimeout(function () { notice.remove(); }, 350);
  });

  document.body.appendChild(notice);

  // Auto-dismiss after 8 seconds
  setTimeout(function () {
    if (notice.parentNode) {
      notice.classList.add('rejection-notice--hiding');
      setTimeout(function () { if (notice.parentNode) notice.remove(); }, 350);
    }
  }, 8000);
}

/* ══════════════════════════════════════════════════════════
   18. ORDER TRACKER SCREEN
══════════════════════════════════════════════════════════ */
var STATUS_STEPS = [
  { key: 'received', label: 'تم استلام الطلب', sub: '' },
  { key: 'held', label: 'بانتظار موافقة الكاشير', sub: 'تم استلام طلبك، بانتظار موافقة الكاشير.' },
  { key: 'waiting', label: 'في قائمة الانتظار', sub: '' },
  { key: 'preparing', label: 'قيد التجهيز 👨‍🍳', sub: 'يعمل فريق المطبخ على طلبك الآن' },
  { key: 'completed', label: 'جاهز! 🎉', sub: 'تفضل باستلام طلبك' },
];

var STATUS_ORDER = ['received', 'held', 'waiting', 'preparing', 'completed'];

function renderTracker() {
  $('trackerGreeting').textContent = 'أهلاً، ' + state.customerName + '! 👋';
  $('trackerOrderId').textContent = 'رقم الطلب: ' + state.orderDisplayId;

  // Items list
  var list = $('trackerItemsList');
  list.innerHTML = '';
  (state.orderItems || []).forEach(function (it) {
    var row = document.createElement('div');
    row.className = 'tracker-item-row';
    row.innerHTML =
      '<span class="tracker-item-name">' + escHtml(it.name || '') + '</span>' +
      '<span class="tracker-item-qty">' + (it.quantity || 1) + '×</span>';
    list.appendChild(row);
  });

  renderTrackerStatus();
  startPolling();
}

function renderTrackerStatus() {
  var status = state.orderStatus || 'waiting';
  var timeline = $('trackerTimeline');

  // Determine which steps are visible
  // If approval is not held, skip held step
  var stepsToShow = STATUS_STEPS.filter(function (s) {
    if (s.key === 'held') return status === 'held';
    return true;
  });

  var targetKey = 'waiting';
  if (status === 'held') targetKey = 'held';
  else if (status === 'preparing') targetKey = 'preparing';
  else if (status === 'completed') targetKey = 'completed';
  else if (status === 'rejected') targetKey = 'preparing';
  else targetKey = 'waiting';

  var activeIdx = stepsToShow.findIndex(function (s) {
    return s.key === targetKey;
  });
  if (activeIdx === -1) activeIdx = 0;

  // Build HTML
  var titleEl = timeline.querySelector('.tracker-timeline-title') || document.createElement('div');
  titleEl.className = 'tracker-timeline-title';
  titleEl.textContent = 'حالة طلبك';

  var stepsHtml = stepsToShow.map(function (step, i) {
    var isDone = i < activeIdx;
    var isActive = i === activeIdx;
    var dotContent = isDone ? '✓' : (i + 1);
    var statusClass = isActive ? statusToClass(status, step.key) : '';

    var cls = 'timeline-step';
    if (isDone) cls += ' done';
    if (isActive) cls += ' active ' + statusClass;

    // Override label for rejected
    var label = step.label;
    var sub = step.sub;
    if (status === 'rejected' && step.key === 'preparing') {
      label = 'تعذّر تجهيز الطلب ❌';
      sub = 'يرجى التواصل مع النادل';
      cls = cls.replace('preparing', 'rejected').replace('active ', 'active rejected ');
    }

    return '<div class="' + cls + '">' +
      '<div class="timeline-dot">' + (isDone ? '✓' : '') + '</div>' +
      '<div class="timeline-content">' +
      '<div class="timeline-label">' + label + '</div>' +
      (isActive && sub ? '<div class="timeline-sub">' + sub + '</div>' : '') +
      '</div>' +
      '</div>';
  }).join('');

  timeline.innerHTML = '';
  timeline.appendChild(titleEl);
  timeline.insertAdjacentHTML('beforeend', stepsHtml);

  // Toggle visibility of Edit Order and Cancel Order buttons
  var canModify = (status === 'held' || status === 'waiting' || status === 'pending' || status === 'new' || status === 'received');
  var editBtn = $('btnEditOrder');
  var cancelBtn = $('btnCancelOrder');
  if (editBtn) editBtn.hidden = !canModify;
  if (cancelBtn) cancelBtn.hidden = !canModify;
}

/* ══════════════════════════════════════════════════════════
   18.5. EDIT & CANCEL ORDER HANDLERS
══════════════════════════════════════════════════════════ */
async function handleEditOrder() {
  if (!state.orderId || !state.orderItems || !state.orderItems.length) return;

  var status = state.orderStatus || 'waiting';
  var canModify = (status === 'held' || status === 'waiting' || status === 'pending' || status === 'new' || status === 'received');
  if (!canModify) {
    showToast('لا يمكن تعديل الطلب لأن المطبخ بدأ التجهيز', 'error');
    return;
  }

  var btn = $('btnEditOrder');
  var origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner dark"></span> جارٍ التحضير للتعديل...';
  }

  // 1. Call backend /begin-edit to set kitchen status = 'editing'
  try {
    await apiFetch('/api/orders/' + state.orderId + '/begin-edit', {
      method: 'POST',
      body: { tableId: TABLE_ID },
    });
  } catch (err) {
    showToast('❌ ' + (err.message || 'تعذّر بدء التعديل'), 'error', 4000);
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = origHtml;
    }
  }

  // 2. Load items back into cart
  state.cart = state.orderItems.map(function (it) {
    var menuItem = state.menu.find(function (m) { return m.id === it.menuId; }) || {
      id: it.menuId,
      name: it.name,
      price: it.price,
    };
    return {
      item: menuItem,
      qty: it.quantity || 1,
      options: Object.assign({}, it.selectedOptions || {}),
      note: it.note || '',
    };
  });

  state.editingOrderId = state.orderId;

  // 3. Update cart bar & status card, switch to Menu screen, then open cart sheet
  updateCartBar();
  updateOrderStatusCard();
  showScreen('menu');
  openSheet('cart');

  showToast('✏️ تم قفل الطلب للتعديل. يمكنك الإضافة والتعديل من السلة.', 'info', 3500);
}

async function submitEditedOrder() {
  if (!state.editingOrderId) return;
  if (!state.cart.length) {
    showToast('السلة فارغة. يرجى اختيار منتج أو إلغاء الطلب.', 'error');
    return;
  }

  var btn = $('btnSendOrder');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جارٍ حفظ التعديل...';

  try {
    var items = state.cart.map(function (ci) {
      return {
        menuId: ci.item.id,
        quantity: ci.qty,
        note: ci.note || '',
        selectedOptions: ci.options || {},
      };
    });

    var updatedOrder = await apiFetch('/api/orders/' + state.editingOrderId + '/replace-items', {
      method: 'POST',
      body: {
        tableId: TABLE_ID,
        items: items,
        replace: true,
      },
    });

    state.orderId = updatedOrder.id || state.editingOrderId;
    state.orderItems = updatedOrder.items || [];
    state.orderDisplayId = updatedOrder.displayOrderId || state.orderId;
    state.orderStatus = 'new';
    state.editingOrderId = null;

    // Clear cart
    state.cart = [];
    updateCartBar();

    // Close cart sheet
    closeSheet('cart');

    showToast('✓ تم تأكيد تعديل الطلب بنجاح', 'success', 3000);

    // Show updated order in tracker & menu status card
    renderTracker();
    updateOrderStatusCard();
    showScreen('tracker');

  } catch (err) {
    showToast('❌ ' + (err.message || 'تعذّر تعديل الطلب'), 'error', 4000);
  } finally {
    btn.disabled = false;
  }
}

function openCancelConfirmModal() {
  var status = state.orderStatus || 'waiting';
  var canModify = (status === 'held' || status === 'waiting' || status === 'pending' || status === 'new' || status === 'received');
  if (!canModify) {
    showToast('لا يمكن إلغاء الطلب لأن المطبخ بدأ التجهيز', 'error');
    return;
  }
  $('cancelConfirmModal').classList.add('open');
}

function closeCancelConfirmModal() {
  $('cancelConfirmModal').classList.remove('open');
}

async function confirmCancelOrder() {
  if (!state.orderId) return;

  var btn = $('btnConfirmCancelOrder');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جارٍ الإلغاء...';

  try {
    await apiFetch('/api/orders/' + state.orderId + '/cancel-by-customer', {
      method: 'POST',
      body: { tableId: TABLE_ID },
    });

    closeCancelConfirmModal();
    showToast('تم إلغاء الطلب بنجاح.', 'success', 4000);

    // Reset state & clear cart
    state.orderId = null;
    state.orderItems = [];
    state.orderStatus = null;
    state.orderDisplayId = null;
    state.editingOrderId = null;
    state.cart = [];
    saveActiveOrderCache(null);

    stopPolling();
    updateCartBar();
    updateOrderStatusCard();

    // Return to menu screen
    showScreen('menu');

  } catch (err) {
    closeCancelConfirmModal();
    showToast('❌ ' + (err.message || 'تعذّر إلغاء الطلب'), 'error', 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'نعم، إلغاء الطلب';
  }
}

function statusToClass(status, stepKey) {
  if (status === 'held' && stepKey === 'held') return 'held';
  if (status === 'waiting' && stepKey === 'waiting') return 'waiting';
  if (status === 'preparing' && stepKey === 'preparing') return 'preparing';
  if (status === 'completed' && stepKey === 'completed') return 'ready';
  if (status === 'rejected') return 'rejected';
  return 'waiting';
}

/* ══════════════════════════════════════════════════════════
   19. ORDER STATUS CARD ON MENU
══════════════════════════════════════════════════════════ */
var STATUS_LABEL_MAP = {
  held: { label: 'بانتظار الموافقة', badgeClass: 'held', icon: '🕐' },
  waiting: { label: 'في الانتظار', badgeClass: 'waiting', icon: '🔵' },
  preparing: { label: 'قيد التجهيز', badgeClass: 'preparing', icon: '🟠' },
  completed: { label: 'جاهز!', badgeClass: 'ready', icon: '🟢' },
  rejected: { label: 'تعذّر الطلب', badgeClass: '', icon: '🔴' },
};

function updateOrderStatusCard() {
  var card = $('orderStatusCard');
  var labelEl = $('orderStatusCardLabel');
  var orderEl = $('orderStatusCardOrderId');
  var badgeEl = $('orderStatusCardBadge');

  if (!state.orderId || state.orderStatus === 'rejected') {
    card.hidden = true;
    card.classList.remove('visible');
    return;
  }

  var info = STATUS_LABEL_MAP[state.orderStatus] || STATUS_LABEL_MAP.waiting;
  orderEl.textContent = 'طلبك الحالي · ' + (state.orderDisplayId || '');
  labelEl.textContent = info.icon + ' ' + info.label;
  badgeEl.textContent = info.label;
  badgeEl.className = 'order-status-badge ' + info.badgeClass;

  card.hidden = false;
  card.classList.add('visible');
}

/* ══════════════════════════════════════════════════════════
   20. CALL WAITER / REQUEST BILL
══════════════════════════════════════════════════════════ */
function handleCallWaiter() {
  var now = Date.now();
  if (now - lastWaiterCall < WAITER_COOLDOWN_MS) {
    var remaining = Math.ceil((WAITER_COOLDOWN_MS - (now - lastWaiterCall)) / 1000);
    showToast('يرجى الانتظار ' + remaining + ' ثانية قبل الاستدعاء مرة أخرى', 'info');
    return;
  }
  lastWaiterCall = now;

  emitStaffEvent('customer_call_waiter');
  showToast('✓ تم إخطار النادل، سيصل إليك قريباً', 'success', 3500);

  // Visual feedback on button
  var btn = $('btnCallWaiter');
  btn.disabled = true;
  btn.textContent = '✓ تم إخطار النادل';
  setTimeout(function () {
    btn.disabled = false;
    btn.textContent = '🔔 استدعاء النادل';
  }, WAITER_COOLDOWN_MS);
}

async function openBillConfirmModal() {
  if (state.isBillRequested) {
    showToast('⚠️ تم طلب الفاتورة لهذه الطاولة مسبقاً، سيصل النادل قريباً.', 'info', 4000);
    return;
  }

  try {
    var tableOrders = await apiFetch('/api/orders/table/' + TABLE_ID);
    if (!Array.isArray(tableOrders)) tableOrders = [];

    var myOrders = tableOrders.filter(function (o) {
      if (o.closed || o.cancelledByCustomer || o.cancelReason === 'customer_cancel_pending') return false;
      // فلترة صارمة — لا نستخدم الاسم لمنع تسرب بيانات زبائن آخرين على نفس الطاولة
      if (o.customerSessionId && o.customerSessionId === SESSION_ID) return true;
      if (state.orderId && String(o.id) === String(state.orderId)) return true;
      return false;
    });

    if (myOrders.length === 0) {
      showToast('❌ لا يمكنك طلب الفاتورة إلا بعد أن يصبح لديك طلب مكتمل.', 'error', 4500);
      return;
    }

    var hasWaitingOrPrep = myOrders.some(function (o) {
      var s = String(o.kitchenStatus || 'pending').toLowerCase();
      return s === 'pending' || s === 'held' || s === 'waiting' || s === 'new' || s === 'preparing' || o.awaitingCashierApproval;
    });

    var hasCompleted = myOrders.some(function (o) {
      var s = String(o.kitchenStatus || '').toLowerCase();
      return s === 'done' || s === 'completed';
    });

    if (hasWaitingOrPrep || !hasCompleted) {
      showToast('❌ لا يمكنك طلب الفاتورة إلا بعد أن يصبح لديك طلب مكتمل.', 'error', 4500);
      return;
    }

    $('billConfirmModal').classList.add('open');
  } catch (_) {
    showToast('❌ تعذّر التحقق من حالة الطلبات', 'error');
  }
}
function closeBillConfirmModal() {
  $('billConfirmModal').classList.remove('open');
}
function confirmRequestBill() {
  state.isBillRequested = true;
  emitStaffEvent('customer_request_bill');
  closeBillConfirmModal();
  showToast('✓ تم طلب الفاتورة، سيصل النادل قريباً', 'success', 4000);
}

function emitStaffEvent(eventName) {
  try {
    if (state.socket && state.socket.connected) {
      state.socket.emit(eventName, {
        cafeId: CAFE_ID,
        tableId: TABLE_ID,
        tableLabel: TABLE_LABEL,
        orderId: state.orderId || '',
        customerName: state.customerName || '',
      });
    }
  } catch (_) { }
}

/* ══════════════════════════════════════════════════════════
   21. TOUCH SWIPE TO CLOSE SHEETS
══════════════════════════════════════════════════════════ */
function enableSwipeClose(sheetEl, closeCallback) {
  var startY = 0;
  var dragging = false;

  sheetEl.addEventListener('touchstart', function (e) {
    if (sheetEl.scrollTop > 0) return; // don't intercept scroll
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var delta = e.touches[0].clientY - startY;
    if (delta > 0) {
      sheetEl.style.transform = 'translateY(' + delta + 'px)';
      sheetEl.style.transition = 'none';
    }
  }, { passive: true });

  sheetEl.addEventListener('touchend', function (e) {
    if (!dragging) return;
    dragging = false;
    var delta = e.changedTouches[0].clientY - startY;
    sheetEl.style.transform = '';
    sheetEl.style.transition = '';
    if (delta > 80) closeCallback();
  }, { passive: true });
}

/* ══════════════════════════════════════════════════════════
   21.5. RESTORE ACTIVE ORDER SESSION (استرجاع جلسة الطلب النشط)
══════════════════════════════════════════════════════════ */
async function restoreActiveOrder() {
  if (!CAFE_ID || !TABLE_ID) return null;

  // Phase 1: Instant 0ms Local Cache Restore (Cloud-First PWA pattern)
  var cached = getActiveOrderCache();
  if (cached && cached.id) {
    state.orderId = cached.id;
    state.orderItems = cached.items || [];
    state.orderDisplayId = cached.displayOrderId || cached.id;
    if (cached.customerName) {
      state.customerName = cached.customerName;
      saveName(cached.customerName);
    }
    if (cached.status) {
      state.orderStatus = cached.status;
    }
    updateOrderStatusCard();
  }

  // Phase 2: Background Cloud Sync
  try {
    var allOrders = await apiFetch('/api/orders/table/' + TABLE_ID);
    if (!Array.isArray(allOrders)) return cached;

    var pciInfo = getPCI();
    var savedCustId = pciInfo && pciInfo.customerId ? pciInfo.customerId : null;

    var activeOrders = allOrders.filter(function (o) {
      if (String(o.tableId) !== TABLE_ID) return false;
      if (o.closed) return false;
      if (o.cancelledByCustomer || o.cancelReason === 'customer_cancel_pending') return false;
      // مطابقة صارمة لجلسة الزبون فقط — يمنع تسرب جلسة زبون آخر على نفس الطاولة
      if (o.customerSessionId && o.customerSessionId === SESSION_ID) return true;
      if (savedCustId && o.customerId && o.customerId === savedCustId) return true;
      if (state.orderId && String(o.id) === String(state.orderId)) return true;
      return false;
    });

    if (activeOrders.length > 0) {
      var latest = activeOrders[activeOrders.length - 1];
      state.orderId = latest.id;
      state.orderItems = latest.items || [];
      state.orderDisplayId = latest.displayOrderId || latest.id;
      if (latest.customerSessionId) {
        setPersistedItem('cust_session_' + TABLE_ID, latest.customerSessionId);
        SESSION_ID = latest.customerSessionId;
      }
      if (latest.customerName) {
        state.customerName = latest.customerName;
        saveName(latest.customerName);
      }
      setPersistedItem('cust_last_order_id_' + TABLE_ID, latest.id);
      await fetchAndUpdateStatus();
      updateOrderStatusCard();
      saveActiveOrderCache({
        id: state.orderId,
        displayOrderId: state.orderDisplayId,
        items: state.orderItems,
        customerName: state.customerName,
        status: state.orderStatus
      });
      return latest;
    } else {
      state.orderId = null;
      state.orderItems = [];
      state.orderStatus = null;
      state.orderDisplayId = null;
      saveActiveOrderCache(null);
      updateOrderStatusCard();

      // Phase 3 — استعادة عبر Persistent Identity (بعد إغلاق المتصفح أو App Switch)
      try {
        var _pci3 = getPCI();
        var custIdParam = _pci3 && _pci3.customerId ? _pci3.customerId : '';
        var _recData = await apiFetch(
          '/api/orders/table/' + TABLE_ID + '/recover-session?sessionId=' + encodeURIComponent(SESSION_ID) + '&customerId=' + encodeURIComponent(custIdParam)
        );
        if (_recData && _recData.order) {
          var _ro = _recData.order;
          state.orderId = _ro.id;
          state.orderItems = _ro.items || [];
          state.orderDisplayId = _ro.displayOrderId || _ro.id;
          if (_ro.customerSessionId) {
            setPersistedItem('cust_session_' + TABLE_ID, _ro.customerSessionId);
          }
          if (_ro.customerName) {
            state.customerName = _ro.customerName;
            saveName(_ro.customerName);
          }
          setPersistedItem('cust_last_order_id_' + TABLE_ID, _ro.id);
          savePCI({ customerId: custIdParam || 'cid-' + Date.now(), sessionId: _ro.customerSessionId || SESSION_ID, cafeId: CAFE_ID, tableId: TABLE_ID });
          await fetchAndUpdateStatus();
          updateOrderStatusCard();
          saveActiveOrderCache({
            id: state.orderId,
            displayOrderId: state.orderDisplayId,
            items: state.orderItems,
            customerName: state.customerName,
            status: state.orderStatus
          });
          return _ro;
        }
      } catch (_) {}

      return null;
    }
  } catch (_) { }
  return cached;
}

/* ══════════════════════════════════════════════════════════
   22. LOAD DATA
══════════════════════════════════════════════════════════ */
async function loadData() {
  try {
    var [settingsData, menuData, categoriesData] = await Promise.all([
      apiFetch('/api/settings/cafe'),
      apiFetch('/api/menu'),
      apiFetch('/api/categories').catch(function () { return []; }),
    ]);

    state.cafeInfo = {
      cafeName: settingsData.cafeName || 'الكافيه',
      logoUrl: settingsData.logoUrl || null,
    };
    state.menu = Array.isArray(menuData) ? menuData : [];
    state.allCategories = Array.isArray(categoriesData) ? categoriesData : [];

    buildCategories();
    setWelcomeCafeInfo(state.cafeInfo);

    // Update page title
    document.title = state.cafeInfo.cafeName + ' — اطلب الآن';

    // Auto restore active order session if refresh or App Switcher re-open occurred
    var restored = await restoreActiveOrder();
    updateOrderStatusCard();

    if (restored || state.orderId) {
      await fetchAndUpdateStatus();
      renderTracker();
      showScreen('tracker');
    }

  } catch (err) {
    showToast('⚠️ تعذّر تحميل بيانات الكافيه', 'error', 5000);
    // Still enable start button with minimal info
    $('btnStartOrdering').disabled = false;
    $('btnStartOrderingLabel').textContent = 'ابدأ الطلب ←';
    $('btnStartOrderingSpinner').hidden = true;
  }
}

/* ══════════════════════════════════════════════════════════
   23. EVENT LISTENERS
══════════════════════════════════════════════════════════ */
function bindEvents() {
  // ── Welcome ──
  $('btnStartOrdering').addEventListener('click', async function () {
    try {
      var isClosedLocal = localStorage.getItem('cust_table_closed_' + TABLE_ID) === '1';
      var isClosedSession = sessionStorage.getItem('cust_table_closed_' + TABLE_ID) === '1';
      if (isClosedLocal || isClosedSession) {
        showToast('⚠️ يرجى مسح كود الـ QR الخاص بالطاولة لبدء طلب جديد.', 'warning', 5000);
        return;
      }
    } catch (_) {}

    try {
      var billCheck = await apiFetch('/api/orders/table/' + TABLE_ID + '/bill-requested');
      if (billCheck && billCheck.isBillRequested) {
        state.isBillRequested = true;
      }
    } catch (_) {}

    if (state.isBillRequested) {
      showToast('⚠️ هذه الطاولة بانتظار تصفير الحساب من الكاشير، يرجى الانتظار قليلاً.', 'info', 4500);
      return;
    }

    await restoreActiveOrder();
    await fetchAndUpdateStatus();
    updateOrderStatusCard();

    if (state.orderId) {
      renderTracker();
      showScreen('tracker');
      return;
    }

    renderMenuHeader();
    renderCategories();
    renderProducts();
    updateCartBar();
    showScreen('menu');
  });

  // ── Order Status Card tap ──
  $('orderStatusCard').addEventListener('click', async function () {
    if (!state.orderId) {
      await restoreActiveOrder();
    }
    if (state.orderId) {
      await fetchAndUpdateStatus();
      renderTracker();
      showScreen('tracker');
    }
  });
  $('orderStatusCard').addEventListener('keydown', async function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!state.orderId) {
        await restoreActiveOrder();
      }
      if (state.orderId) {
        await fetchAndUpdateStatus();
        renderTracker();
        showScreen('tracker');
      }
    }
  });

  // ── Hamburger Drawer ──
  $('btnOpenDrawer').addEventListener('click', openDrawer);
  $('btnCloseDrawer').addEventListener('click', closeDrawer);
  $('drawerOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeDrawer();
  });

  $('btnDrawerOrderStatus').addEventListener('click', async function () {
    closeDrawer();
    if (!state.orderId) {
      await restoreActiveOrder();
    }
    if (state.orderId) {
      await fetchAndUpdateStatus();
      renderTracker();
      showScreen('tracker');
    } else {
      showToast('لم يتم إرسال أي طلب بعد', 'info');
    }
  });

  $('btnDrawerCallCaptain').addEventListener('click', function () {
    closeDrawer();
    handleCallWaiter();
  });

  var btnHist = $('btnDrawerHistory');
  if (btnHist) btnHist.addEventListener('click', openHistorySheet);

  $('btnDrawerRequestBill').addEventListener('click', function () {
    closeDrawer();
    openBillConfirmModal();
  });

  // ── History Sheet ──
  var histOverlay = $('historySheetOverlay');
  if (histOverlay) {
    histOverlay.addEventListener('click', function (e) {
      if (e.target === this) closeSheet('history');
    });
  }
  var btnCloseHist = $('btnCloseHistory');
  if (btnCloseHist) btnCloseHist.addEventListener('click', function () { closeSheet('history'); });
  var histSheet = $('historySheet');
  if (histSheet) enableSwipeClose(histSheet, function () { closeSheet('history'); });

  // ── Cart FAB ──
  $('btnOpenCart').addEventListener('click', function () {
    openSheet('cart');
  });

  // ── Product Sheet ──
  $('productSheetOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeSheet('product');
  });
  enableSwipeClose($('productSheet'), function () { closeSheet('product'); });

  $('qtyMinus').addEventListener('click', function () {
    state.productSheetQty = Math.max(1, state.productSheetQty - 1);
    $('qtyVal').textContent = state.productSheetQty;
    $('qtyMinus').disabled = state.productSheetQty <= 1;
    updateAddToCartBtn();
  });
  $('qtyPlus').addEventListener('click', function () {
    state.productSheetQty = Math.min(20, state.productSheetQty + 1);
    $('qtyVal').textContent = state.productSheetQty;
    $('qtyMinus').disabled = false;
    updateAddToCartBtn();
  });

  $('btnAddToCart').addEventListener('click', addToCart);

  // ── Cart Sheet ──
  $('cartSheetOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeSheet('cart');
  });
  enableSwipeClose($('cartSheet'), function () { closeSheet('cart'); });
  $('btnCloseCart').addEventListener('click', function () { closeSheet('cart'); });

  $('btnSendOrder').addEventListener('click', function () {
    if (!state.cart.length) return;
    if (state.editingOrderId) {
      submitEditedOrder();
    } else {
      closeSheet('cart');
      setTimeout(openNameModal, 200);
    }
  });

  // ── Name Modal ──
  $('nameModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeNameModal();
  });
  $('btnCancelName').addEventListener('click', closeNameModal);
  $('btnConfirmOrder').addEventListener('click', submitOrder);
  $('customerNameInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitOrder();
  });

  // ── Tracker ──
  $('btnBackToMenu').addEventListener('click', function () {
    updateOrderStatusCard(); // ensure card is shown
    showScreen('menu');
  });
  $('btnOrderMore').addEventListener('click', function () {
    updateOrderStatusCard();
    showScreen('menu');
  });

  var editBtn = $('btnEditOrder');
  if (editBtn) editBtn.addEventListener('click', handleEditOrder);

  var cancelBtn = $('btnCancelOrder');
  if (cancelBtn) cancelBtn.addEventListener('click', openCancelConfirmModal);

  var callW = $('btnCallWaiter');
  if (callW) callW.addEventListener('click', handleCallWaiter);
  var reqB = $('btnRequestBill');
  if (reqB) reqB.addEventListener('click', openBillConfirmModal);

  // ── Bill Confirm Modal ──
  $('billConfirmModal').addEventListener('click', function (e) {
    if (e.target === this) closeBillConfirmModal();
  });
  $('btnBillConfirm').addEventListener('click', confirmRequestBill);
  $('btnBillCancel').addEventListener('click', closeBillConfirmModal);

  // ── Cancel Confirm Modal ──
  var cancelModalOverlay = $('cancelConfirmModal');
  if (cancelModalOverlay) {
    cancelModalOverlay.addEventListener('click', function (e) {
      if (e.target === this) closeCancelConfirmModal();
    });
  }
  var btnCancelClose = $('btnCancelModalClose');
  if (btnCancelClose) btnCancelClose.addEventListener('click', closeCancelConfirmModal);

  var btnConfirmCancel = $('btnConfirmCancelOrder');
  if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', confirmCancelOrder);
}

/* ══════════════════════════════════════════════════════════
   24. BOOT
══════════════════════════════════════════════════════════ */
(function boot() {
  renderWelcome();
  bindEvents();

  // Only load data if params are valid
  if (CAFE_ID && TABLE_ID) {
    connectSocket();
    loadData();
  }
}());
