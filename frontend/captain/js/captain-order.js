/**
 * Captain Order Page — POS-style table order interface
 * Categories (left) | Products + Search (center) | Cart (right)
 * Sends order via api.orders.create(); realtime via existing Socket.IO from server.
 */
(function () {
  var CO_CATEGORIES_FALLBACK = [
    'الكل', 'قهوة', 'المشروبات الباردة', 'المشروبات الساخنة', 'ميلك شيك',
    'المشروبات المنعشة', 'سموذي', 'القهوة المثلجة', 'أمريكانو مثلج', 'الإضافات', 'حليب',
  ];
  var categoriesList = CO_CATEGORIES_FALLBACK.slice();

  const coMain = document.getElementById('coMain');
  const coTablesScreen = document.getElementById('coTablesScreen');
  const coTablesGrid = document.getElementById('coTablesGrid');
  const coHeader = document.getElementById('coHeader');
  const coHeaderCafeName = document.getElementById('coHeaderCafeName');
  const coCurrentTable = document.getElementById('coCurrentTable');
  const coBtnBack = document.getElementById('coBtnBack');
  const coCategoriesList = document.getElementById('coCategoriesList');
  const coSearch = document.getElementById('coSearch');
  const coProductsGrid = document.getElementById('coProductsGrid');
  const coProductsEmpty = document.getElementById('coProductsEmpty');
  const coCartItems = document.getElementById('coCartItems');
  const coCartTotal = document.getElementById('coCartTotal');
  const coBtnSend = document.getElementById('coBtnSend');
  const coCart = document.getElementById('coCart');
  const coCartTitle = document.getElementById('coCartTitle');
  const coReceiptOverlay = document.getElementById('coReceiptOverlay');
  const coReceiptTableNum = document.getElementById('coReceiptTableNum');
  const coReceiptDate = document.getElementById('coReceiptDate');
  const coReceiptOrderId = document.getElementById('coReceiptOrderId');
  const coReceiptItems = document.getElementById('coReceiptItems');
  const coReceiptTotal = document.getElementById('coReceiptTotal');
  const coReceiptBtnSend = document.getElementById('coReceiptBtnSend');
  const coReceiptClose = document.getElementById('coReceiptClose');
  const coSuccessOverlay = document.getElementById('coSuccessOverlay');
  const coSuccessDone = document.getElementById('coSuccessDone');
  const coApprovalModal = document.getElementById('coApprovalModal');
  const coApprovalList = document.getElementById('coApprovalList');

  let tables = [];
  let menu = [];
  let selectedTableId = null;
  let selectedCategoryId = 'الكل';
  let searchQuery = '';
  /** @type {Array<{ menuId: string, name: string, price: number, quantity: number, note?: string }>} */
  let cart = [];

  // Socket + إشعارات (Real-time)
  var socket = null;
  var joinedTableId = null;
  var Notifications = window.NotificationCenter;
  var coApprovalQueue = [];
  var coApprovalProcessingId = null;
  var coAutoApprovalEnabled = false;

  function showCaptainToast(message) {
    if (Notifications && Notifications.notifyReady) {
      Notifications.notifyReady({
        title: 'موافقة الطلب',
        message: String(message || ''),
        ttlMs: 3500,
      });
      return;
    }
    try {
      alert(String(message || ''));
    } catch (_) { }
  }

  function dedupeCaptainApprovalRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var seen = {};
    var result = [];
    list.forEach(function (row) {
      if (!row || row.id == null) return;
      var batchKey =
        row.kitchenBatchId != null && String(row.kitchenBatchId).trim()
          ? 'batch:' + String(row.kitchenBatchId).trim()
          : 'order:' + String(row.id);
      if (seen[batchKey]) return;
      seen[batchKey] = true;
      result.push(row);
    });
    return result;
  }

  function hideCaptainApprovalModal() {
    if (!coApprovalModal) return;
    coApprovalModal.classList.remove('open');
    coApprovalModal.setAttribute('aria-hidden', 'true');
    if (coApprovalList) coApprovalList.innerHTML = '';
  }

  function renderCaptainApprovalModalList(rows) {
    if (!coApprovalList) return;
    var list = dedupeCaptainApprovalRows(rows);
    if (!list.length) {
      hideCaptainApprovalModal();
      return;
    }
    coApprovalList.innerHTML = list
      .map(function (row) {
        var oid = escapeHtml(row.id);
        var tableLabel = escapeHtml(row.tableLabel || 'طاولة ' + row.tableId);
        return (
          '<li class="co-approval-modal__item" data-approval-order-id="' +
          oid +
          '">' +
          '<div class="co-approval-modal__item-main">' +
          '<span class="co-approval-modal__table">' +
          tableLabel +
          '</span>' +
          '<span class="co-approval-modal__msg">ينتظر موافقتك لإرسال طلبه إلى المطبخ</span>' +
          '</div>' +
          '<div class="co-approval-modal__row-actions">' +
          '<button type="button" class="co-approval-btn co-approval-btn--secondary" data-reject-order="' +
          oid +
          '">غير موافق</button>' +
          '<button type="button" class="co-approval-btn co-approval-btn--primary" data-approve-order="' +
          oid +
          '">موافق</button>' +
          '</div>' +
          '</li>'
        );
      })
      .join('');
    coApprovalList.querySelectorAll('[data-approve-order]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-approve-order');
        if (id) approveCaptainOrderById(id, btn);
      });
    });
    coApprovalList.querySelectorAll('[data-reject-order]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-reject-order');
        if (id) rejectCaptainOrderById(id, btn);
      });
    });
    if (coApprovalModal) {
      coApprovalModal.classList.add('open');
      coApprovalModal.setAttribute('aria-hidden', 'false');
    }
  }

  function syncCaptainApprovalQueue(rows) {
    coApprovalQueue = dedupeCaptainApprovalRows(rows);
    if (coAutoApprovalEnabled) {
      hideCaptainApprovalModal();
      return;
    }
    if (!coApprovalQueue.length) {
      hideCaptainApprovalModal();
      return;
    }
    renderCaptainApprovalModalList(coApprovalQueue);
  }

  function loadCaptainAutoApprovalSetting() {
    var apiRef = window.api || window.Api;
    if (!apiRef || !apiRef.settings || !apiRef.settings.getCafe) return Promise.resolve();
    return apiRef.settings
      .getCafe()
      .then(function (data) {
        coAutoApprovalEnabled = !!(data && data.requireCashierKitchenApproval === false);
      })
      .catch(function () { });
  }

  function loadCaptainPendingApprovals() {
    var apiRef = window.api || window.Api;
    if (!apiRef || !apiRef.orders || !apiRef.orders.pendingCashierApproval) return Promise.resolve();
    if (coAutoApprovalEnabled) {
      coApprovalQueue = [];
      hideCaptainApprovalModal();
      return Promise.resolve();
    }
    return apiRef.orders
      .pendingCashierApproval()
      .then(function (list) {
        syncCaptainApprovalQueue(Array.isArray(list) ? list : []);
      })
      .catch(function () {
        coApprovalQueue = [];
        if (!coApprovalProcessingId) hideCaptainApprovalModal();
      });
  }

  function setCaptainApprovalRowBusy(orderId, busy, approveText, rejectText) {
    if (!coApprovalList || orderId == null) return;
    var item = Array.from(coApprovalList.querySelectorAll('[data-approval-order-id]')).find(function (el) {
      return el.getAttribute('data-approval-order-id') === String(orderId);
    });
    if (!item) return;
    var approveBtn = item.querySelector('[data-approve-order]');
    var rejectBtn = item.querySelector('[data-reject-order]');
    if (approveBtn) {
      approveBtn.disabled = !!busy;
      approveBtn.textContent = approveText || (!busy ? 'موافق' : approveBtn.textContent);
    }
    if (rejectBtn) {
      rejectBtn.disabled = !!busy;
      rejectBtn.textContent = rejectText || (!busy ? 'غير موافق' : rejectBtn.textContent);
    }
  }

  function approveCaptainOrderById(orderId, btn) {
    var apiRef = window.api || window.Api;
    if (!orderId || coApprovalProcessingId || !apiRef || !apiRef.orders || !apiRef.orders.approveKitchen) return;
    coApprovalProcessingId = String(orderId);
    setCaptainApprovalRowBusy(orderId, true, 'جاري الإرسال…', null);
    if (btn) btn.disabled = true;
    apiRef.orders
      .approveKitchen(orderId)
      .then(function () {
        showCaptainToast('تمت الموافقة — أُرسل الطلب إلى المطبخ.');
      })
      .catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'تعذّر الموافقة على الطلب.');
      })
      .finally(function () {
        coApprovalProcessingId = null;
        loadCaptainPendingApprovals();
      });
  }

  function rejectCaptainOrderById(orderId, btn) {
    var apiRef = window.api || window.Api;
    if (!orderId || coApprovalProcessingId || !apiRef || !apiRef.orders || !apiRef.orders.rejectKitchen) return;
    coApprovalProcessingId = String(orderId);
    setCaptainApprovalRowBusy(orderId, true, null, 'جاري الرفض…');
    if (btn) btn.disabled = true;
    apiRef.orders
      .rejectKitchen(orderId)
      .then(function () {
        showCaptainToast('تم رفض الطلب — أُبلِغ الزبون.');
      })
      .catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'تعذّر رفض الطلب.');
      })
      .finally(function () {
        coApprovalProcessingId = null;
        loadCaptainPendingApprovals();
      });
  }

  function showOrderReady(tableId) {
    if (!Notifications || !Notifications.notifyReady) return;
    Notifications.notifyReady({
      title: 'تم تجهيز الطلب',
      message: 'تم تجهيز طلب طاولة ' + tableId,
      ttlMs: 4500,
    });
    if (window.VoiceNotify && typeof VoiceNotify.announceCaptainReady === 'function') {
      VoiceNotify.announceCaptainReady(tableId);
    }
  }

  function joinTableRoom(tableId) {
    if (!socket || tableId == null || tableId === '') return;
    var sid = String(tableId);
    if (joinedTableId != null && String(joinedTableId) === sid) return;
    try {
      joinedTableId = sid;
    } catch (_) { }
  }

  function ensureSocket() {
    if (socket) return;
    try {
      if (typeof io !== 'function') return;
      var token = sessionStorage.getItem('cafezip_saas_token') || '';
      socket = io(window.location.origin, {
        query: { token: token }
      });

      socket.on('connect', function () {
        if (selectedTableId) joinTableRoom(selectedTableId);
      });

      if (window.CafeHeaderBranding && coHeaderCafeName) {
        CafeHeaderBranding.bindSocket(socket, coHeaderCafeName, 'كابتن');
      }

      socket.on('menu-updated', function () {
        reloadCaptainCategoriesAndMenu();
      });
      socket.on('menu_updated', function () {
        reloadCaptainCategoriesAndMenu();
      });
      socket.on('categories-updated', function () {
        reloadCaptainCategoriesAndMenu();
      });

      // حدث من المطبخ للكابتن
      socket.on('order_ready', function (payload) {
        if (!payload) return;
        var tableId = payload.tableId || payload.table || '';
        if (!tableId) return;
        showOrderReady(String(tableId));
      });

      socket.on('cashier-approval-pending', function () {
        loadCaptainPendingApprovals();
      });

      socket.on('captain-request', function (payload) {
        if (!payload) return;
        var msg =
          payload.message ||
          'طاولة ' + String(payload.tableLabel || payload.tableId || '') + ' تطلب حضور الكابتن';
        if (Notifications && typeof Notifications.notifyCaptain === 'function') {
          Notifications.notifyCaptain({
            title: 'طلب كابتن',
            message: msg,
            ttlMs: 5000,
          });
        }
      });

      socket.on('bill-request', function (payload) {
        if (!payload) return;
        var lbl = String(payload.tableLabel || payload.tableId || '');
        var msg =
          payload.captainMessage ||
          (payload.isReminder
            ? 'طاولة رقم ' + lbl + ' — إعادة إرسال طلب إنهاء الحساب'
            : 'طاولة رقم ' + lbl + ' بانتظار إنهاء الحساب');
        if (Notifications && typeof Notifications.notifyBill === 'function') {
          Notifications.notifyBill({
            title: payload.isReminder ? 'إعادة طلب حساب' : 'بانتظار الحساب',
            message: msg,
            ttlMs: 6000,
          });
        } else if (Notifications && typeof Notifications.notifyCaptain === 'function') {
          Notifications.notifyCaptain({
            title: 'بانتظار الحساب',
            message: msg,
            ttlMs: 6000,
          });
        }
      });

      socket.on('orders-updated', function (data) {
        if (
          data &&
          (data.reason === 'pending-cashier-approval' ||
            data.reason === 'cashier-approved' ||
            data.reason === 'cashier-rejected')
        ) {
          loadCaptainPendingApprovals();
        }
      });

      socket.on('cafe-settings-updated', function (payload) {
        if (payload && payload.requireCashierKitchenApproval !== undefined) {
          coAutoApprovalEnabled = payload.requireCashierKitchenApproval === false;
          loadCaptainPendingApprovals();
        }
      });

      // ── طلبات الزبون من واجهة الطلب الذاتي ──────────────────
      // يُطلق الزبون هذا الحدث من خلال واجهة الطلب بالـ QR
      socket.on('customer_call_waiter', function (payload) {
        if (!payload) return;
        var tbl = String(payload.tableLabel || ('طاولة ' + (payload.tableId || '')));
        var name = payload.customerName ? ' — ' + payload.customerName : '';
        var msg = tbl + name + ' طلب الكابتن  ';
        if (Notifications && typeof Notifications.notifyCaptain === 'function') {
          Notifications.notifyCaptain({ title: 'طلب كابتن', message: msg, ttlMs: 8000 });
        } else if (Notifications && typeof Notifications.notifyReady === 'function') {
          Notifications.notifyReady({ title: 'طلب كابتن', message: msg, ttlMs: 8000 });
        }
      });

      socket.on('customer_request_bill', function (payload) {
        if (!payload) return;
        var tbl = String(payload.tableLabel || ('طاولة ' + (payload.tableId || '')));
        var name = payload.customerName ? ' — ' + payload.customerName : '';
        var msg = tbl + name + ' تطلب الفاتورة';
        if (Notifications && typeof Notifications.notifyBill === 'function') {
          Notifications.notifyBill({ title: '🧾 طلب فاتورة', message: msg, ttlMs: 8000 });
        } else if (Notifications && typeof Notifications.notifyReady === 'function') {
          Notifications.notifyReady({ title: '🧾 طلب فاتورة', message: msg, ttlMs: 8000 });
        }
      });

    } catch (_) { }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatPrice(n) {
    return window.formatCurrency ? window.formatCurrency(n) : Number(n) + ' IQD';
  }

  function normalizeCategory(str) {
    return String(str || '').trim().toLowerCase();
  }

  function itemMatchesCategory(item, categoryKey) {
    if (categoryKey === 'الكل') return true;
    const itemCat = normalizeCategory(item.category);
    const keyNorm = normalizeCategory(categoryKey);
    return itemCat === keyNorm || itemCat.indexOf(keyNorm) !== -1 || keyNorm.indexOf(itemCat) !== -1;
  }

  function getFilteredProducts() {
    let list = menu;
    if (selectedCategoryId !== 'الكل') {
      list = list.filter(function (item) {
        return itemMatchesCategory(item, selectedCategoryId);
      });
    }
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(function (item) {
        return (item.name || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    return list;
  }

  function renderTables() {
    coTablesGrid.innerHTML = tables
      .map(function (t) {
        return (
          '<div class="co-table-card" data-table="' +
          escapeHtml(t.id) +
          '" role="button" tabindex="0">' +
          escapeHtml(t.label || t.id) +
          '</div>'
        );
      })
      .join('');

    coTablesGrid.querySelectorAll('.co-table-card').forEach(function (el) {
      el.addEventListener('click', function () {
        selectTable(el.dataset.table);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTable(el.dataset.table);
        }
      });
    });
  }

  function extractCaptainCategoriesList(apiCats, menuList) {
    var seen = {};
    seen['الكل'] = true;
    var result = ['الكل'];

    if (Array.isArray(apiCats)) {
      apiCats.forEach(function (c) {
        if (!c) return;
        var name = typeof c === 'object' && c.name != null ? String(c.name).trim() : String(c).trim();
        if (name && !seen[name]) {
          seen[name] = true;
          result.push(name);
        }
      });
    }

    if (Array.isArray(menuList)) {
      menuList.forEach(function (item) {
        if (!item || item.category == null) return;
        var cat = String(item.category).trim();
        if (cat && !seen[cat]) {
          seen[cat] = true;
          result.push(cat);
        }
      });
    }

    return result;
  }

  function reloadCaptainCategoriesAndMenu() {
    var api = window.api || window.Api;
    if (!api) return;

    var categoriesPromise = (api.categories && api.categories.list)
      ? api.categories.list().then(function (list) { return Array.isArray(list) ? list : []; })
      : Promise.resolve([]);

    Promise.all([
      api.menu.list().catch(function () { return []; }),
      categoriesPromise.catch(function () { return []; })
    ]).then(function (results) {
      menu = results[0] || [];
      var apiCats = results[1];

      categoriesList = extractCaptainCategoriesList(apiCats, menu);

      if (categoriesList.indexOf(selectedCategoryId) === -1) {
        selectedCategoryId = 'الكل';
      }

      renderCategories();
      renderProducts();
    }).catch(function (err) {
      console.error('[Captain] Error reloading categories/menu:', err);
    });
  }

  function selectTable(tableId) {
    selectedTableId = tableId;
    try {
      history.pushState({ page: 'captain-order', tableId: tableId }, '', '#table-' + tableId);
    } catch (_) { }
    ensureSocket();
    joinTableRoom(tableId);
    if (coCurrentTable) {
      var t = tables.find(function (x) {
        return x.id === tableId;
      });
      coCurrentTable.textContent = t ? 'طاولة ' + (t.label || t.id) : '';
    }
    if (coHeader) coHeader.classList.add('co-header--has-table');
    var btnSaasLogout = document.getElementById('btnSaasLogout');
    if (btnSaasLogout) btnSaasLogout.style.display = 'none';
    if (coTablesScreen) coTablesScreen.style.display = 'none';
    if (coMain) {
      coMain.style.display = 'grid';
      coMain.setAttribute('aria-hidden', 'false');
    }
    renderProducts();
  }

  function goBackToTables(fromPopState) {
    selectedTableId = null;
    cart = [];
    joinedTableId = null;
    if (!fromPopState) {
      try {
        if (window.location.hash) {
          history.pushState({ page: 'captain-tables' }, '', window.location.pathname);
        }
      } catch (_) { }
    }
    if (coHeader) coHeader.classList.remove('co-header--has-table');
    var btnSaasLogout = document.getElementById('btnSaasLogout');
    if (btnSaasLogout) {
      if (typeof SaasAuth !== 'undefined' && SaasAuth.checkStatus) {
        SaasAuth.checkStatus().then(function (enabled) {
          if (enabled) btnSaasLogout.style.display = 'inline-flex';
        });
      } else {
        btnSaasLogout.style.display = 'inline-flex';
      }
    }
    if (coCurrentTable) coCurrentTable.textContent = '';
    if (coMain) {
      coMain.style.display = 'none';
      coMain.setAttribute('aria-hidden', 'true');
    }
    if (coTablesScreen) coTablesScreen.style.display = 'block';
    updateCartUI();
  }

  function renderCategories() {
    coCategoriesList.innerHTML = categoriesList.map(function (cat) {
      var active = cat === selectedCategoryId ? ' active' : '';
      return (
        '<button type="button" class="co-category-btn' +
        active +
        '" data-category="' +
        escapeHtml(cat) +
        '">' +
        escapeHtml(cat) +
        '</button>'
      );
    }).join('');

    coCategoriesList.querySelectorAll('.co-category-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedCategoryId = btn.dataset.category;
        renderCategories();
        renderProducts();
      });
    });
  }

  function renderProducts() {
    var list = getFilteredProducts();
    if (list.length === 0) {
      coProductsGrid.innerHTML = '';
      if (coProductsEmpty) coProductsEmpty.style.display = 'block';
      return;
    }
    if (coProductsEmpty) coProductsEmpty.style.display = 'none';

    coProductsGrid.innerHTML = list
      .map(function (item) {
        var priceHtml = item.price != null ? '<span class="price">' + formatPrice(item.price) + '</span>' : '';
        return (
          '<div class="co-product-card" data-menu-id="' +
          escapeHtml(item.id) +
          '" role="button" tabindex="0">' +
          '<span class="name">' +
          escapeHtml(item.name || '') +
          '</span>' +
          priceHtml +
          '</div>'
        );
      })
      .join('');

    coProductsGrid.querySelectorAll('.co-product-card').forEach(function (card) {
      card.addEventListener('click', function () {
        addToCart(card.dataset.menuId);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addToCart(card.dataset.menuId);
        }
      });
    });
  }

  function addToCart(menuId) {
    var item = menu.find(function (m) {
      return m.id === menuId;
    });
    if (!item) return;
    var existing = cart.find(function (x) {
      return x.menuId === menuId && !(x.note || '').trim();
    });
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        menuId: item.id,
        name: item.name || '',
        price: item.price != null ? item.price : 0,
        quantity: 1,
        note: '',
      });
    }
    updateCartUI();
  }

  function setCartQuantity(index, delta) {
    var row = cart[index];
    if (!row) return;
    var next = row.quantity + delta;
    if (next < 1) {
      cart.splice(index, 1);
    } else {
      row.quantity = next;
    }
    updateCartUI();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
  }

  function updateCartUI() {
    if (!coCartItems) return;

    if (cart.length === 0) {
      coCartItems.innerHTML = '<p class="co-cart-empty">السلة فارغة</p>';
      if (coCartTotal) coCartTotal.textContent = '0 IQD';
      if (coBtnSend) coBtnSend.disabled = true;
      return;
    }

    var total = 0;
    coCartItems.innerHTML = cart
      .map(function (row, idx) {
        var lineTotal = (row.price || 0) * row.quantity;
        total += lineTotal;
        return (
          '<div class="co-cart-item" data-index="' +
          idx +
          '">' +
          '<span class="co-cart-item-name">' +
          escapeHtml(row.name) +
          '</span>' +
          '<div class="co-cart-item-controls">' +
          '<button type="button" class="co-cart-item-btn" data-action="minus" data-index="' +
          idx +
          '" aria-label="تقليل">−</button>' +
          '<span class="co-cart-item-qty">' +
          row.quantity +
          '</span>' +
          '<button type="button" class="co-cart-item-btn" data-action="plus" data-index="' +
          idx +
          '" aria-label="زيادة">+</button>' +
          '<button type="button" class="co-cart-item-btn remove" data-action="remove" data-index="' +
          idx +
          '" aria-label="حذف">✕</button>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    if (coCartTotal) coCartTotal.textContent = formatPrice(total);
    if (coBtnSend) coBtnSend.disabled = false;

    coCartItems.querySelectorAll('.co-cart-item-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.index, 10);
        var action = btn.dataset.action;
        if (action === 'minus') setCartQuantity(idx, -1);
        else if (action === 'plus') setCartQuantity(idx, 1);
        else if (action === 'remove') removeFromCart(idx);
      });
    });
  }

  function openReceiptModal() {
    if (!coReceiptOverlay) return;
    var total = 0;
    if (coReceiptTableNum) {
      var t = selectedTableId && tables.find(function (x) { return x.id === selectedTableId; });
      coReceiptTableNum.textContent = t ? 'طاولة ' + (t.label || t.id) : '—';
    }
    if (coReceiptDate) coReceiptDate.textContent = '';
    if (coReceiptOrderId) coReceiptOrderId.textContent = '';
    if (cart.length === 0) {
      if (coReceiptItems) coReceiptItems.innerHTML = '<tr><td colspan="3" class="receipt-empty-cell">السلة فارغة</td></tr>';
      if (coReceiptTotal) coReceiptTotal.textContent = 'المجموع الكلي: 0 IQD';
      if (coReceiptBtnSend) coReceiptBtnSend.disabled = true;
    } else {
      coReceiptItems.innerHTML = cart
        .map(function (row) {
          var lineTotal = (row.price || 0) * row.quantity;
          total += lineTotal;
          return (
            '<tr><td class="col-name">' + escapeHtml(row.name) + '</td>' +
            '<td class="col-qty">' + row.quantity + '</td>' +
            '<td class="col-price">' + formatPrice(lineTotal) + '</td></tr>'
          );
        })
        .join('');
      if (coReceiptTotal) coReceiptTotal.textContent = 'المجموع الكلي: ' + formatPrice(total);
      if (coReceiptBtnSend) coReceiptBtnSend.disabled = false;
    }
    coReceiptOverlay.classList.add('open');
    coReceiptOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeReceiptModal() {
    if (!coReceiptOverlay) return;
    coReceiptOverlay.classList.remove('open');
    coReceiptOverlay.setAttribute('aria-hidden', 'true');
  }

  function openSendSuccessModal() {
    if (!coSuccessOverlay) return;
    coSuccessOverlay.classList.add('open');
    coSuccessOverlay.setAttribute('aria-hidden', 'false');
    if (coSuccessDone) coSuccessDone.focus();
  }

  function closeSendSuccessModal() {
    if (!coSuccessOverlay) return;
    coSuccessOverlay.classList.remove('open');
    coSuccessOverlay.setAttribute('aria-hidden', 'true');
  }

  function onSendSuccessDone() {
    closeSendSuccessModal();
    goBackToTables();
  }

  var TILL_CLOSED_MSG = 'لا يمكن إرسال الطلب لأن قاصة اليوم غير مفتوحة.';

  function sendOrder() {
    if (!selectedTableId || !cart.length) return;
    var items = cart.map(function (row) {
      return {
        menuId: row.menuId,
        quantity: row.quantity,
        note: row.note || '',
      };
    });
    var api = window.api || window.Api;
    var btn = coReceiptOverlay && coReceiptOverlay.classList.contains('open') ? coReceiptBtnSend : coBtnSend;
    if (btn) btn.disabled = true;

    var cartSnapshot = cart.slice();
    cart = [];
    updateCartUI();
    closeReceiptModal();
    openSendSuccessModal();

    api
      .orders.create(selectedTableId, items)
      .catch(function (err) {
        cart = cartSnapshot;
        updateCartUI();
        closeSendSuccessModal();
        openReceiptModal();
        alert(err.json && err.json.error ? err.json.error : err.message || 'فشل إرسال الطلب');
      })
      .finally(function () {
        if (coBtnSend) coBtnSend.disabled = cart.length === 0;
        if (coReceiptBtnSend) coReceiptBtnSend.disabled = cart.length === 0;
      });
  }

  function init() {
    var api = window.api || window.Api;
    if (!api) {
      console.error('API not loaded');
      return;
    }

    // اتصال Socket مرة واحدة لالتقاط إشعارات تجهيز الطلبات
    ensureSocket();

    try {
      history.replaceState({ page: 'captain-tables' }, '', window.location.pathname);
    } catch (_) { }

    window.addEventListener('popstate', function (e) {
      if (selectedTableId != null) {
        goBackToTables(true);
      } else {
        try {
          history.pushState({ page: 'captain-tables' }, '', window.location.pathname);
        } catch (_) { }
      }
    });

    if (window.CafeHeaderBranding && coHeaderCafeName) {
      CafeHeaderBranding.load(coHeaderCafeName, 'كابتن');
    }

    var categoriesPromise = (api.categories && api.categories.list)
      ? api.categories.list().then(function (list) { return Array.isArray(list) ? list : []; })
      : Promise.resolve([]);

    Promise.all([
      api.orders.tables(),
      api.menu.list(),
      categoriesPromise.catch(function () { return []; }),
      loadCaptainAutoApprovalSetting().catch(function () { }),
    ])
      .then(function (results) {
        tables = results[0] || [];
        menu = results[1] || [];
        var apiCats = results[2];
        loadCaptainPendingApprovals();
        categoriesList = extractCaptainCategoriesList(apiCats, menu);
        renderTables();
        renderCategories();

        if (coBtnBack) coBtnBack.addEventListener('click', goBackToTables);

        if (coSearch) {
          coSearch.addEventListener('input', function () {
            searchQuery = coSearch.value;
            renderProducts();
          });
        }

        if (coBtnSend) {
          coBtnSend.addEventListener('click', function () {
            if (cart.length === 0) return;
            openReceiptModal();
          });
        }

        if (coCart) {
          coCart.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            openReceiptModal();
          });
        }
        if (coCartTitle) {
          coCartTitle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openReceiptModal();
            }
          });
        }
        if (coReceiptClose) coReceiptClose.addEventListener('click', closeReceiptModal);
        if (coReceiptBtnSend) coReceiptBtnSend.addEventListener('click', sendOrder);
        if (coReceiptOverlay) {
          coReceiptOverlay.addEventListener('click', function (e) {
            if (e.target === coReceiptOverlay) closeReceiptModal();
          });
        }

        if (coSuccessDone) {
          coSuccessDone.addEventListener('click', onSendSuccessDone);
        }

        if (window.VoiceNotify && VoiceNotify.mountMuteButton) {
          var muteHost = document.getElementById('coHeaderVoiceHost') || coHeader;
          VoiceNotify.mountMuteButton(muteHost);
        }
      })
      .catch(function (err) {
        console.error(err);
        if (coTablesGrid) coTablesGrid.innerHTML = '<p class="co-products-empty">فشل التحميل. تأكد من تشغيل الخادم.</p>';
      });
  }

  init();
})();
