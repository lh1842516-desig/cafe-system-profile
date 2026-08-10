/**
 * واجهة الكاشير — طاولات، طلبات اليوم، القاصة. شريط جانبي ثابت.
 */
(function () {
  const cashierView = document.getElementById('cashierView');
  const cashierBody = document.getElementById('cashierBody') || document.querySelector('.cashier-body');
  const cashierSidebar = document.getElementById('cashierSidebar');
  const cashierSidebarBackdrop = document.getElementById('cashierSidebarBackdrop');
  const btnCashierSidebarOpen = document.getElementById('btnCashierSidebarOpen');
  const tablesGrid = document.getElementById('tablesGrid');
  const cashierApprovalModal = document.getElementById('cashierApprovalModal');
  const cashierApprovalList = document.getElementById('cashierApprovalList');
  const cashierAutoApprovalToggle = document.getElementById('cashierAutoApprovalToggle');
  const cashierAutoApprovalState = document.getElementById('cashierAutoApprovalState');
  const cashierAutoApprovalHint = document.getElementById('cashierAutoApprovalHint');
  let cashierApprovalQueue = [];
  let cashierApprovalProcessingId = null;
  let cashierAutoApprovalEnabled = false;
  let cashierAutoApprovalSaving = false;
  const billTitle = document.getElementById('billTitle');
  const cashierBillNav = document.getElementById('cashierBillNav');
  const ordersContent = document.getElementById('ordersContent');

  const panelTables = document.getElementById('panelTables');
  const panelNewOrder = document.getElementById('panelNewOrder');
  const panelToday = document.getElementById('panelToday');
  const panelCashbox = document.getElementById('panelCashbox');
  const todayGroupedList = document.getElementById('todayGroupedList');
  const todayOrdersEmpty = document.getElementById('todayOrdersEmpty');
  const todaySummaryRevenue = document.getElementById('todaySummaryRevenue');
  const todaySummaryOrders = document.getElementById('todaySummaryOrders');
  const cashboxIncomeValue = document.getElementById('cashboxIncomeValue');
  const cashboxNotes = document.getElementById('cashboxNotes');
  const btnCloseDay = document.getElementById('btnCloseDay');
  const cashboxAlreadyClosed = document.getElementById('cashboxAlreadyClosed');
  const cashboxYesterdayWrap = document.getElementById('cashboxYesterdayWrap');
  const cashboxYesterdayCard = document.getElementById('cashboxYesterdayCard');
  const cashierReceiptOverlay = document.getElementById('cashierReceiptOverlay');
  const cashierReceiptBox = document.getElementById('cashierReceiptBox');
  const cashierReceiptTableNum = document.getElementById('cashierReceiptTableNum');
  const cashierReceiptDate = document.getElementById('cashierReceiptDate');
  const cashierReceiptOrderId = document.getElementById('cashierReceiptOrderId');
  const cashierReceiptOrderType = document.getElementById('cashierReceiptOrderType');
  const cashierReceiptDeliveryMeta = document.getElementById('cashierReceiptDeliveryMeta');
  const cashierReceiptItems = document.getElementById('cashierReceiptItems');
  const cashierReceiptTotal = document.getElementById('cashierReceiptTotal');
  const btnCloseCashierReceipt = document.getElementById('btnCloseCashierReceipt');
  const btnPrintCashierReceipt = document.getElementById('btnPrintCashierReceipt');

  const cashierTableOrderDetailOverlay = document.getElementById('cashierTableOrderDetailOverlay');
  const cashierTableOrderDetailTitle = document.getElementById('cashierTableOrderDetailTitle');
  const cashierTableOrderDetailMeta = document.getElementById('cashierTableOrderDetailMeta');
  const cashierTableOrderDetailBody = document.getElementById('cashierTableOrderDetailBody');
  const cashierTableOrderDetailTotal = document.getElementById('cashierTableOrderDetailTotal');
  const cashierTableOrderDetailBtnPrint = document.getElementById('cashierTableOrderDetailBtnPrint');
  const cashierTableOrderDetailSubtitle = document.getElementById('cashierTableOrderDetailSubtitle');
  const cashierTableOrderDetailCloseX = document.getElementById('cashierTableOrderDetailCloseX');

  const todayTablePanelBackdrop = document.getElementById('todayTablePanelBackdrop');
  const todayTablePanel = document.getElementById('todayTablePanel');
  const todayTablePanelTitle = document.getElementById('todayTablePanelTitle');
  const todayTablePanelClose = document.getElementById('todayTablePanelClose');
  const todayTableDetailBody = document.getElementById('todayTableDetailBody');
  const todayTablePanelTotal = document.getElementById('todayTablePanelTotal');
  const todayTablePanelStatus = document.getElementById('todayTablePanelStatus');
  const todayTablePanelConfirmPay = document.getElementById('todayTablePanelConfirmPay');
  const todayTablePanelPrint = document.getElementById('todayTablePanelPrint');
  const cashierHeaderCafeName = document.getElementById('cashierHeaderCafeName');
  const todaySummaryDineIn = document.getElementById('todaySummaryDineIn');
  const todaySummaryTakeaway = document.getElementById('todaySummaryTakeaway');
  const todaySummaryDelivery = document.getElementById('todaySummaryDelivery');
  const btnCashierNewOrderClose = document.getElementById('btnCashierNewOrderClose');
  const btnCashierNewOrderCancel = document.getElementById('btnCashierNewOrderCancel');
  const btnCashierNewOrderSubmit = document.getElementById('btnCashierNewOrderSubmit');
  const cashierOrderTypeOverlay = document.getElementById('cashierOrderTypeOverlay');
  const btnCashierNewOrderTypeClose = document.getElementById('btnCashierNewOrderTypeClose');
  const btnCashierOrderTypeSendOnly = document.getElementById('btnCashierOrderTypeSendOnly');
  const btnCashierOrderTypePrintSend = document.getElementById('btnCashierOrderTypePrintSend');
  const cashierOrderTypeCartList = document.getElementById('cashierOrderTypeCartList');
  const cashierOrderTypeCartTotal = document.getElementById('cashierOrderTypeCartTotal');
  const cashierOrderTypeGrid = document.getElementById('cashierOrderTypeGrid');
  const cashierDeliveryFields = document.getElementById('cashierDeliveryFields');
  const cashierDineInTable = document.getElementById('cashierDineInTable');
  const cashierDineInTablePicker = document.getElementById('cashierDineInTablePicker');
  const cashierDineInTableGrid = document.getElementById('cashierDineInTableGrid');
  const cashierOrderTypeValidation = document.getElementById('cashierOrderTypeValidation');
  const cashierSectionDineIn = document.getElementById('cashierSectionDineIn');
  const cashierSectionTakeaway = document.getElementById('cashierSectionTakeaway');
  const cashierSectionDelivery = document.getElementById('cashierSectionDelivery');
  const cashierTakeawayCashierName = document.getElementById('cashierTakeawayCashierName');
  const cashierDeliveryName = document.getElementById('cashierDeliveryName');
  const cashierDeliveryPhone = document.getElementById('cashierDeliveryPhone');
  const cashierDeliveryAddress = document.getElementById('cashierDeliveryAddress');
  const cashierNewOrderBody = document.getElementById('cashierNewOrderBody');
  const cashierNewOrderSearch = document.getElementById('cashierNewOrderSearch');
  const cashierNewOrderCategories = document.getElementById('cashierNewOrderCategories');
  const cashierNewOrderProducts = document.getElementById('cashierNewOrderProducts');
  const cashierNewOrderCart = document.getElementById('cashierNewOrderCart');
  const cashierNewOrderTotal = document.getElementById('cashierNewOrderTotal');

  let tables = [];
  const billRequestedTableIds = new Set();
  let selectedTableId = null;
  let socket = null;
  /** سجلات جلسات طلبات اليوم (بعد إغلاق الحساب) */
  let todaySessionsList = [];
  let currentTodaySessionReceipt = null;
  let isGlobalPrintInProgress = false;
  let cashierMenuItems = [];
  let cashierCategories = [];
  let newOrderType = 'DINE_IN';
  let newOrderCategory = '';
  let newOrderSearch = '';
  let newOrderCart = [];
  var DELIVERY_DEFAULT_CUSTOMER_NAME = 'مجهول';
  var DELIVERY_DEFAULT_PHONE = '077';
  let selectedDineInTableId = '';
  let currentTableOrderDetail = null;
  let cachedCafeNameForPrint = '';
  let cachedCafeLogoUrlForPrint = '';
  var CASHIER_RECEIPT_THANKS_HTML =
    'شكراً لزيارتكم لنا 🌹<br>ننتظركم في أقرب وقت';
  /** اسم من فتح القاصة اليوم — يُحدَّث عند تحميل/فتح القاصة */
  let lastTillOpenedBy = '';
  var CASHIER_TILL_NAME_KEY = 'cafe_cashier_active_till_name';

  function clearOrderTypeValidation() {
    if (cashierOrderTypeValidation) {
      cashierOrderTypeValidation.hidden = true;
      cashierOrderTypeValidation.textContent = '';
    }
    if (cashierDineInTablePicker) cashierDineInTablePicker.classList.remove('is-required-hint');
  }

  function showOrderTypeValidation(message) {
    var msg = String(message || '').trim();
    if (!msg) return;
    if (cashierOrderTypeValidation) {
      cashierOrderTypeValidation.textContent = msg;
      cashierOrderTypeValidation.hidden = false;
      try {
        cashierOrderTypeValidation.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {}
    }
    if (cashierDineInTablePicker && newOrderType === 'DINE_IN') {
      cashierDineInTablePicker.classList.remove('is-required-hint');
      void cashierDineInTablePicker.offsetWidth;
      cashierDineInTablePicker.classList.add('is-required-hint');
    }
  }

  function cashierAlert(message, options) {
    var msg = String(message == null ? '' : message);
    if (window.CafeDialog && typeof CafeDialog.alert === 'function') {
      return CafeDialog.alert(msg, options || {});
    }
    return Promise.resolve(window.alert(msg));
  }

  function persistCashierTillName(name) {
    var n = String(name || '').trim();
    if (!n) return;
    lastTillOpenedBy = n;
    try {
      sessionStorage.setItem(CASHIER_TILL_NAME_KEY, n);
    } catch (_) {}
  }

  function getStoredCashierTillName() {
    try {
      return String(sessionStorage.getItem(CASHIER_TILL_NAME_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function applyTillOpenedByFromPayload(tillRow) {
    if (!tillRow || tillRow.status !== 'open' || tillRow.closedAt) return;
    var name = tillRow.openedBy != null ? String(tillRow.openedBy).trim() : '';
    if (name) persistCashierTillName(name);
  }

  function refreshCashierNameFromTill() {
    if (!api || !api.till || typeof api.till.current !== 'function') {
      return Promise.resolve(getPreferredCashierName());
    }
    return api.till
      .current()
      .then(function (data) {
        if (data && data.till) applyTillOpenedByFromPayload(data.till);
        return getPreferredCashierName();
      })
      .catch(function () {
        return getPreferredCashierName();
      });
  }

  function renderDineInTableGrid() {
    if (!cashierDineInTableGrid) return;
    var html = '';
    var list = Array.isArray(tables) && tables.length > 0 ? tables : [];
    if (!list.length) {
      for (var i = 1; i <= 20; i++) {
        list.push({ id: String(i), label: String(i) });
      }
    }
    list.forEach(function (t) {
      var id = String(t && t.id != null ? t.id : '').trim();
      if (!id) return;
      var label = String((t && (t.label != null && t.label !== '' ? t.label : t.id)) || id).trim();
      var isSelected = selectedDineInTableId === id;
      html +=
        '<button type="button" class="cashier-table-pick-btn' +
        (isSelected ? ' active' : '') +
        '" data-table-id="' +
        escapeHtml(id) +
        '">' +
        escapeHtml(label) +
        '</button>';
    });
    cashierDineInTableGrid.innerHTML = html;
    cashierDineInTableGrid.querySelectorAll('.cashier-table-pick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedDineInTableId = btn.getAttribute('data-table-id') || '';
        if (cashierDineInTable) cashierDineInTable.value = selectedDineInTableId;
        clearOrderTypeValidation();
        renderDineInTableGrid();
      });
    });
  }

  function absCafeAssetUrl(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    var base = String(window.location.origin || '').replace(/\/$/, '');
    return base + (p.charAt(0) === '/' ? p : '/' + p);
  }

  function applyCashierCafeName(cafeName) {
    var name = String(cafeName || '').trim();
    cachedCafeNameForPrint = name;
    if (!cashierHeaderCafeName) return;
    if (name) {
      cashierHeaderCafeName.textContent = name;
      cashierHeaderCafeName.hidden = false;
      cashierHeaderCafeName.removeAttribute('hidden');
      try {
        document.title = 'واجهة الكاشير — ' + name;
      } catch (_) {}
    } else {
      cashierHeaderCafeName.textContent = '';
      cashierHeaderCafeName.hidden = true;
      cashierHeaderCafeName.setAttribute('hidden', '');
      try {
        document.title = 'واجهة الكاشير — نظام الكافيه';
      } catch (_) {}
    }
  }

  function loadCashierCafeBranding() {
    if (!api || !api.settings || typeof api.settings.getCafe !== 'function') return Promise.resolve();
    return api.settings
      .getCafe()
      .then(function (data) {
        applyCashierCafeName(data && data.cafeName);
        cachedCafeLogoUrlForPrint =
          data && data.logoUrl != null ? String(data.logoUrl).trim() : '';
        return data;
      })
      .catch(function () {
        applyCashierCafeName('');
        cachedCafeLogoUrlForPrint = '';
      });
  }

  function getReceiptBrandHtml() {
    var logoPath = cachedCafeLogoUrlForPrint ? absCafeAssetUrl(cachedCafeLogoUrlForPrint) : '';
    var logoHtml = logoPath
      ? '<img class="brand-logo" src="' + escapeHtml(logoPath) + '" alt="">'
      : '';
    return (
      '<div class="brand">' +
      logoHtml +
      '<p class="brand-name">' +
      escapeHtml(getCachedCafeName()) +
      '</p></div>'
    );
  }

  function collectTableOrderOwners(orders) {
    var sorted = sortOrdersByCreatedAt(orders || []);
    if (!sorted.length) return '—';
    var seenBatches = Object.create(null);
    var i, order, bid, dineCust, value;
    for (i = 0; i < sorted.length; i++) {
      order = sorted[i];
      bid = order.kitchenBatchId != null ? String(order.kitchenBatchId).trim() : '';
      if (bid) {
        if (seenBatches[bid]) continue;
        seenBatches[bid] = true;
      }
      dineCust = getDineInCustomerDisplay(order);
      value = dineCust.chipValue != null ? String(dineCust.chipValue).trim() : '';
      if (value && value !== '—') return value;
    }
    return '—';
  }

  function escapeHtmlCashier(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatMoneyCashier(n) {
    return window.formatCurrency ? window.formatCurrency(n) : String(Math.round(Number(n) || 0)) + ' IQD';
  }

  function dedupeCashierApprovalRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const seen = new Set();
    const result = [];
    list.forEach(function (row) {
      if (!row || row.id == null) return;
      const batchKey =
        row.kitchenBatchId != null && String(row.kitchenBatchId).trim()
          ? 'batch:' + String(row.kitchenBatchId).trim()
          : 'order:' + String(row.id);
      if (seen.has(batchKey)) return;
      seen.add(batchKey);
      result.push(row);
    });
    return result;
  }

  function applyCashierAutoApprovalUi() {
    if (!cashierAutoApprovalToggle) return;
    const on = !!cashierAutoApprovalEnabled;
    cashierAutoApprovalToggle.classList.toggle('is-on', on);
    cashierAutoApprovalToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    if (cashierAutoApprovalState) cashierAutoApprovalState.textContent = on ? 'ON' : 'OFF';
    if (cashierAutoApprovalHint) {
      cashierAutoApprovalHint.textContent = on
        ? 'مفعّل — الطلبات تُرسل للمطبخ مباشرة'
        : 'متوقف — تظهر رسالة الموافقة لكل طلب';
    }
  }

  async function loadCashierAutoApprovalSetting() {
    if (!api.settings || !api.settings.getCafe) return;
    try {
      const data = await api.settings.getCafe();
      cashierAutoApprovalEnabled = !!(data && data.requireCashierKitchenApproval === false);
      applyCashierAutoApprovalUi();
    } catch (_) {}
  }

  async function toggleCashierAutoApproval() {
    if (cashierAutoApprovalSaving) return;
    if (!api || !api.settings || typeof api.settings.updateKitchenApproval !== 'function') {
      alert('تعذّر حفظ الإعداد — حدّث الصفحة (Ctrl+F5) ثم أعد تشغيل الخادم.');
      return;
    }
    const nextOn = !cashierAutoApprovalEnabled;
    cashierAutoApprovalSaving = true;
    if (cashierAutoApprovalToggle) cashierAutoApprovalToggle.disabled = true;
    try {
      const res = await api.settings.updateKitchenApproval(!nextOn);
      const settings = res && res.settings ? res.settings : res;
      cashierAutoApprovalEnabled = !!(settings && settings.requireCashierKitchenApproval === false);
      applyCashierAutoApprovalUi();
      if (nextOn) {
        cashierApprovalQueue = [];
        hideCashierApprovalModal();
        if (selectedTableId != null) await loadTableOrders(selectedTableId);
        if (panelToday && panelToday.classList.contains('active')) await loadTodayOrders();
        const approvedCount =
          res && Array.isArray(res.approvedOrderIds) ? res.approvedOrderIds.length : 0;
        if (typeof showToast === 'function') {
          showToast(
            approvedCount > 0
              ? 'تم تفعيل الموافقة التلقائية — أُرسلت ' + approvedCount + ' طلبات معلّقة للمطبخ.'
              : 'تم تفعيل الموافقة التلقائية — الطلبات تُرسل للمطبخ مباشرة.'
          );
        }
      } else if (typeof showToast === 'function') {
        showToast('تم إيقاف الموافقة التلقائية — ستظهر رسالة الموافقة.');
      }
      await loadCashierPendingApprovals();
    } catch (err) {
      alert(err.json && err.json.error ? err.json.error : err.message || 'تعذّر حفظ الإعداد.');
    } finally {
      cashierAutoApprovalSaving = false;
      if (cashierAutoApprovalToggle) cashierAutoApprovalToggle.disabled = false;
    }
  }

  function hideCashierApprovalModal() {
    if (!cashierApprovalModal) return;
    cashierApprovalModal.classList.remove('open');
    cashierApprovalModal.setAttribute('aria-hidden', 'true');
    if (cashierApprovalList) cashierApprovalList.innerHTML = '';
  }

  function renderCashierApprovalModalList(rows) {
    if (!cashierApprovalList) return;
    const list = dedupeCashierApprovalRows(rows);
    if (!list.length) {
      hideCashierApprovalModal();
      return;
    }
    cashierApprovalList.innerHTML = list
      .map(function (row) {
        const oid = escapeHtmlCashier(row.id);
        const tableLabel = escapeHtmlCashier(row.tableLabel || 'طاولة ' + row.tableId);
        return (
          '<li class="cashier-approval-modal__item" data-approval-order-id="' +
          oid +
          '">' +
          '<div class="cashier-approval-modal__item-main">' +
          '<span class="cashier-approval-modal__table">' +
          tableLabel +
          '</span>' +
          '<span class="cashier-approval-modal__msg">ينتظر موافقتك لإرسال طلبه إلى المطبخ</span>' +
          '</div>' +
          '<div class="cashier-approval-modal__row-actions">' +
          '<button type="button" class="btn btn-secondary" data-reject-order="' +
          oid +
          '">غير موافق</button>' +
          '<button type="button" class="btn btn-primary" data-approve-order="' +
          oid +
          '">موافق</button>' +
          '</div>' +
          '</li>'
        );
      })
      .join('');
    cashierApprovalList.querySelectorAll('[data-approve-order]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-approve-order');
        if (id) approveCashierOrderById(id, btn);
      });
    });
    cashierApprovalList.querySelectorAll('[data-reject-order]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-reject-order');
        if (id) rejectCashierOrderById(id, btn);
      });
    });
    if (cashierApprovalModal) {
      cashierApprovalModal.classList.add('open');
      cashierApprovalModal.setAttribute('aria-hidden', 'false');
    }
  }

  function syncCashierApprovalQueue(rows) {
    cashierApprovalQueue = dedupeCashierApprovalRows(rows);
    if (cashierAutoApprovalEnabled) {
      hideCashierApprovalModal();
      return;
    }
    if (!cashierApprovalQueue.length) {
      hideCashierApprovalModal();
      return;
    }
    renderCashierApprovalModalList(cashierApprovalQueue);
  }

  async function loadCashierPendingApprovals() {
    if (!api.orders || !api.orders.pendingCashierApproval) return;
    if (cashierAutoApprovalEnabled) {
      cashierApprovalQueue = [];
      hideCashierApprovalModal();
      return;
    }
    try {
      const list = await api.orders.pendingCashierApproval();
      syncCashierApprovalQueue(Array.isArray(list) ? list : []);
    } catch (_) {
      cashierApprovalQueue = [];
      if (!cashierApprovalProcessingId) hideCashierApprovalModal();
    }
  }

  function setCashierApprovalRowBusy(orderId, busy, approveText, rejectText) {
    if (!cashierApprovalList || orderId == null) return;
    const item = Array.from(
      cashierApprovalList.querySelectorAll('[data-approval-order-id]')
    ).find(function (el) {
      return el.getAttribute('data-approval-order-id') === String(orderId);
    });
    if (!item) return;
    const approveBtn = item.querySelector('[data-approve-order]');
    const rejectBtn = item.querySelector('[data-reject-order]');
    if (approveBtn) {
      approveBtn.disabled = !!busy;
      if (approveText) approveBtn.textContent = approveText;
      else if (!busy) approveBtn.textContent = 'موافق';
    }
    if (rejectBtn) {
      rejectBtn.disabled = !!busy;
      if (rejectText) rejectBtn.textContent = rejectText;
      else if (!busy) rejectBtn.textContent = 'غير موافق';
    }
  }

  async function approveCashierOrderById(orderId, btn) {
    if (!orderId || cashierApprovalProcessingId || !api.orders || !api.orders.approveKitchen) return;
    cashierApprovalProcessingId = String(orderId);
    setCashierApprovalRowBusy(orderId, true, 'جاري الإرسال…', null);
    if (btn) btn.disabled = true;
    try {
      await api.orders.approveKitchen(orderId);
      if (selectedTableId != null) await loadTableOrders(selectedTableId);
      if (panelToday && panelToday.classList.contains('active')) await loadTodayOrders();
      if (typeof showToast === 'function') {
        showToast('تمت الموافقة — أُرسل الطلب إلى المطبخ.');
      }
    } catch (err) {
      alert(err.json && err.json.error ? err.json.error : err.message || 'تعذّر الموافقة على الطلب.');
    } finally {
      cashierApprovalProcessingId = null;
      await loadCashierPendingApprovals();
    }
  }

  async function rejectCashierOrderById(orderId, btn) {
    if (!orderId || cashierApprovalProcessingId || !api.orders || !api.orders.rejectKitchen) return;
    cashierApprovalProcessingId = String(orderId);
    setCashierApprovalRowBusy(orderId, true, null, 'جاري الرفض…');
    if (btn) btn.disabled = true;
    try {
      await api.orders.rejectKitchen(orderId);
      if (selectedTableId != null) await loadTableOrders(selectedTableId);
      if (panelToday && panelToday.classList.contains('active')) await loadTodayOrders();
      if (typeof showToast === 'function') {
        showToast('تم رفض الطلب — أُبلِغ الزبون.');
      }
    } catch (err) {
      alert(err.json && err.json.error ? err.json.error : err.message || 'تعذّر رفض الطلب.');
    } finally {
      cashierApprovalProcessingId = null;
      await loadCashierPendingApprovals();
    }
  }

  function connectSocket() {
    try {
      var token = sessionStorage.getItem('cafezip_saas_token') || '';
      socket = io(window.location.origin, {
        query: { token: token }
      });
      socket.on('connect', () => updateConnectionStatus(true));
      socket.on('disconnect', () => updateConnectionStatus(false));
      socket.on('new-order', (order) => {
        if (selectedTableId != null && String(order.tableId) === String(selectedTableId)) loadTableOrders(selectedTableId);
      });
      socket.on('cashier-approval-pending', function () {
        loadCashierPendingApprovals();
      });
      socket.on('captain-request', function (payload) {
        if (!payload) return;
        var msg =
          payload.message ||
          'طاولة ' + String(payload.tableLabel || payload.tableId || '') + ' تطلب حضور الكابتن';
        if (window.NotificationCenter && typeof NotificationCenter.notifyCaptain === 'function') {
          NotificationCenter.notifyCaptain({
            title: 'طلب كابتن',
            message: msg,
            ttlMs: 5000,
          });
        }
      });
      socket.on('customer_call_waiter', function (payload) {
        if (!payload) return;
        var nameStr = payload.customerName ? ' (' + payload.customerName + ')' : '';
        var msg = 'طاولة ' + String(payload.tableLabel || payload.tableId || '') + nameStr + ' تطلب حضور الكابتن';
        if (window.NotificationCenter && typeof NotificationCenter.notifyCaptain === 'function') {
          NotificationCenter.notifyCaptain({
            title: 'طلب كابتن',
            message: msg,
            ttlMs: 6000,
          });
        }
      });
      socket.on('bill-request', function (payload) {
        if (!payload) return;
        var tid = payload.tableId != null ? String(payload.tableId) : '';
        if (tid) setTableAwaitingBill(tid, true);
        var lbl = String(payload.tableLabel || payload.tableId || '');
        var msg =
          payload.cashierMessage ||
          payload.message ||
          (payload.isReminder
            ? 'طاولة رقم ' + lbl + ' — إعادة إرسال طلب الحساب'
            : 'طاولة رقم ' + lbl + ' تطلب الحساب');
        if (window.NotificationCenter && typeof NotificationCenter.notifyBill === 'function') {
          NotificationCenter.notifyBill({
            title: payload.isReminder ? 'إعادة طلب حساب' : 'طلب حساب',
            message: msg,
            ttlMs: 6000,
          });
        }
      });
      socket.on('customer_request_bill', function (payload) {
        if (!payload) return;
        var tid = payload.tableId != null ? String(payload.tableId) : '';
        if (tid) setTableAwaitingBill(tid, true);
        var nameStr = payload.customerName ? ' (' + payload.customerName + ')' : '';
        var msg = 'طاولة رقم ' + String(payload.tableLabel || payload.tableId || '') + nameStr + ' تطلب الحساب';
        if (window.NotificationCenter && typeof NotificationCenter.notifyBill === 'function') {
          NotificationCenter.notifyBill({
            title: 'طلب حساب',
            message: msg,
            ttlMs: 6000,
          });
        }
      });
      socket.on('table_update', function (payload) {
        if (!payload || payload.tableId == null) return;
        var tid = normalizeCashierTableId(payload.tableId);
        if (!tid) return;
        var st = String(payload.status || '').toLowerCase();
        if (st === 'awaiting_bill' || st === 'awaitingbill') {
          setTableAwaitingBill(tid, true);
        } else if (st === 'available') {
          setTableAwaitingBill(tid, false);
        }
      });
      socket.on('orders-updated', (data) => {
        if (
          data &&
          (data.reason === 'pending-cashier-approval' ||
            data.reason === 'cashier-approved' ||
            data.reason === 'cashier-rejected')
        ) {
          loadCashierPendingApprovals();
        }
        if (data && data.tillSessionClosed) {
          if (selectedTableId != null) loadTableOrders(selectedTableId);
          if (panelToday && panelToday.classList.contains('active')) loadTodayOrders();
          loadCashierPendingApprovals();
          return;
        }
        if (panelToday && panelToday.classList.contains('active')) loadTodayOrders();
        if (selectedTableId == null) return;
        if (!data || data.tableId == null || String(data.tableId) === String(selectedTableId)) {
          loadTableOrders(selectedTableId);
        }
      });
      socket.on('cafe-settings-updated', function (payload) {
        if (payload && payload.requireCashierKitchenApproval !== undefined) {
          cashierAutoApprovalEnabled = payload.requireCashierKitchenApproval === false;
          applyCashierAutoApprovalUi();
          loadCashierPendingApprovals();
        }
        if (payload && payload.cafeName != null) {
          applyCashierCafeName(payload.cafeName);
        } else {
          loadCashierCafeBranding();
        }
      });
    } catch (_) {
      updateConnectionStatus(false);
    }
  }

  function updateConnectionStatus(connected) {
    const el = document.getElementById('realtimeStatus');
    if (!el) return;
    el.textContent = connected ? 'متصل — الطلبات فورية' : 'غير متصل';
    el.className = 'realtime-status' + (connected ? ' connected' : '');
  }

  function normalizeCashierTableId(tableId) {
    const s = String(tableId == null ? '' : tableId).trim();
    if (!s) return '';
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return String(n);
    }
    return s;
  }

  function isTableAwaitingBill(tableId) {
    return billRequestedTableIds.has(normalizeCashierTableId(tableId));
  }

  function setTableAwaitingBill(tableId, awaiting) {
    const id = normalizeCashierTableId(tableId);
    if (!id) return;
    if (awaiting) billRequestedTableIds.add(id);
    else billRequestedTableIds.delete(id);
    renderTables();
  }

  async function loadBillRequestedTables() {
    try {
      if (!api.tableSessions || !api.tableSessions.getBillRequestedTables) return;
      const res = await api.tableSessions.getBillRequestedTables();
      billRequestedTableIds.clear();
      (res && res.tableIds ? res.tableIds : []).forEach((id) => billRequestedTableIds.add(String(id)));
    } catch (_) {}
  }

  function renderTables() {
    tablesGrid.innerHTML = tables
      .map(
        (t) => `
        <div class="table-card${isTableAwaitingBill(t.id) ? ' table-card--awaiting-bill' : ''}" data-table="${escapeHtml(t.id)}" role="button" tabindex="0">
          <span class="num">${escapeHtml(t.label || t.id)}</span>
          ${isTableAwaitingBill(t.id) ? '<span class="table-card__bill-badge">بانتظار الحساب</span>' : ''}
        </div>
      `
      )
      .join('');

    tablesGrid.querySelectorAll('.table-card').forEach((el) => {
      el.addEventListener('click', () => selectTable(el.dataset.table));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTable(el.dataset.table);
        }
      });
    });

    renderDineInTableGrid();
  }

  function selectTable(tableId) {
    closeCashierTableOrderDetailModal();
    selectedTableId = tableId;
    cashierView.classList.add('view-bill-active');
    if (cashierBillNav) cashierBillNav.setAttribute('aria-hidden', 'false');
    tablesGrid.querySelectorAll('.table-card').forEach((el) => {
      el.classList.toggle('selected', el.dataset.table === tableId);
    });
    billTitle.textContent = tableDisplayLabel(tableId) + ' — الطلبات والفاتورة';
    loadTableOrders(tableId);
  }

  function goBackToTables() {
    selectedTableId = null;
    cashierView.classList.remove('view-bill-active');
    if (cashierBillNav) cashierBillNav.setAttribute('aria-hidden', 'true');
    tablesGrid.querySelectorAll('.table-card').forEach((el) => el.classList.remove('selected'));
    if (ordersContent) ordersContent.innerHTML = '';
    closeCashierTableOrderDetailModal();
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatPrice(n) {
    return window.formatCurrency ? window.formatCurrency(n) : Number(n).toFixed(0) + ' IQD';
  }

  function tableDisplayLabel(tableId) {
    if (String(tableId) === 'TAKEAWAY') return 'سفري';
    if (String(tableId) === 'DELIVERY') return 'دلفري';
    return 'طاولة ' + tableId;
  }

  function normalizeOrderType(raw) {
    var val = String(raw == null ? '' : raw).trim().toUpperCase();
    if (val === 'TAKEAWAY' || val === 'DELIVERY') return val;
    return 'DINE_IN';
  }

  /** يستنتج نوع الطلب من الحقل أو من tableId (TAKEAWAY / DELIVERY) */
  function inferOrderType(order) {
    if (!order) return 'DINE_IN';
    var tid = String(order.tableId != null ? order.tableId : '').trim().toUpperCase();
    if (tid === 'TAKEAWAY') return 'TAKEAWAY';
    if (tid === 'DELIVERY') return 'DELIVERY';
    return normalizeOrderType(order.orderType);
  }

  function orderTypeBadgeText(raw) {
    var t = normalizeOrderType(raw);
    if (t === 'TAKEAWAY') return '🥡 سفري';
    if (t === 'DELIVERY') return '🚚 دلفري';
    return '🍽️ داخل الصالة';
  }

  function orderTypeLabelAr(raw) {
    var t = normalizeOrderType(raw);
    if (t === 'TAKEAWAY') return 'سفري';
    if (t === 'DELIVERY') return 'دلفري';
    return 'داخل الصالة';
  }

  function typeCountFromOrders(orders) {
    var out = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0 };
    (orders || []).forEach(function (o) {
      var t = inferOrderType(o);
      out[t] += 1;
    });
    return out;
  }

  /** رقم الطلب للعرض في الفاتورة والوصل: T1-001 أو — (لا يعرض UUID) */
  function getOrderIdDisplay(order) {
    if (!order) return '—';
    var id =
      order.displayOrderId != null && order.displayOrderId !== '' && order.displayOrderId !== '—'
        ? order.displayOrderId
        : (order.id || '');
    if (id && /^(T\d+|K|D)-\d{1,}$/.test(String(id).trim())) return id.trim();
    return '—';
  }

  function buildPrintOrderFromSubmit(created, orderType, serviceMeta) {
    var base = created && typeof created === 'object' ? created : {};
    return Object.assign({}, base, {
      orderType: orderType,
      serviceMeta: serviceMeta || base.serviceMeta,
      displayOrderId: getOrderIdDisplay(base),
    });
  }

  /** تاريخ ووقت بأرقام إنجليزي للوصل */
  function formatBillDateTime(iso) {
    var parts = formatBillDateParts(iso);
    if (!parts.date && !parts.time) return '';
    if (parts.date === '—' && parts.time === '—') return '—';
    return parts.date + ' ' + parts.time;
  }

  function formatBillDateParts(iso) {
    if (!iso) return { date: '—', time: '—' };
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { date: '—', time: '—' };
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = d.getFullYear();
    var h = d.getHours();
    var m = d.getMinutes();
    var s = d.getSeconds();
    var am = h < 12;
    var h12 = h % 12 || 12;
    var t = h12 + ':' + (m < 10 ? '0' : '') + m + (s > 0 ? ':' + (s < 10 ? '0' : '') + s : '') + (am ? ' ص' : ' م');
    return {
      date: day + '/' + month + '/' + year,
      time: t,
    };
  }

  /** تاريخ بصيغة سنة/شهر/يوم للعرض والطباعة */
  function formatBillDateYmd(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** سطر واحد: المدة / التاريخ / الوقت (أول طلب) */
  function formatBillSessionMetaLine(durationStr, firstAtIso) {
    var dur = String(durationStr != null ? durationStr : '—').trim() || '—';
    var dateStr = firstAtIso ? formatBillDateYmd(firstAtIso) : '—';
    var timeStr = firstAtIso ? formatBillDateParts(firstAtIso).time : '—';
    return 'المدة: ' + dur + ' / التاريخ: ' + dateStr + ' / الوقت: ' + timeStr;
  }

  function sortOrdersByCreatedAt(orders) {
    return (orders || []).slice().sort(function (a, b) {
      var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }

  /** مدة تقريبية من أول طلب حتى الآن (للكاشير) */
  function formatDurationSinceFirst(iso) {
    if (!iso) return '—';
    var start = new Date(iso).getTime();
    var ms = Math.max(0, Date.now() - start);
    var totalMin = Math.floor(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + ' ساعة' + (m ? ' و ' + m + ' دقيقة' : '');
    if (m > 0) return m + ' دقيقة';
    return 'أقل من دقيقة';
  }

  /** مرجع قصير لعمود # الطلب (مثل T1-003) */
  function shortOrderRef(order, index) {
    var d = getOrderIdDisplay(order);
    if (d && d !== '—') return d;
    return '#' + String((index || 0) + 1);
  }

  function orderSectionLabel(index) {
    var ordinals = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
    if (index >= 0 && index < ordinals.length) return 'الطلب ' + ordinals[index];
    return 'الطلب #' + String(index + 1);
  }

  /** اسم الزبون من المنيو + طلب مشترك (bundledCustomerNames) */
  function getDineInCustomerDisplay(order) {
    var bundled = [];
    if (order && Array.isArray(order.bundledCustomerNames)) {
      bundled = order.bundledCustomerNames
        .map(function (n) {
          return String(n || '').trim();
        })
        .filter(Boolean);
    }
    if (bundled.length > 1) {
      var senderName = bundled[0] || '—';
      return {
        chipLabel: 'صاحب الطلب',
        chipValue: senderName,
        chipSub: bundled.length + ' مشاركين',
        printLine:
          'صاحب الطلب: ' +
          senderName +
          ' (طلب مشترك · ' +
          bundled.length +
          ' مشاركين)',
        isShared: true,
      };
    }
    var primary = order && order.customerName != null ? String(order.customerName).trim() : '';
    if (!primary && bundled.length === 1) primary = bundled[0];
    if (!primary && order && order.items && order.items.length) {
      for (var i = order.items.length - 1; i >= 0; i--) {
        var ob = order.items[i].orderedByName;
        if (ob != null && String(ob).trim()) {
          primary = String(ob).trim();
          break;
        }
      }
    }
    if (!primary && order && order.serviceMeta && order.serviceMeta.cashierName) {
      primary = 'كاشير';
    }
    return {
      chipLabel: 'صاحب الطلب',
      chipValue: primary || '—',
      chipSub: '',
      printLine: 'صاحب الطلب: ' + (primary || '—'),
      isShared: false,
    };
  }

  function sumOrderItems(order) {
    return (order.items || []).reduce(function (s, it) {
      return s + (Number(it.price) || 0) * (Number(it.quantity) || 0);
    }, 0);
  }

  function orderItemsNeedPerSenderLabels(order) {
    if (!order) return false;
    if (Array.isArray(order.bundledCustomerNames) && order.bundledCustomerNames.length > 1) return true;
    return (order.items || []).some(function (it) {
      return it.orderedByName != null && String(it.orderedByName).trim();
    });
  }

  function formatOrderItemNameHtml(item, showOrderedBy) {
    var name = escapeHtml(item && item.name != null ? String(item.name) : '');
    if (!showOrderedBy || !item) return name;
    var ob = item.orderedByName != null ? String(item.orderedByName).trim() : '';
    if (ob) name += ' <span class="item-ordered-by">(' + escapeHtml(ob) + ')</span>';
    return name;
  }

  /**
   * تجميع عناصر كل الطلبات المفتوحة في قائمة موحّدة.
   * نفس الصنف عبر عدة طلبات يُعرض كسطر واحد بكمية ومجموع موحدين.
   */
  function consolidateOrderItems(orders) {
    var source = Array.isArray(orders) ? orders : [];
    var byName = Object.create(null);
    source.forEach(function (order) {
      (order.items || []).forEach(function (item) {
        var rawName = item && item.name != null ? String(item.name) : '';
        var key = rawName.trim().toLowerCase();
        if (!key) return;
        var qty = Number(item.quantity) || 0;
        var unitPrice = Number(item.price) || 0;
        var lineTotal = qty * unitPrice;
        if (!byName[key]) {
          byName[key] = {
            name: rawName.trim(),
            quantity: 0,
            totalPrice: 0,
          };
        }
        byName[key].quantity += qty;
        byName[key].totalPrice += lineTotal;
      });
    });
    return Object.keys(byName)
      .map(function (k) {
        var row = byName[k];
        var effectiveUnit = row.quantity > 0 ? row.totalPrice / row.quantity : 0;
        return {
          name: row.name,
          quantity: row.quantity,
          unitPrice: effectiveUnit,
          totalPrice: row.totalPrice,
        };
      })
      .sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), 'ar');
      });
  }

  function groupedCategories(items, categoryList) {
    var set = Object.create(null);
    (categoryList || []).forEach(function (cat) {
      var name = typeof cat === 'object' && cat ? String(cat.name || '').trim() : String(cat || '').trim();
      if (name) set[name] = true;
    });
    (items || []).forEach(function (it) {
      var c = String((it && it.category) || '').trim();
      if (c) set[c] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, 'ar');
    });
  }

  function visibleProductsForNewOrder() {
    var q = String(newOrderSearch || '').trim().toLowerCase();
    return cashierMenuItems.filter(function (it) {
      if (!it || it.isAvailable === false) return false;
      if (newOrderCategory && String(it.category || '') !== newOrderCategory) return false;
      if (!q) return true;
      return String(it.name || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function findCartLine(menuId) {
    return newOrderCart.find(function (line) {
      return String(line.menuId) === String(menuId);
    });
  }

  function calcNewOrderTotal() {
    return newOrderCart.reduce(function (s, line) {
      return s + (Number(line.price) || 0) * (Number(line.quantity) || 0);
    }, 0);
  }

  function getPreferredCashierName() {
    if (lastTillOpenedBy) return lastTillOpenedBy;
    var stored = getStoredCashierTillName();
    if (stored) {
      lastTillOpenedBy = stored;
      return stored;
    }
    var fromOpen = '';
    try {
      fromOpen = String((document.getElementById('cashboxOpenNameInput') || {}).value || '').trim();
    } catch (_) {}
    if (fromOpen) return fromOpen;
    var fromDisplay = '';
    try {
      fromDisplay = String((document.getElementById('cashboxOpenedByDisplay') || {}).textContent || '').trim();
    } catch (_) {}
    if (fromDisplay && fromDisplay !== '—') return fromDisplay;
    return '';
  }

  function resolveCashierNameForPrint(order) {
    var fromOrder = getCashierNameForReceipt(order);
    if (fromOrder && fromOrder !== '—') return fromOrder;
    var preferred = getPreferredCashierName();
    return preferred || '—';
  }

  function prefillTakeawayCashierNameIfEmpty() {
    if (!cashierTakeawayCashierName) return;
    var current = String(cashierTakeawayCashierName.value || '').trim();
    if (current) return;
    var preferred = getPreferredCashierName();
    if (preferred) cashierTakeawayCashierName.value = preferred;
  }

  function closeOrderTypeModal() {
    clearOrderTypeValidation();
    if (!cashierOrderTypeOverlay) return;
    cashierOrderTypeOverlay.classList.remove('open');
    cashierOrderTypeOverlay.setAttribute('aria-hidden', 'true');
  }

  function closeCashierReceipt() {
    if (!cashierReceiptOverlay) return;
    cashierReceiptOverlay.classList.remove('open');
  }

  function closeAllCashierOrderModals() {
    closeOrderTypeModal();
    closeCashierReceipt();
    closeCashierTableOrderDetailModal();
  }

  function getCachedCafeName() {
    if (cachedCafeNameForPrint) return cachedCafeNameForPrint;
    try {
      var fromHeader = cashierHeaderCafeName && String(cashierHeaderCafeName.textContent || '').trim();
      if (fromHeader) return fromHeader;
    } catch (_) {}
    return 'الكافيه';
  }

  function getCashierNameForReceipt(order) {
    if (order && order.serviceMeta && order.serviceMeta.cashierName) {
      var fromMeta = String(order.serviceMeta.cashierName).trim();
      if (fromMeta) return fromMeta;
    }
    return getPreferredCashierName() || '—';
  }

  function getCashierReceiptPrintStyles() {
    return (
      '@page{size:80mm auto;margin:3mm}' +
      'html,body{width:76mm;max-width:76mm;margin:0 auto}' +
      '@font-face{font-family:Cairo;font-weight:400;font-display:swap;src:url("/fonts/Cairo-400.ttf") format("truetype")}' +
      '@font-face{font-family:Cairo;font-weight:600;font-display:swap;src:url("/fonts/Cairo-600.ttf") format("truetype")}' +
      '@font-face{font-family:Cairo;font-weight:700;font-display:swap;src:url("/fonts/Cairo-700.ttf") format("truetype")}' +
      '@font-face{font-family:Cairo;font-weight:800;font-display:swap;src:url("/fonts/Cairo-800.ttf") format("truetype")}' +

      'body{font-family:Cairo,Tahoma,"Segoe UI",Arial,sans-serif;background:#fff;color:#111;padding:3mm 2mm;line-height:1.42;font-size:10px}' +
      '.brand{text-align:center;padding:0 0 8px;margin:0 0 8px;border-bottom:2px solid #1a1a1a}' +
      '.brand-logo{max-width:52mm;max-height:18mm;width:auto;height:auto;margin:0 auto 6px;display:block;object-fit:contain}' +
      '.brand-name{font-size:17px;font-weight:800;margin:0;letter-spacing:0.02em}' +
      '.doc-title{font-size:12px;font-weight:700;margin:0 0 8px;text-align:center;line-height:1.35}' +
      '.meta-block{margin:0 0 8px;padding:0 0 6px;border-bottom:1px dashed #bbb}' +
      '.meta-row{font-size:9px;color:#333;margin:0 0 4px;line-height:1.45}' +
      'table{width:100%;border-collapse:collapse;font-size:9px;margin:4px 0 6px}' +
      'th,td{padding:3px 2px;text-align:right;border-bottom:1px solid #e6e6e6;vertical-align:middle}' +
      'th{font-weight:700;background:#f4f4f4;font-size:8px;color:#222}' +
      '.num{text-align:center;white-space:nowrap}' +
      'td.total{font-weight:700}' +
      '.grand{margin:6px 0;padding:7px 0;border-top:2px solid #1a1a1a;border-bottom:1px solid #ddd;text-align:center;font-size:14px;font-weight:800}' +
      '.thanks{text-align:center;margin-top:10px;padding-top:6px;font-size:10px;line-height:1.6;color:#444}' +
      '.empty{text-align:center;color:#888;padding:6px}' +
      '.item-ordered-by{font-size:8px;color:#666;font-weight:600}' +
      '@media print{body{padding:2mm 1mm}}'
    );
  }

  function buildCashierReceiptPrintBody(opts) {
    opts = opts || {};
    var metaHtml = (opts.metaRows || [])
      .map(function (line) {
        return '<p class="meta-row">' + line + '</p>';
      })
      .join('');
    var rawCashier =
      opts.cashierName != null && String(opts.cashierName).trim()
        ? String(opts.cashierName).trim()
        : getPreferredCashierName() || '—';
    var cashierName = escapeHtml(rawCashier);
    return (
      getReceiptBrandHtml() +
      '<p class="doc-title">' +
      escapeHtml(opts.title || 'وصل') +
      '</p>' +
      '<div class="meta-block">' +
      metaHtml +
      '<p class="meta-row"><strong>الكاشير:</strong> ' +
      cashierName +
      '</p></div>' +
      '<table><thead><tr><th>اسم المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>' +
      (opts.tableBody || '<tr><td colspan="4" class="empty">لا أصناف</td></tr>') +
      '</tbody></table>' +
      '<div class="grand">' +
      escapeHtml(opts.grandLabel || 'الإجمالي النهائي: 0 IQD') +
      '</div>' +
      '<div class="thanks">' +
      CASHIER_RECEIPT_THANKS_HTML +
      '</div>'
    );
  }

  function launchCashierReceiptPrint(htmlBody, docTitle, onRelease) {
    var win = window.open('', '_blank');
    if (!win) return false;
    win.document.write(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' +
      escapeHtml(docTitle || 'وصل') +
      '</title><style>' +
      getCashierReceiptPrintStyles() +
      '</style></head><body>' +
      htmlBody +
      '</body></html>'
    );
    win.document.close();
    var release = typeof onRelease === 'function' ? onRelease : null;
    var printStarted = false;
    var releaseDone = false;

    function runRelease() {
      if (releaseDone) return;
      releaseDone = true;
      if (release) release();
    }

    function finishPrint() {
      if (printStarted) return;
      printStarted = true;
      try {
        win.focus();
        win.print();
      } catch (_) {}
      win.onafterprint = function () {
        try {
          win.close();
        } catch (_) {}
        runRelease();
      };
      setTimeout(function () {
        try {
          if (win && !win.closed) win.close();
        } catch (_) {}
        runRelease();
      }, 3500);
    }

    var logoImg = win.document.querySelector('.brand-logo');
    if (logoImg) {
      var logoFallbackTimer = setTimeout(function () {
        finishPrint();
      }, 1500);
      function clearLogoWait() {
        clearTimeout(logoFallbackTimer);
      }
      logoImg.onerror = function () {
        clearLogoWait();
        try {
          logoImg.remove();
        } catch (_) {}
        finishPrint();
      };
      logoImg.onload = function () {
        clearLogoWait();
        finishPrint();
      };
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        clearLogoWait();
        finishPrint();
      }
    } else {
      finishPrint();
    }
    return true;
  }

  function printSingleCashierOrder(order) {
    if (!order) return false;
    var cashierForPrint = resolveCashierNameForPrint(order);
    var total = (order.items || []).reduce(function (s, it) {
      return s + (Number(it.price) || 0) * (Number(it.quantity) || 0);
    }, 0);
    var orderType = inferOrderType(order);
    var orderTypeText = orderTypeLabelAr(orderType);
    var displayTable = orderType === 'DINE_IN' ? ('طاولة ' + String(order.tableId || '')) : orderTypeLabelAr(orderType);
    var meta = order && order.serviceMeta && typeof order.serviceMeta === 'object' ? order.serviceMeta : {};
    var metaRows = ['<strong>نوع الطلب:</strong> ' + escapeHtml(orderTypeText)];
    if (orderType === 'DINE_IN') {
      var dineCust = getDineInCustomerDisplay(order);
      metaRows.push(
        '<strong>الطاولة:</strong> ' +
          escapeHtml(String(order.tableId || '—')) +
          ' · <strong>رقم الطلب:</strong> ' +
          escapeHtml(getOrderIdDisplay(order))
      );
      if (dineCust.isShared) {
        metaRows.push(
          '<strong>' +
            escapeHtml(dineCust.chipLabel) +
            ':</strong> آخر إرسال ' +
            escapeHtml(dineCust.chipValue) +
            ' · ' +
            dineCust.chipSub
        );
      } else {
        metaRows.push('<strong>' + escapeHtml(dineCust.chipLabel) + ':</strong> ' + escapeHtml(dineCust.chipValue));
      }
    } else {
      metaRows.push('<strong>رقم الطلب:</strong> ' + escapeHtml(getOrderIdDisplay(order)));
    }
    metaRows.push(escapeHtml(formatBillSessionMetaLine('—', order.createdAt)));
    if (orderType === 'DELIVERY') {
      metaRows.push('<strong>الزبون:</strong> ' + escapeHtml(meta.customerName || '—'));
      metaRows.push('<strong>الهاتف:</strong> ' + escapeHtml(meta.phoneNumber || '—'));
      metaRows.push('<strong>العنوان:</strong> ' + escapeHtml(meta.address || '—'));
    }
    var showBy = orderItemsNeedPerSenderLabels(order);
    var rows = (order.items || [])
      .map(function (item) {
        return (
          '<tr>' +
          '<td>' + formatOrderItemNameHtml(item, showBy) + '</td>' +
          '<td class="num">' + (Number(item.quantity) || 0) + '</td>' +
          '<td class="num">' + formatPrice(Number(item.price) || 0) + '</td>' +
          '<td class="num total">' + formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 0)) + '</td>' +
          '</tr>'
        );
      })
      .join('');
    if (!rows) rows = '<tr><td colspan="4" class="empty">لا أصناف</td></tr>';
    return launchCashierReceiptPrint(
      buildCashierReceiptPrintBody({
        title: 'وصل الطلب — ' + displayTable,
        cashierName: cashierForPrint,
        metaRows: metaRows,
        tableBody: rows,
        grandLabel: 'الإجمالي النهائي: ' + formatPrice(total),
      }),
      'وصل الطلب'
    );
  }

  async function printSingleCashierOrderAsync(order) {
    await refreshCashierNameFromTill();
    return printSingleCashierOrder(order);
  }

  function renderOrderTypeModalCart() {
    if (!cashierOrderTypeCartList) return;
    if (!newOrderCart.length) {
      cashierOrderTypeCartList.innerHTML =
        '<li class="cashier-order-type-cart__empty">لا توجد منتجات في السلة.</li>';
    } else {
      cashierOrderTypeCartList.innerHTML = newOrderCart
        .map(function (line) {
          var qty = Number(line.quantity) || 0;
          var unit = Number(line.price) || 0;
          var lineTotal = unit * qty;
          return (
            '<li class="cashier-order-type-cart__row">' +
            '<span class="cashier-order-type-cart__name">' +
            escapeHtml(line.name || '') +
            '</span>' +
            '<span class="cashier-order-type-cart__qty">' +
            qty +
            '</span>' +
            '<span class="cashier-order-type-cart__price">' +
            formatPrice(lineTotal) +
            '</span>' +
            '</li>'
          );
        })
        .join('');
    }
    if (cashierOrderTypeCartTotal) {
      cashierOrderTypeCartTotal.textContent = formatPrice(calcNewOrderTotal());
    }
  }

  /** قيم افتراضية لتوصيل — يمكن للمستخدم مسحها أو تعديلها */
  function applyDeliveryFieldDefaults() {
    if (cashierDeliveryName) cashierDeliveryName.value = DELIVERY_DEFAULT_CUSTOMER_NAME;
    if (cashierDeliveryPhone) cashierDeliveryPhone.value = DELIVERY_DEFAULT_PHONE;
    if (cashierDeliveryAddress) cashierDeliveryAddress.value = '';
  }

  function renderOrderTypeModalUi() {
    if (!cashierOrderTypeGrid) return;
    cashierOrderTypeGrid.querySelectorAll('[data-order-type]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-order-type') === newOrderType);
    });
    var isDineIn = newOrderType === 'DINE_IN';
    var isTakeaway = newOrderType === 'TAKEAWAY';
    var isDelivery = newOrderType === 'DELIVERY';
    if (cashierSectionDineIn) cashierSectionDineIn.hidden = !isDineIn;
    if (cashierSectionTakeaway) cashierSectionTakeaway.hidden = !isTakeaway;
    if (cashierSectionDelivery) cashierSectionDelivery.hidden = !isDelivery;
    if (isDineIn) renderDineInTableGrid();
    if (isTakeaway) prefillTakeawayCashierNameIfEmpty();
    if (isDelivery) applyDeliveryFieldDefaults();
    renderOrderTypeModalCart();
  }

  async function openOrderTypeModal() {
    if (!cashierOrderTypeOverlay) return;
    try {
      await refreshCashierNameFromTill();
    } catch (_) {}
    newOrderType = 'DINE_IN';
    selectedDineInTableId = '';
    if (cashierDineInTable) cashierDineInTable.value = '';
    clearOrderTypeValidation();
    renderDineInTableGrid();
    if (cashierTakeawayCashierName) cashierTakeawayCashierName.value = '';
    prefillTakeawayCashierNameIfEmpty();
    applyDeliveryFieldDefaults();
    renderOrderTypeModalUi();
    cashierOrderTypeOverlay.classList.add('open');
    cashierOrderTypeOverlay.setAttribute('aria-hidden', 'false');
  }

  var categoryStripDragBound = false;

  function setupCategoryStripTouchScroll() {
    if (!cashierNewOrderCategories || categoryStripDragBound) return;
    categoryStripDragBound = true;

    var el = cashierNewOrderCategories;
    var dragging = false;
    var moved = false;
    var startX = 0;
    var lastX = 0;
    var pointerId = null;
    var DRAG_LOCK_PX = 8;

    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      lastX = e.clientX;
    });

    el.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      if (!moved && Math.abs(e.clientX - startX) < DRAG_LOCK_PX) return;
      if (!moved) {
        moved = true;
        el.classList.add('is-drag-scrolling');
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      var dx = e.clientX - lastX;
      el.scrollLeft -= dx;
      lastX = e.clientX;
    });

    function endDrag(e) {
      if (!dragging) return;
      if (e && e.pointerId != null && e.pointerId !== pointerId) return;
      dragging = false;
      el.classList.remove('is-drag-scrolling');
      try {
        if (pointerId != null) el.releasePointerCapture(pointerId);
      } catch (_) {}
      pointerId = null;
      if (moved) {
        el.dataset.dragScrolled = '1';
        window.setTimeout(function () {
          try {
            delete el.dataset.dragScrolled;
          } catch (_) {}
        }, 150);
      }
    }

    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('click', function (e) {
      var chip = e.target.closest('.cashier-cat-chip');
      if (!chip) return;
      if (el.dataset.dragScrolled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      newOrderCategory = chip.getAttribute('data-cat') || '';
      renderNewOrderUi();
    });
  }

  function renderNewOrderUi() {
    if (!cashierNewOrderBody) return;

    var cats = groupedCategories(cashierMenuItems, cashierCategories);
    if (cashierNewOrderCategories) {
      setupCategoryStripTouchScroll();
      var chips = ['<button type="button" class="cashier-cat-chip' + (newOrderCategory ? '' : ' active') + '" data-cat="">الكل</button>']
        .concat(
          cats.map(function (c) {
            return '<button type="button" class="cashier-cat-chip' + (newOrderCategory === c ? ' active' : '') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>';
          })
        )
        .join('');
      cashierNewOrderCategories.innerHTML = chips;
    }

    var products = visibleProductsForNewOrder();
    if (cashierNewOrderProducts) {
      cashierNewOrderProducts.innerHTML = products.length
        ? products
            .map(function (it) {
              return (
                '<button type="button" class="cashier-new-order-product" data-menu-id="' +
                escapeHtml(it.id) +
                '">' +
                '<div class="cashier-new-order-product__name">' +
                escapeHtml(it.name || '') +
                '</div>' +
                '<div class="cashier-new-order-product__price">' +
                formatPrice(it.price || 0) +
                '</div>' +
                '</button>'
              );
            })
            .join('')
        : '<div class="empty-state">لا توجد منتجات مطابقة.</div>';
      cashierNewOrderProducts.querySelectorAll('.cashier-new-order-product').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var menuId = btn.getAttribute('data-menu-id');
          var item = cashierMenuItems.find(function (x) {
            return String(x.id) === String(menuId);
          });
          if (!item) return;
          var line = findCartLine(item.id);
          if (line) line.quantity += 1;
          else newOrderCart.push({ menuId: item.id, name: item.name, price: item.price, quantity: 1 });
          renderNewOrderUi();
        });
      });
    }

    if (cashierNewOrderCart) {
      cashierNewOrderCart.innerHTML = newOrderCart.length
        ? newOrderCart
            .map(function (line) {
              return (
                '<div class="cashier-cart-row" data-menu-id="' +
                escapeHtml(line.menuId) +
                '">' +
                '<div><div class="cashier-cart-row__name">' +
                escapeHtml(line.name) +
                '</div><div class="cashier-cart-row__meta">' +
                formatPrice(line.price || 0) +
                '</div></div>' +
                '<div class="cashier-cart-row__actions">' +
                '<div class="cashier-cart-row__qty" role="group" aria-label="الكمية">' +
                '<button type="button" class="cashier-cart-row__btn" data-act="inc" aria-label="زيادة">+</button>' +
                '<span class="cashier-cart-row__qty-val">' +
                (line.quantity || 0) +
                '</span>' +
                '<button type="button" class="cashier-cart-row__btn" data-act="dec" aria-label="نقص">-</button>' +
                '</div>' +
                '<button type="button" class="cashier-cart-row__btn cashier-cart-row__btn--remove" data-act="rm" aria-label="حذف المنتج">×</button>' +
                '</div></div>'
              );
            })
            .join('')
        : '<div class="empty-state">السلة فارغة.</div>';
      cashierNewOrderCart.querySelectorAll('.cashier-cart-row__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('.cashier-cart-row');
          if (!row) return;
          var menuId = row.getAttribute('data-menu-id');
          var line = findCartLine(menuId);
          if (!line) return;
          var act = btn.getAttribute('data-act');
          if (act === 'inc') line.quantity += 1;
          else if (act === 'dec') line.quantity = Math.max(1, (line.quantity || 1) - 1);
          else newOrderCart = newOrderCart.filter(function (x) { return String(x.menuId) !== String(menuId); });
          renderNewOrderUi();
        });
      });
    }
    if (cashierNewOrderTotal) cashierNewOrderTotal.textContent = formatPrice(calcNewOrderTotal());
  }

  async function openNewOrderModal() {
    if (!panelNewOrder) return;
    newOrderType = 'DINE_IN';
    newOrderCategory = '';
    newOrderSearch = '';
    newOrderCart = [];
    if (cashierDeliveryName) cashierDeliveryName.value = '';
    if (cashierDeliveryPhone) cashierDeliveryPhone.value = '';
    if (cashierDeliveryAddress) cashierDeliveryAddress.value = '';
    if (cashierNewOrderSearch) cashierNewOrderSearch.value = '';
    try {
      if (api && api.categories && typeof api.categories.list === 'function') {
        cashierCategories = await api.categories.list();
      }
      if (api && api.menu && typeof api.menu.list === 'function') {
        cashierMenuItems = await api.menu.list();
      }
    } catch (_) {}
    renderNewOrderUi();
    setActiveSidebarItem('new-order');
  }

  function closeNewOrderModal() {
    setActiveSidebarItem('tables');
  }

  async function submitNewOrder() {
    if (!newOrderCart.length) {
      await cashierAlert('أضف منتجات إلى السلة أولاً.', { type: 'warning', title: 'تنبيه' });
      return;
    }
    await openOrderTypeModal();
  }

  async function confirmOrderTypeSubmit(shouldPrint) {
    if (!newOrderCart.length) {
      closeOrderTypeModal();
      return;
    }
    var payloadItems = newOrderCart.map(function (line) {
      return { menuId: line.menuId, quantity: line.quantity, note: '' };
    });
    var orderType = normalizeOrderType(newOrderType);
    var tableIdForSend = null;
    var opts = { orderType: orderType };
    if (orderType === 'DINE_IN') {
      tableIdForSend = String(
        (cashierDineInTable && cashierDineInTable.value) || selectedDineInTableId || ''
      ).trim();
      if (!tableIdForSend) {
        showOrderTypeValidation('اختر رقم الطاولة من الشبكة.');
        return;
      }
      var dineCashierName = getPreferredCashierName();
      if (dineCashierName) {
        opts.serviceMeta = { cashierName: dineCashierName };
      }
    } else if (orderType === 'TAKEAWAY') {
      tableIdForSend = 'TAKEAWAY';
      var cashierName = String(cashierTakeawayCashierName ? cashierTakeawayCashierName.value : '').trim();
      if (!cashierName) {
        showOrderTypeValidation('يرجى إدخال اسم الكاشير لطلب السفري.');
        return;
      }
      clearOrderTypeValidation();
      opts.serviceMeta = { cashierName: cashierName };
    } else if (orderType === 'DELIVERY') {
      tableIdForSend = 'DELIVERY';
      var n = String(cashierDeliveryName ? cashierDeliveryName.value : '').trim();
      var p = String(cashierDeliveryPhone ? cashierDeliveryPhone.value : '').trim();
      var a = String(cashierDeliveryAddress ? cashierDeliveryAddress.value : '').trim();
      if (!n || !p || !a) {
        showOrderTypeValidation('بيانات التوصيل مطلوبة كاملة: الاسم، الهاتف، العنوان.');
        return;
      }
      clearOrderTypeValidation();
      opts.serviceMeta = { customerName: n, phoneNumber: p, address: a };
    }
    if (btnCashierOrderTypeSendOnly) btnCashierOrderTypeSendOnly.disabled = true;
    if (btnCashierOrderTypePrintSend) btnCashierOrderTypePrintSend.disabled = true;

    var cartSnapshot = newOrderCart.slice();
    var searchSnapshot = newOrderSearch;

    closeAllCashierOrderModals();
    newOrderCart = [];
    newOrderSearch = '';
    if (cashierNewOrderSearch) cashierNewOrderSearch.value = '';
    renderNewOrderUi();
    selectedTableId = null;
    cashierView.classList.remove('view-bill-active');
    tablesGrid.querySelectorAll('.table-card').forEach(function (el) {
      el.classList.remove('selected');
    });
    if (ordersContent) ordersContent.innerHTML = '';
    if (window.showToast) window.showToast('تم إرسال الطلب إلى المطبخ وإضافته لطلبات اليوم.');

    try {
      var created = await api.orders.create(tableIdForSend, payloadItems, opts);
      var printOrder = buildPrintOrderFromSubmit(created, orderType, opts.serviceMeta);
      if (shouldPrint) await printSingleCashierOrderAsync(printOrder);
    } catch (err) {
      newOrderCart = cartSnapshot;
      newOrderSearch = searchSnapshot;
      if (cashierNewOrderSearch) cashierNewOrderSearch.value = searchSnapshot;
      renderNewOrderUi();
      alert(err && err.json && err.json.error ? err.json.error : err.message || 'تعذّر إرسال الطلب.');
    } finally {
      if (btnCashierOrderTypeSendOnly) btnCashierOrderTypeSendOnly.disabled = false;
      if (btnCashierOrderTypePrintSend) btnCashierOrderTypePrintSend.disabled = false;
    }
  }

  function printAllOpenOrdersForTable(orders, tableId, paymentMethod, cashierNameOverride, printOpts) {
    if (isGlobalPrintInProgress) return false;
    var list = Array.isArray(orders) ? orders.slice() : [];
    if (!list.length) return false;
    printOpts = printOpts || {};
    isGlobalPrintInProgress = true;
    var sorted = sortOrdersByCreatedAt(list);
    var consolidated = consolidateOrderItems(sorted);
    var totalAll = sorted.reduce(function (s, o) { return s + sumOrderItems(o); }, 0);
    var methodLabel;
    if (printOpts.invoiceOnly) {
      methodLabel = '——';
    } else {
      methodLabel = paymentMethod === 'card' ? 'بطاقة' : 'كاش';
    }
    var firstAt = sorted[0] && sorted[0].createdAt;
    var sessionMeta = formatBillSessionMetaLine(formatDurationSinceFirst(firstAt), firstAt);
    var rows = consolidated
      .map(function (item) {
        return (
          '<tr>' +
          '<td>' + escapeHtml(item.name || '') + '</td>' +
          '<td class="num">' + (Number(item.quantity) || 0) + '</td>' +
          '<td class="num">' + formatPrice(Number(item.unitPrice) || 0) + '</td>' +
          '<td class="num total">' + formatPrice(Number(item.totalPrice) || 0) + '</td>' +
          '</tr>'
        );
      })
      .join('');
    if (!rows) rows = '<tr><td colspan="4" class="empty">لا أصناف</td></tr>';

    var releasePrintLock = function () {
      if (!isGlobalPrintInProgress) return;
      isGlobalPrintInProgress = false;
    };
    var printed = launchCashierReceiptPrint(
      buildCashierReceiptPrintBody({
        title: 'وصل جميع الطلبات — ' + tableDisplayLabel(tableId),
        cashierName:
          cashierNameOverride && String(cashierNameOverride).trim()
            ? String(cashierNameOverride).trim()
            : getPreferredCashierName() || '—',
        metaRows: [
          escapeHtml(sessionMeta),
          '<strong>نوع الطلب:</strong> داخل الصالة · <strong>طريقة الدفع:</strong> ' + escapeHtml(methodLabel),
          '<strong>صاحب الطلب:</strong> ' + escapeHtml(collectTableOrderOwners(sorted)),
        ],
        tableBody: rows,
        grandLabel: 'الإجمالي النهائي: ' + formatPrice(totalAll),
      }),
      'طباعة جميع الطلبات',
      releasePrintLock
    );
    if (!printed) {
      isGlobalPrintInProgress = false;
      return false;
    }
    return true;
  }

  async function loadTableOrders(tableId) {
    try {
      const raw = await api.orders.byTable(tableId);
      const orders = (raw || []).filter(function (o) {
        return o && o.closed !== true;
      });
      if (!orders.length) {
        ordersContent.innerHTML = '<p class="empty-state">لا توجد طلبات مفتوحة لهذه الوجهة حالياً.</p>';
        return;
      }

      var sorted = sortOrdersByCreatedAt(orders);
      var firstAt = sorted[0] && sorted[0].createdAt;
      var durationStr = formatDurationSinceFirst(firstAt);
      var totalAll = 0;

      var orderCards = sorted
        .map(function (order, idx) {
          var ref = shortOrderRef(order, idx);
          var ordTitle = orderSectionLabel(idx);
          var orderTotal = sumOrderItems(order);
          totalAll += orderTotal;
          var timePlaced = order.createdAt ? formatBillDateTime(order.createdAt) : '—';
          return (
            '<article class="cashier-order-card" data-order-id="' +
            escapeHtml(order.id) +
            '" data-order-ref="' +
            escapeHtml(ref) +
            '" data-order-time="' +
            escapeHtml(timePlaced) +
            '">' +
            '<span class="cashier-order-card__title">' +
            escapeHtml(ordTitle) +
            '</span>' +
            '<div class="cashier-order-card__total">' +
            '<span class="cashier-order-card__total-label">المجموع</span>' +
            '<span class="cashier-order-card__total-value">' +
            formatPrice(orderTotal) +
            '</span>' +
            '</div>' +
            '<button type="button" class="btn-cashier-view-receipt" data-order-idx="' +
            idx +
            '">عرض الوصل</button>' +
            '</article>'
          );
        })
        .join('');

      ordersContent.innerHTML =
        '<div class="bill-receipts-row">' +
        '<div class="bill-card bill-consolidated bill-consolidated--modal-cards" data-cashier-order-view="modal-cards">' +
        '<header class="bill-card-header bill-receipt-header--compact">' +
        '<div class="bill-header-row1"><span class="bill-table-num">' +
        escapeHtml(tableDisplayLabel(tableId)) +
        '</span></div>' +
        '<div class="bill-header-row2 bill-header-meta-line">' +
        '<span class="bill-meta-line" dir="rtl">' +
        escapeHtml(formatBillSessionMetaLine(durationStr, firstAt)) +
        '</span>' +
        '</div>' +
        '</header>' +
        '<div class="bill-orders-list bill-orders-list--flat">' +
        orderCards +
        '</div>' +
        '<div class="bill-consolidated-footer">' +
        '<div class="bill-grand-total" role="status"><span class="bill-grand-label">الإجمالي النهائي</span> ' +
        '<span class="bill-grand-value">' +
        formatPrice(totalAll) +
        '</span></div>' +
        '<div class="bill-card-payment">' +
        '<p class="payment-title">طريقة الدفع</p>' +
        '<div class="payment-buttons">' +
        '<button type="button" class="btn-payment btn-payment-cash" data-method="cash" aria-pressed="false">الدفع كاش</button>' +
        '<button type="button" class="btn-payment btn-payment-card" data-method="card" aria-pressed="false">الدفع بالبطاقة (MasterCard)</button>' +
        '</div>' +
        '</div>' +
        '<div class="bill-card-actions">' +
        '<p class="bill-settle-hint" id="billSettleHint">اختر طريقة الدفع لإتمام الحساب</p>' +
        '<button type="button" class="btn btn-secondary btn-print-invoice-only" id="btnPrintInvoiceOnly">🖨 طباعة فاتورة</button>' +
        '<div class="bill-actions-row bill-settle-actions" id="billSettleActions" hidden>' +
        '<button type="button" class="btn btn-primary btn-close-bill btn-close-print-settle">🖨 طباعة وإغلاق الحساب</button>' +
        '<button type="button" class="btn btn-secondary btn-close-bill btn-close-settle-only">إغلاق الحساب بدون طباعة</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      var root = ordersContent.querySelector('.bill-consolidated');
      if (!root) return;

      root._cashierTableOpenOrders = sorted;
      root._cashierTableId = tableId;

      var btnCash = root.querySelector('.btn-payment-cash');
      var btnCard = root.querySelector('.btn-payment-card');
      var settleActions = root.querySelector('#billSettleActions');
      var settleHint = root.querySelector('#billSettleHint');
      var btnClosePrint = root.querySelector('.btn-close-print-settle');
      var btnCloseOnly = root.querySelector('.btn-close-settle-only');
      var btnPrintInvoice = root.querySelector('.btn-print-invoice-only');

      root.querySelectorAll('.btn-cashier-view-receipt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ix = parseInt(btn.getAttribute('data-order-idx'), 10);
          if (isNaN(ix) || !root._cashierTableOpenOrders || !root._cashierTableOpenOrders[ix]) return;
          openCashierTableOrderDetailModal(root._cashierTableOpenOrders[ix], ix, root._cashierTableId);
        });
      });

      function setSettleUiLocked(locked) {
        if (btnCash) btnCash.disabled = locked;
        if (btnCard) btnCard.disabled = locked;
        if (btnClosePrint) btnClosePrint.disabled = locked;
        if (btnCloseOnly) btnCloseOnly.disabled = locked;
        if (btnPrintInvoice) btnPrintInvoice.disabled = locked;
      }

      function setPayment(method) {
        root.dataset.paymentMethod = method;
        if (btnCash) {
          btnCash.classList.toggle('selected', method === 'cash');
          btnCash.setAttribute('aria-pressed', method === 'cash');
        }
        if (btnCard) {
          btnCard.classList.toggle('selected', method === 'card');
          btnCard.setAttribute('aria-pressed', method === 'card');
        }
        if (settleActions) settleActions.hidden = false;
        if (settleHint) settleHint.hidden = true;
      }

      if (btnCash) btnCash.addEventListener('click', function () { setPayment('cash'); });
      if (btnCard) btnCard.addEventListener('click', function () { setPayment('card'); });

      async function settleTableAccount(withPrint, triggerBtn) {
        if (root.dataset.closingAll === '1') return;
        var payMethod = root.dataset.paymentMethod;
        if (!payMethod) {
          if (window.showToast) window.showToast('اختر طريقة الدفع أولاً');
          return;
        }
        root.dataset.closingAll = '1';
        setSettleUiLocked(true);
        var prevLabel = triggerBtn ? triggerBtn.textContent : '';
        if (triggerBtn) {
          triggerBtn.textContent = withPrint ? 'جاري الطباعة وإغلاق الحساب...' : 'جاري إغلاق الحساب...';
          triggerBtn.setAttribute('aria-busy', 'true');
        }
        try {
          await refreshCashierNameFromTill();
          var cashierForClose = getPreferredCashierName();
          if (withPrint) {
            var printed = printAllOpenOrdersForTable(sorted, tableId, payMethod, cashierForClose);
            if (!printed) {
              alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
              return;
            }
          }
          await closeAllOpenOrdersOnTable(
            sorted.map(function (o) { return o.id; }),
            payMethod
          );
          try {
            await api.orders.todaySessions.create({
              tableId: tableId,
              orderIds: sorted.map(function (o) {
                return o.id;
              }),
              paymentMethod: payMethod,
            });
          } catch (histErr) {
            var histMsg =
              histErr && histErr.json && histErr.json.error
                ? histErr.json.error
                : histErr && histErr.message
                  ? histErr.message
                  : '';
            if (window.showToast) {
              window.showToast(histMsg || 'تم الإغلاق لكن تعذّر حفظ سجل طلبات اليوم');
            }
          }
          if (window.showToast) {
            window.showToast(withPrint ? 'تم طباعة الوصل وإغلاق الحساب' : 'تم إغلاق الحساب بنجاح');
          }
          goBackToTables();
          if (panelToday && panelToday.classList.contains('active')) await loadTodayOrders();
        } catch (err) {
          var msg = err && err.json && err.json.error ? err.json.error : err && err.message ? err.message : '';
          alert(msg || 'فشل إغلاق الحساب');
        } finally {
          root.dataset.closingAll = '0';
          if (triggerBtn) {
            triggerBtn.removeAttribute('aria-busy');
            triggerBtn.textContent = prevLabel;
          }
          setSettleUiLocked(false);
        }
      }

      if (btnPrintInvoice) {
        btnPrintInvoice.addEventListener('click', async function () {
          if (root.dataset.closingAll === '1' || isGlobalPrintInProgress) return;
          var prevLabel = btnPrintInvoice.textContent;
          btnPrintInvoice.disabled = true;
          btnPrintInvoice.setAttribute('aria-busy', 'true');
          btnPrintInvoice.textContent = 'جاري الطباعة...';
          try {
            await refreshCashierNameFromTill();
            var printed = printAllOpenOrdersForTable(sorted, tableId, null, getPreferredCashierName(), {
              invoiceOnly: true,
            });
            if (!printed) {
              alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
              return;
            }
            if (window.showToast) window.showToast('تم إرسال الفاتورة للطباعة');
          } finally {
            btnPrintInvoice.removeAttribute('aria-busy');
            btnPrintInvoice.textContent = prevLabel;
            if (root.dataset.closingAll !== '1') btnPrintInvoice.disabled = false;
          }
        });
      }

      if (btnClosePrint) {
        btnClosePrint.addEventListener('click', function () {
          settleTableAccount(true, btnClosePrint);
        });
      }
      if (btnCloseOnly) {
        btnCloseOnly.addEventListener('click', function () {
          settleTableAccount(false, btnCloseOnly);
        });
      }
    } catch (err) {
      ordersContent.innerHTML =
        '<p class="alert alert-error">' +
        escapeHtml(err.json && err.json.error ? err.json.error : err.message || 'فشل تحميل الطلبات') +
        '</p>';
    }
  }

  async function closeAllOpenOrdersOnTable(orderIds, paymentMethod) {
    paymentMethod = paymentMethod === 'card' ? 'card' : 'cash';
    var pending = (orderIds || []).filter(function (id) { return !!id; });
    if (!pending.length) return;
    await Promise.all(
      pending.map(function (id) {
        return api.orders.close(id, { paymentMethod: paymentMethod });
      })
    );
  }

  var btnBillBackToTables = document.getElementById('btnBillBackToTables');
  if (btnBillBackToTables) btnBillBackToTables.addEventListener('click', goBackToTables);

  // ——— الشريط الجانبي: إخفاء باللمس/النقر على المحتوى ———
  function hideCashierSidebar() {
    if (!cashierBody) return;
    cashierBody.classList.add('cashier-sidebar-hidden');
    if (btnCashierSidebarOpen) btnCashierSidebarOpen.hidden = false;
  }

  function showCashierSidebar() {
    if (!cashierBody) return;
    cashierBody.classList.remove('cashier-sidebar-hidden');
    if (btnCashierSidebarOpen) btnCashierSidebarOpen.hidden = true;
  }

  if (btnCashierSidebarOpen) {
    btnCashierSidebarOpen.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showCashierSidebar();
    });
  }

  if (cashierSidebarBackdrop) {
    cashierSidebarBackdrop.addEventListener('click', function () {
      hideCashierSidebar();
    });
  }

  if (cashierView) {
    cashierView.addEventListener('click', function () {
      if (!cashierBody || cashierBody.classList.contains('cashier-sidebar-hidden')) return;
      hideCashierSidebar();
    });
  }

  if (cashierSidebar) {
    cashierSidebar.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  hideCashierSidebar();

  // ——— الشريط الجانبي: تبديل اللوحات ———
  function setActiveSidebarItem(panelKey) {
    if (cashierView && cashierView.classList.contains('view-bill-active')) {
      goBackToTables();
    }
    document.querySelectorAll('.cashier-sidebar-item').forEach((el) => el.classList.toggle('active', el.dataset.panel === panelKey));
    if (panelTables) panelTables.classList.toggle('active', panelKey === 'tables');
    if (panelNewOrder) panelNewOrder.classList.toggle('active', panelKey === 'new-order');
    if (panelToday) panelToday.classList.toggle('active', panelKey === 'today');
    if (panelCashbox) panelCashbox.classList.toggle('active', panelKey === 'cashbox');
    if (panelKey === 'new-order') renderNewOrderUi();
    if (panelKey === 'today') loadTodayOrders();
    if (panelKey === 'cashbox') loadCashbox();
  }

  document.querySelectorAll('.cashier-sidebar-item').forEach((btn) => {
    btn.addEventListener('click', function () {
      setActiveSidebarItem(this.dataset.panel);
      hideCashierSidebar();
    });
  });

  if (cashierOrderTypeGrid) {
    cashierOrderTypeGrid.querySelectorAll('[data-order-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        newOrderType = btn.getAttribute('data-order-type') || 'DINE_IN';
        clearOrderTypeValidation();
        renderOrderTypeModalUi();
      });
    });
  }
  if (cashierNewOrderSearch) {
    cashierNewOrderSearch.addEventListener('input', function () {
      newOrderSearch = cashierNewOrderSearch.value || '';
      renderNewOrderUi();
    });
  }
  if (btnCashierNewOrderClose) btnCashierNewOrderClose.addEventListener('click', closeNewOrderModal);
  if (btnCashierNewOrderCancel) btnCashierNewOrderCancel.addEventListener('click', closeNewOrderModal);
  if (btnCashierNewOrderSubmit) btnCashierNewOrderSubmit.addEventListener('click', submitNewOrder);
  if (btnCashierNewOrderTypeClose) btnCashierNewOrderTypeClose.addEventListener('click', closeOrderTypeModal);
  if (btnCashierOrderTypeSendOnly) btnCashierOrderTypeSendOnly.addEventListener('click', function () { confirmOrderTypeSubmit(false); });
  if (btnCashierOrderTypePrintSend) btnCashierOrderTypePrintSend.addEventListener('click', function () { confirmOrderTypeSubmit(true); });
  if (cashierOrderTypeOverlay) {
    cashierOrderTypeOverlay.addEventListener('click', function (e) {
      if (e.target === cashierOrderTypeOverlay) closeOrderTypeModal();
    });
  }

  // ——— طلبات اليوم ———
  function formatOrderDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
      (d.getHours() % 12 || 12) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + (d.getHours() < 12 ? ' ص' : ' م');
  }
  function formatOrderTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return (d.getHours() % 12 || 12) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + (d.getHours() < 12 ? ' ص' : ' م');
  }
  function formatOrderDateOnly(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
  /** وقت فوق تاريخ — للعرض في الجدول بشكل أنيق */
  function formatOrderDateTimeBlock(iso) {
    if (!iso) return '—';
    var time = formatOrderTime(iso);
    var date = formatOrderDateOnly(iso);
    return '<span class="date-time-cell"><span class="dt-time">' + escapeHtml(time) + '</span><span class="dt-date">' + escapeHtml(date) + '</span></span>';
  }

  function todayPaymentMethodLabel(method) {
    return (method || 'cash').toLowerCase() === 'card' ? 'ماستر كارد' : 'كاش';
  }

  function todayPaymentMethodClass(method) {
    return (method || 'cash').toLowerCase() === 'card' ? 'payment-card' : 'payment-cash';
  }

  /** تجميع سجلات الجلسات حسب الطاولة / نوع الطلب */
  function groupTodaySessionsByTable(sessions) {
    var byKey = {};
    (sessions || []).forEach(function (sess) {
      var orderType = normalizeOrderType(sess.orderType);
      var groupKey =
        orderType === 'DINE_IN'
          ? 'T:' + String(sess.tableId != null ? sess.tableId : '')
          : 'TYPE:' + orderType;
      if (!byKey[groupKey]) {
        byKey[groupKey] = {
          tableId: String(sess.tableId != null ? sess.tableId : ''),
          orderType: orderType,
          groupKey: groupKey,
          sessions: [],
        };
      }
      byKey[groupKey].sessions.push(sess);
    });
    return Object.keys(byKey).map(function (key) {
      var entry = byKey[key];
      var list = entry.sessions;
      var total = list.reduce(function (s, x) {
        return s + (Number(x.totalAmount) || 0);
      }, 0);
      var orderCount = list.reduce(function (s, x) {
        return s + (Number(x.orderCount) || 0);
      }, 0);
      var lastAt = list.reduce(function (max, x) {
        var t = x.paymentAt;
        return t && (!max || new Date(t) > new Date(max)) ? t : max;
      }, null);
      return {
        tableId: entry.tableId,
        orderType: entry.orderType,
        groupKey: entry.groupKey,
        sessions: list,
        total: total,
        lastPaymentAt: lastAt,
        sessionCount: list.length,
        orderCount: orderCount,
      };
    });
  }

  function renderTodayOrders() {
    if (!todayGroupedList) return;
    if (!todaySessionsList.length) {
      todayGroupedList.innerHTML = '';
      if (todaySummaryRevenue) todaySummaryRevenue.textContent = '0 IQD';
      if (todaySummaryOrders) todaySummaryOrders.textContent = '0';
      if (todaySummaryDineIn) todaySummaryDineIn.textContent = '0';
      if (todaySummaryTakeaway) todaySummaryTakeaway.textContent = '0';
      if (todaySummaryDelivery) todaySummaryDelivery.textContent = '0';
      if (todayOrdersEmpty) {
        todayOrdersEmpty.textContent = 'لا توجد جلسات مدفوعة في طلبات اليوم بعد.';
        todayOrdersEmpty.style.display = 'block';
      }
      return;
    }
    if (todayOrdersEmpty) todayOrdersEmpty.style.display = 'none';
    var grouped = groupTodaySessionsByTable(todaySessionsList);
    var totalRevenue = todaySessionsList.reduce(function (s, x) {
      return s + (Number(x.totalAmount) || 0);
    }, 0);
    var totalOrderLines = todaySessionsList.reduce(function (s, x) {
      return s + (Number(x.orderCount) || 0);
    }, 0);
    if (todaySummaryRevenue) {
      todaySummaryRevenue.textContent = window.formatCurrency
        ? window.formatCurrency(totalRevenue)
        : totalRevenue + ' IQD';
    }
    if (todaySummaryOrders) todaySummaryOrders.textContent = String(totalOrderLines);
    var dineInOrders = 0;
    var takeawayOrders = 0;
    var deliveryOrders = 0;
    todaySessionsList.forEach(function (sess) {
      var n = Number(sess.orderCount) || 0;
      var t = normalizeOrderType(sess.orderType);
      if (t === 'TAKEAWAY') takeawayOrders += n;
      else if (t === 'DELIVERY') deliveryOrders += n;
      else dineInOrders += n;
    });
    if (todaySummaryDineIn) todaySummaryDineIn.textContent = String(dineInOrders);
    if (todaySummaryTakeaway) todaySummaryTakeaway.textContent = String(takeawayOrders);
    if (todaySummaryDelivery) todaySummaryDelivery.textContent = String(deliveryOrders);

    todayGroupedList.innerHTML = grouped
      .map(function (g, idx) {
        var cardId = 'today-card-' + idx;
        var lastTimeText = g.lastPaymentAt ? formatOrderDate(g.lastPaymentAt) : '—';
        var isDineIn = normalizeOrderType(g.orderType) === 'DINE_IN';
        var headTitle = isDineIn
          ? 'طاولة ' + escapeHtml(g.tableId)
          : 'طلبات ' + escapeHtml(orderTypeLabelAr(g.orderType));
        var detailRows = g.sessions
          .map(function (sess) {
            var method = (sess.paymentMethod || 'cash').toLowerCase();
            var methodLabel = todayPaymentMethodLabel(method);
            var methodClass = todayPaymentMethodClass(method);
            return (
              '<tr data-session-id="' +
              escapeHtml(sess.id) +
              '">' +
              '<td dir="ltr">' +
              escapeHtml(sess.displayId || '—') +
              '</td>' +
              '<td class="col-num">' +
              (Number(sess.orderCount) || 0) +
              '</td>' +
              '<td>' +
              escapeHtml(formatOrderTime(sess.firstOrderAt)) +
              '</td>' +
              '<td>' +
              escapeHtml(formatOrderTime(sess.paymentAt)) +
              '</td>' +
              '<td class="col-amount">' +
              formatPrice(Number(sess.totalAmount) || 0) +
              '</td>' +
              '<td><span class="payment-method-badge ' +
              methodClass +
              '">' +
              escapeHtml(methodLabel) +
              '</span></td>' +
              '<td class="today-payment-cell">' +
              '<button type="button" class="btn btn-secondary btn-today-session-receipt" data-session-id="' +
              escapeHtml(sess.id) +
              '">عرض الوصل</button>' +
              '</td></tr>'
            );
          })
          .join('');
        return (
          '<div class="today-table-card" id="' +
          cardId +
          '">' +
          '<div class="today-table-card-head" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="today-table-card-head__text">' +
          '<span class="table-num">' +
          headTitle +
          '</span>' +
          '<span class="table-meta-sep" aria-hidden="true">—</span>' +
          '<span class="table-meta">' +
          '<span class="table-meta__part">' +
          g.sessionCount +
          ' جلسة،</span>' +
          '<span class="table-meta__part">' +
          g.orderCount +
          ' طلب،</span>' +
          '<span class="table-meta__part table-meta__part--pay">آخر دفع: ' +
          escapeHtml(lastTimeText) +
          '</span></span></div>' +
          '<div class="today-table-card-head__aside">' +
          '<span class="table-total">' +
          formatPrice(g.total) +
          '</span>' +
          '<span class="table-toggle" aria-hidden="true">▼</span>' +
          '</div></div>' +
          '<div class="today-table-card-detail">' +
          '<table class="today-detail-table"><thead><tr>' +
          '<th>رقم الطلب</th><th>عدد الطلبات</th><th>وقت أول طلب</th><th>وقت الدفع</th><th>المبلغ</th><th>طريقة الدفع</th><th>الوصل</th>' +
          '</tr></thead><tbody>' +
          detailRows +
          '</tbody></table></div></div>'
        );
      })
      .join('');

    todayGroupedList.querySelectorAll('.today-table-card-head').forEach(function (head) {
      head.addEventListener('click', function () {
        var card = head.closest('.today-table-card');
        if (card) card.classList.toggle('expanded');
        head.setAttribute('aria-expanded', card && card.classList.contains('expanded'));
      });
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          head.click();
        }
      });
    });
    todayGroupedList.querySelectorAll('.btn-today-session-receipt').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var sid = btn.getAttribute('data-session-id');
        var sess = todaySessionsList.find(function (s) {
          return String(s.id) === String(sid);
        });
        if (sess) openTodaySessionReceiptModal(sess);
      });
    });
  }

  async function loadTodayOrders() {
    try {
      todaySessionsList = await api.orders.todaySessions.list();
      if (!Array.isArray(todaySessionsList)) todaySessionsList = [];
      renderTodayOrders();
    } catch (err) {
      todaySessionsList = [];
      if (todayGroupedList) todayGroupedList.innerHTML = '';
      if (todaySummaryRevenue) todaySummaryRevenue.textContent = '0 IQD';
      if (todaySummaryOrders) todaySummaryOrders.textContent = '0';
      if (todaySummaryDineIn) todaySummaryDineIn.textContent = '0';
      if (todaySummaryTakeaway) todaySummaryTakeaway.textContent = '0';
      if (todaySummaryDelivery) todaySummaryDelivery.textContent = '0';
      if (todayOrdersEmpty) {
        var msg =
          err && err.json && err.json.error
            ? err.json.error
            : err && err.message
              ? err.message
              : 'فشل تحميل سجل طلبات اليوم.';
        if (err && err.status === 404) {
          msg =
            'تعذّر الاتصال بسجل طلبات اليوم. أوقف السيرفر (Ctrl+C في نافذة npm start) ثم شغّله من جديد: cd backend ثم npm start';
        }
        todayOrdersEmpty.textContent = msg;
        todayOrdersEmpty.style.display = 'block';
      }
    }
  }

  function buildTableOrderDetailSubtitleHtml(tableId, orderRef) {
    var ref = orderRef != null && orderRef !== '' ? String(orderRef) : '—';
    return (
      '<span class="cashier-modal-sub__row">' +
      '<span>' +
      escapeHtml(tableDisplayLabel(tableId)) +
      '</span>' +
      '<span class="cashier-modal-sub__dot" aria-hidden="true">·</span>' +
      '<span class="cashier-modal-sub__ref" dir="ltr">' +
      escapeHtml(ref) +
      '</span></span>'
    );
  }

  function openTodaySessionOrderDetail(orderSnap, orderLabel, tableIdHint) {
    if (!cashierTableOrderDetailOverlay || !orderSnap) return;
    currentTableOrderDetail = null;
    if (cashierTableOrderDetailTitle) cashierTableOrderDetailTitle.textContent = orderLabel;
    var tableId =
      tableIdHint != null && tableIdHint !== ''
        ? tableIdHint
        : orderSnap.tableId != null
          ? orderSnap.tableId
          : currentTodaySessionReceipt && currentTodaySessionReceipt.tableId != null
            ? currentTodaySessionReceipt.tableId
            : '';
    var orderRef =
      orderSnap.displayOrderId != null
        ? orderSnap.displayOrderId
        : orderSnap.orderId != null
          ? orderSnap.orderId
          : '';
    if (cashierTableOrderDetailSubtitle) {
      cashierTableOrderDetailSubtitle.innerHTML =
        tableId !== '' || orderRef !== ''
          ? buildTableOrderDetailSubtitleHtml(tableId, orderRef)
          : '';
    }
    if (cashierTableOrderDetailMeta) {
      var dateParts = orderSnap.createdAt
        ? formatBillDateParts(orderSnap.createdAt)
        : { date: '—', time: '—' };
      cashierTableOrderDetailMeta.innerHTML =
        '<div class="cashier-receipt-info">' +
        '<div class="cashier-receipt-info__chip">' +
        '<span class="cashier-receipt-info__label">الوقت</span>' +
        '<span class="cashier-receipt-info__value">' +
        escapeHtml(dateParts.time) +
        '</span></div>' +
        '<div class="cashier-receipt-info__chip">' +
        '<span class="cashier-receipt-info__label">التاريخ</span>' +
        '<span class="cashier-receipt-info__value">' +
        escapeHtml(dateParts.date) +
        '</span></div>' +
        '</div>';
    }
    var rows = (orderSnap.items || [])
      .map(function (item) {
        var qty = Number(item.quantity) || 0;
        var price = Number(item.price) || 0;
        var line = qty * price;
        return (
          '<tr>' +
          '<td class="col-name">' +
          escapeHtml(item.name || '') +
          '</td>' +
          '<td class="col-qty">' +
          qty +
          '</td>' +
          '<td class="col-unit-price">' +
          formatPrice(price) +
          '</td>' +
          '<td class="col-line-sub">' +
          formatPrice(line) +
          '</td></tr>'
        );
      })
      .join('');
    if (cashierTableOrderDetailBody) {
      cashierTableOrderDetailBody.innerHTML = rows
        ? rows
        : '<tr><td colspan="4" class="cashier-modal-empty">لا أصناف</td></tr>';
    }
    if (cashierTableOrderDetailTotal) {
      cashierTableOrderDetailTotal.innerHTML =
        '<span class="cashier-modal-total__label">المجموع:</span> ' +
        '<span class="cashier-modal-total__value">' +
        escapeHtml(formatPrice(Number(orderSnap.total) || 0)) +
        '</span>';
    }
    if (cashierTableOrderDetailBtnPrint) cashierTableOrderDetailBtnPrint.hidden = true;
    cashierTableOrderDetailOverlay.classList.add('open');
    cashierTableOrderDetailOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeTodaySessionReceiptModal() {
    if (cashierTableOrderDetailOverlay && cashierTableOrderDetailOverlay.classList.contains('open')) {
      closeCashierTableOrderDetailModal();
    }
    var overlay = document.getElementById('todaySessionReceiptOverlay');
    if (!overlay) return;
    currentTodaySessionReceipt = null;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openTodaySessionReceiptModal(session) {
    var overlay = document.getElementById('todaySessionReceiptOverlay');
    var titleEl = document.getElementById('todaySessionReceiptTitle');
    var ordersEl = document.getElementById('todaySessionReceiptOrders');
    var totalEl = document.getElementById('todaySessionReceiptTotal');
    var payEl = document.getElementById('todaySessionReceiptPayment');
    if (!overlay || !session) return;
    currentTodaySessionReceipt = session;
    if (titleEl) {
      titleEl.textContent = 'رقم الطلب: ' + (session.displayId || '—');
    }
    if (ordersEl) {
      var orders = Array.isArray(session.orders) ? session.orders : [];
      ordersEl.innerHTML = orders
        .map(function (ord, idx) {
          var label = orderSectionLabel(idx);
          return (
            '<div class="today-session-order-row">' +
            '<div class="today-session-order-row__main">' +
            '<span class="today-session-order-row__title">' +
            escapeHtml(label) +
            '</span>' +
            '<span class="today-session-order-row__time">' +
            escapeHtml(formatOrderTime(ord.createdAt)) +
            '</span>' +
            '<span class="today-session-order-row__amount">' +
            formatPrice(Number(ord.total) || 0) +
            '</span></div>' +
            '<button type="button" class="btn btn-secondary btn-today-order-detail" data-order-idx="' +
            idx +
            '">عرض التفاصيل</button></div>'
          );
        })
        .join('');
      ordersEl.querySelectorAll('.btn-today-order-detail').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ix = parseInt(btn.getAttribute('data-order-idx'), 10);
          var ord = orders[ix];
          if (ord) openTodaySessionOrderDetail(ord, orderSectionLabel(ix), session.tableId);
        });
      });
    }
    if (totalEl) {
      totalEl.textContent = 'الإجمالي النهائي: ' + formatPrice(Number(session.totalAmount) || 0);
    }
    if (payEl) {
      payEl.textContent = 'طريقة الدفع: ' + todayPaymentMethodLabel(session.paymentMethod);
    }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function openCashierReceipt(order) {
    if (!order || !cashierReceiptOverlay) return;
    var orderType = inferOrderType(order);
    var total = order.total != null ? order.total : (order.items || []).reduce(function (s, it) { return s + (it.price || 0) * (it.quantity || 0); }, 0);
    var dateTimeStr = formatOrderDate(order.closedAt || order.createdAt);
    if (cashierReceiptTableNum) {
      if (orderType === 'DINE_IN') cashierReceiptTableNum.textContent = 'طاولة ' + (order.tableId || '');
      else cashierReceiptTableNum.textContent = orderType === 'DELIVERY' ? 'طلب دلفري' : 'طلب سفري';
    }
    if (cashierReceiptDate) cashierReceiptDate.textContent = dateTimeStr;
    if (cashierReceiptOrderId) cashierReceiptOrderId.textContent = 'رقم الطلب: ' + getOrderIdDisplay(order);
    if (cashierReceiptOrderType) cashierReceiptOrderType.textContent = 'نوع الطلب: ' + orderTypeLabelAr(orderType);
    if (cashierReceiptDeliveryMeta) {
      if (orderType === 'DELIVERY') {
        var meta = order.serviceMeta && typeof order.serviceMeta === 'object' ? order.serviceMeta : {};
        var deliveryText =
          'الاسم: ' +
          (meta.customerName || '—') +
          ' · الهاتف: ' +
          (meta.phoneNumber || '—') +
          ' · العنوان: ' +
          (meta.address || '—');
        cashierReceiptDeliveryMeta.textContent = deliveryText;
      } else if (orderType === 'TAKEAWAY') {
        var tmeta = order.serviceMeta && typeof order.serviceMeta === 'object' ? order.serviceMeta : {};
        cashierReceiptDeliveryMeta.textContent = 'الكاشير: ' + (tmeta.cashierName || '—');
      } else {
        cashierReceiptDeliveryMeta.textContent = '';
      }
    }
    if (cashierReceiptItems) {
      cashierReceiptItems.innerHTML = (order.items || []).map(function (it) {
        return '<tr><td class="col-name">' + escapeHtml(it.name || '') + '</td><td class="col-qty">' + (it.quantity || 0) + '</td><td class="col-price">' + formatPrice(it.price || 0) + '</td></tr>';
      }).join('');
    }
    if (cashierReceiptTotal) cashierReceiptTotal.textContent = 'المجموع الكلي: ' + formatPrice(total);
    cashierReceiptOverlay.classList.add('open');
  }

  function openCashierTableOrderDetailModal(order, index, tableId) {
    if (!cashierTableOrderDetailOverlay || !order) return;
    if (cashierTableOrderDetailBtnPrint) cashierTableOrderDetailBtnPrint.hidden = false;
    currentTableOrderDetail = order;
    var consolidated = consolidateOrderItems([order]);
    var total = sumOrderItems(order);
    var orderName = orderSectionLabel(index);
    var orderRef = shortOrderRef(order, index);
    var dateParts = order.createdAt ? formatBillDateParts(order.createdAt) : { date: '—', time: '—' };
    if (cashierTableOrderDetailTitle) {
      cashierTableOrderDetailTitle.textContent = orderName;
    }
    var dineCust = getDineInCustomerDisplay(order);
    if (cashierTableOrderDetailSubtitle) {
      cashierTableOrderDetailSubtitle.innerHTML = buildTableOrderDetailSubtitleHtml(
        tableId,
        orderRef
      );
    }
    if (cashierTableOrderDetailMeta) {
      var custValueHtml = escapeHtml(dineCust.chipValue);
      if (dineCust.chipSub) {
        custValueHtml +=
          '<span class="cashier-receipt-info__sub">' + escapeHtml(dineCust.chipSub) + '</span>';
      }
      cashierTableOrderDetailMeta.innerHTML =
        '<div class="cashier-receipt-info">' +
        '<div class="cashier-receipt-info__chip cashier-receipt-info__chip--customer">' +
        '<span class="cashier-receipt-info__label">' +
        escapeHtml(dineCust.chipLabel) +
        '</span>' +
        '<span class="cashier-receipt-info__value">' +
        custValueHtml +
        '</span></div>' +
        '<div class="cashier-receipt-info__chip">' +
        '<span class="cashier-receipt-info__label">الوقت</span>' +
        '<span class="cashier-receipt-info__value">' +
        escapeHtml(dateParts.time) +
        '</span></div>' +
        '<div class="cashier-receipt-info__chip">' +
        '<span class="cashier-receipt-info__label">التاريخ</span>' +
        '<span class="cashier-receipt-info__value">' +
        escapeHtml(dateParts.date) +
        '</span></div>' +
        '</div>';
    }
    if (cashierTableOrderDetailBody) {
      var showBy = orderItemsNeedPerSenderLabels(order);
      var itemRows;
      if (showBy) {
        itemRows = (order.items || [])
          .map(function (item) {
            var qty = Number(item.quantity) || 0;
            var price = Number(item.price) || 0;
            var line = qty * price;
            return (
              '<tr>' +
              '<td class="col-name">' +
              formatOrderItemNameHtml(item, true) +
              '</td>' +
              '<td class="col-qty">' +
              qty +
              '</td>' +
              '<td class="col-unit-price">' +
              formatPrice(price) +
              '</td>' +
              '<td class="col-line-sub">' +
              formatPrice(line) +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      } else {
        itemRows = consolidated
          .map(function (item) {
            var qty = Number(item.quantity) || 0;
            var price = Number(item.unitPrice) || 0;
            var line = Number(item.totalPrice) || 0;
            return (
              '<tr>' +
              '<td class="col-name">' +
              escapeHtml(item.name || '') +
              '</td>' +
              '<td class="col-qty">' +
              qty +
              '</td>' +
              '<td class="col-unit-price">' +
              formatPrice(price) +
              '</td>' +
              '<td class="col-line-sub">' +
              formatPrice(line) +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      }
      cashierTableOrderDetailBody.innerHTML = itemRows
        ? itemRows
        : '<tr><td colspan="4" class="cashier-modal-empty">لا أصناف في هذا الطلب</td></tr>';
    }
    if (cashierTableOrderDetailTotal) {
      cashierTableOrderDetailTotal.innerHTML =
        '<span class="cashier-modal-total__label">المجموع:</span> ' +
        '<span class="cashier-modal-total__value">' +
        escapeHtml(formatPrice(total)) +
        '</span>';
    }
    cashierTableOrderDetailOverlay.classList.add('open');
    cashierTableOrderDetailOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeCashierTableOrderDetailModal() {
    if (!cashierTableOrderDetailOverlay) return;
    currentTableOrderDetail = null;
    cashierTableOrderDetailOverlay.classList.remove('open');
    cashierTableOrderDetailOverlay.setAttribute('aria-hidden', 'true');
  }

  if (btnCloseCashierReceipt) btnCloseCashierReceipt.addEventListener('click', function () { cashierReceiptOverlay.classList.remove('open'); });
  if (cashierReceiptOverlay) cashierReceiptOverlay.addEventListener('click', function (e) { if (e.target === cashierReceiptOverlay) cashierReceiptOverlay.classList.remove('open'); });

  if (cashierTableOrderDetailBtnPrint) {
    cashierTableOrderDetailBtnPrint.addEventListener('click', function () {
      if (!currentTableOrderDetail) return;
      printSingleCashierOrderAsync(currentTableOrderDetail).then(function (printed) {
        if (printed && window.showToast) window.showToast('تم فتح معاينة طباعة الوصل');
        else if (!printed) alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة.');
      });
    });
  }
  var todaySessionReceiptCloseX = document.getElementById('todaySessionReceiptCloseX');
  var todaySessionReceiptOverlay = document.getElementById('todaySessionReceiptOverlay');
  if (todaySessionReceiptCloseX) {
    todaySessionReceiptCloseX.addEventListener('click', function () { closeTodaySessionReceiptModal(); });
  }
  if (todaySessionReceiptOverlay) {
    todaySessionReceiptOverlay.addEventListener('click', function (e) {
      if (e.target === todaySessionReceiptOverlay) closeTodaySessionReceiptModal();
    });
  }

  if (cashierTableOrderDetailCloseX) {
    cashierTableOrderDetailCloseX.addEventListener('click', function () { closeCashierTableOrderDetailModal(); });
  }
  if (cashierTableOrderDetailOverlay) {
    cashierTableOrderDetailOverlay.addEventListener('click', function (e) {
      if (e.target === cashierTableOrderDetailOverlay) closeCashierTableOrderDetailModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && cashierOrderTypeOverlay && cashierOrderTypeOverlay.classList.contains('open')) {
      closeOrderTypeModal();
      return;
    }
    if (e.key === 'Escape' && panelNewOrder && panelNewOrder.classList.contains('active')) {
      closeNewOrderModal();
      return;
    }
    if (e.key === 'Escape' && cashierTableOrderDetailOverlay && cashierTableOrderDetailOverlay.classList.contains('open')) {
      closeCashierTableOrderDetailModal();
      return;
    }
    if (e.key === 'Escape' && todaySessionReceiptOverlay && todaySessionReceiptOverlay.classList.contains('open')) {
      closeTodaySessionReceiptModal();
      return;
    }
  });
  if (btnPrintCashierReceipt) btnPrintCashierReceipt.addEventListener('click', function () { window.print(); });

  // ——— القاصة: قاصة اليوم (API till) + إغلاق + قاصة بارحة ———
  var cashboxOpenBalanceInput = document.getElementById('cashboxOpenBalanceInput');
  var cashboxOpenNameInput = document.getElementById('cashboxOpenNameInput');
  var cashboxOpenedByRow = document.getElementById('cashboxOpenedByRow');
  var cashboxOpenedByDisplay = document.getElementById('cashboxOpenedByDisplay');
  var cashboxCloseModal = document.getElementById('cashboxCloseModal');
  var cashboxCloseNameInput = document.getElementById('cashboxCloseNameInput');
  var btnCloseTillCancel = document.getElementById('btnCloseTillCancel');
  var btnCloseTillConfirm = document.getElementById('btnCloseTillConfirm');
  var cashboxOpeningBalanceDisplay = document.getElementById('cashboxOpeningBalanceDisplay');
  var cashboxDate = document.getElementById('cashboxDate');
  var cashboxSalesCash = document.getElementById('cashboxSalesCash');
  var cashboxSalesCard = document.getElementById('cashboxSalesCard');
  var cashboxSalesTotal = document.getElementById('cashboxSalesTotal');
  var cashboxExpensesList = document.getElementById('cashboxExpensesList');
  var cashboxExpensesTotal = document.getElementById('cashboxExpensesTotal');
  var cashboxWithdrawalsList = document.getElementById('cashboxWithdrawalsList');
  var cashboxWithdrawalsTotal = document.getElementById('cashboxWithdrawalsTotal');
  var cashboxNetValue = document.getElementById('cashboxNetValue');
  var cashboxOpenScreen = document.getElementById('cashboxOpenScreen');
  var cashboxMain = document.getElementById('cashboxMain');
  var btnOpenTill = document.getElementById('btnOpenTill');
  var expenseName = document.getElementById('expenseName');
  var expenseAmount = document.getElementById('expenseAmount');
  var expenseNote = document.getElementById('expenseNote');
  var btnAddExpense = document.getElementById('btnAddExpense');
  var btnCancelExpenseEdit = document.getElementById('btnCancelExpenseEdit');
  var cashboxExpenseForm = document.getElementById('cashboxExpenseForm');
  var editingExpenseId = null;
  var withdrawalAmount = document.getElementById('withdrawalAmount');
  var withdrawalNote = document.getElementById('withdrawalNote');
  var btnAddWithdrawal = document.getElementById('btnAddWithdrawal');
  var btnCancelWithdrawalEdit = document.getElementById('btnCancelWithdrawalEdit');
  var cashboxWithdrawalForm = document.getElementById('cashboxWithdrawalForm');
  var editingWithdrawalId = null;

  function getTodayDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatCashboxPrice(n) {
    return window.formatCurrency ? window.formatCurrency(n) : (Number(n) || 0) + ' IQD';
  }

  /** تنسيق رصيد بداية اليوم بالآلاف للعرض (مثل 5,000) */
  function formatOpeningBalanceDisplay(n) {
    var num = Number(n);
    if (num !== num || num < 0) return '';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  }

  /** تحويل النص المعروض (مثل 5,000) إلى رقم للحفظ */
  function parseOpeningBalanceInput(str) {
    if (str == null || str === '') return 0;
    var cleaned = String(str).replace(/\D/g, '').trim();
    var num = Number(cleaned);
    return num !== num || num < 0 ? 0 : num;
  }

  /** تنسيق حقل رصيد بداية اليوم في شاشة الفتح (عرض فقط، بدون حفظ) */
  function formatOpenScreenBalance() {
    if (!cashboxOpenBalanceInput) return;
    var val = parseOpeningBalanceInput(cashboxOpenBalanceInput.value);
    cashboxOpenBalanceInput.value = val === 0 ? '0' : formatOpeningBalanceDisplay(val);
  }

  function renderTillUI(data) {
    var till = data.till || {};
    var sales = data.sales || {};
    var net = data.net != null ? data.net : 0;

    if (cashboxDate) cashboxDate.textContent = till.date || getTodayDateStr();
    if (cashboxOpeningBalanceDisplay) {
      cashboxOpeningBalanceDisplay.textContent = till.openingBalance != null ? formatCashboxPrice(till.openingBalance) : '—';
    }
    var openedByName = till.openedBy ? String(till.openedBy).trim() : '';
    if (openedByName) persistCashierTillName(openedByName);
    else lastTillOpenedBy = '';
    if (cashboxOpenedByRow) cashboxOpenedByRow.style.display = openedByName ? '' : 'none';
    if (cashboxOpenedByDisplay) cashboxOpenedByDisplay.textContent = openedByName || '—';
    if (cashboxSalesCash) cashboxSalesCash.textContent = formatCashboxPrice(sales.salesCash || 0);
    if (cashboxSalesCard) cashboxSalesCard.textContent = formatCashboxPrice(sales.salesCard || 0);
    if (cashboxSalesTotal) cashboxSalesTotal.textContent = formatCashboxPrice(sales.total || 0);

    var expenses = Array.isArray(till.expenses) ? till.expenses : [];
    var withdrawals = Array.isArray(till.withdrawals) ? till.withdrawals : [];
    var totalExp = expenses.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    var totalWith = withdrawals.reduce(function (s, w) { return s + (Number(w.amount) || 0); }, 0);

    if (cashboxExpensesList) {
      cashboxExpensesList.innerHTML = expenses.length
        ? expenses
            .map(function (e) {
              var editing =
                editingExpenseId && String(e.id) === String(editingExpenseId);
              return (
                '<li class="cashbox-entries-row cashbox-entries-row--expense' +
                (editing ? ' cashbox-entries-row--editing' : '') +
                '" data-id="' +
                escapeHtml(e.id) +
                '">' +
                '<span class="col-name">' +
                escapeHtml(e.name || '—') +
                '</span>' +
                '<span class="col-amount">' +
                formatCashboxPrice(e.amount) +
                '</span>' +
                '<span class="col-note">' +
                escapeHtml(e.note || '—') +
                '</span>' +
                '<span class="col-actions">' +
                '<button type="button" class="btn-edit-entry" data-kind="expense">تعديل</button>' +
                '<button type="button" class="btn-remove-item" data-kind="expense">حذف</button>' +
                '</span></li>'
              );
            })
            .join('')
        : '<li class="cashbox-entries-empty">لا مصروفات مسجّلة</li>';
      bindCashboxEntryListActions(cashboxExpensesList, 'expense', expenses);
    }
    if (cashboxExpensesTotal) cashboxExpensesTotal.textContent = formatCashboxPrice(totalExp);
    if (cashboxWithdrawalsList) {
      cashboxWithdrawalsList.innerHTML = withdrawals.length
        ? withdrawals
            .map(function (w) {
              var editing =
                editingWithdrawalId && String(w.id) === String(editingWithdrawalId);
              return (
                '<li class="cashbox-entries-row cashbox-entries-row--withdrawal' +
                (editing ? ' cashbox-entries-row--editing' : '') +
                '" data-id="' +
                escapeHtml(w.id) +
                '">' +
                '<span class="col-amount">' +
                formatCashboxPrice(w.amount) +
                '</span>' +
                '<span class="col-note">' +
                escapeHtml(w.note || '—') +
                '</span>' +
                '<span class="col-actions">' +
                '<button type="button" class="btn-edit-entry" data-kind="withdrawal">تعديل</button>' +
                '<button type="button" class="btn-remove-item" data-kind="withdrawal">حذف</button>' +
                '</span></li>'
              );
            })
            .join('')
        : '<li class="cashbox-entries-empty">لا سحوبات مسجّلة</li>';
      bindCashboxEntryListActions(cashboxWithdrawalsList, 'withdrawal', withdrawals);
    }
    if (cashboxWithdrawalsTotal) cashboxWithdrawalsTotal.textContent = formatCashboxPrice(totalWith);
    if (cashboxNetValue) cashboxNetValue.textContent = formatCashboxPrice(net);
    if (cashboxNotes) {
      cashboxNotes.value = till.note || '';
      cashboxNotes.disabled = false;
    }
    // التحكم في شاشة فتح القاصة حسب حالة القاصة
    var isOpen = till.status === 'open' && !till.closedAt;
    if (cashboxOpenScreen) cashboxOpenScreen.style.display = isOpen ? 'none' : 'flex';
    if (cashboxMain) cashboxMain.style.display = isOpen ? 'block' : 'none';
    if (!isOpen) {
      if (cashboxOpenBalanceInput) cashboxOpenBalanceInput.value = '0';
      if (cashboxOpenNameInput) cashboxOpenNameInput.value = '';
    }
    if (cashboxAlreadyClosed) cashboxAlreadyClosed.style.display = 'none';
    if (btnCloseDay) btnCloseDay.disabled = !isOpen;
  }

  async function loadCashbox() {
    try {
      var data = await api.till.current();
      renderTillUI(data);
    } catch (_) {
      if (cashboxNetValue) cashboxNetValue.textContent = '0 IQD';
      if (cashboxSalesTotal) cashboxSalesTotal.textContent = '0 IQD';
      if (cashboxSalesCash) cashboxSalesCash.textContent = '0 IQD';
      if (cashboxSalesCard) cashboxSalesCard.textContent = '0 IQD';
    }

    var lastClosing = null;
    try {
      lastClosing = await api.closings.last();
    } catch (_) {}
    if (lastClosing) {
      if (cashboxYesterdayWrap) cashboxYesterdayWrap.style.display = 'block';
      renderYesterdayCard(lastClosing);
    } else if (cashboxYesterdayWrap) {
      cashboxYesterdayWrap.style.display = 'none';
    }
  }

  async function openTill() {
    var openedBy = cashboxOpenNameInput ? String(cashboxOpenNameInput.value || '').trim() : '';
    if (!openedBy) {
      alert('يرجى إدخال اسم المستخدم.');
      if (cashboxOpenNameInput) cashboxOpenNameInput.focus();
      return;
    }
    var openingVal = cashboxOpenBalanceInput ? parseOpeningBalanceInput(cashboxOpenBalanceInput.value) : 0;
    try {
      var data = await api.till.open({ openingBalance: openingVal, openedBy: openedBy });
      persistCashierTillName(openedBy);
      renderTillUI(data);
    } catch (err) {
      alert(err.json && err.json.error ? err.json.error : err.message || 'فشل فتح القاصة.');
    }
  }

  function renderYesterdayCard(c) {
    if (!cashboxYesterdayWrap || !cashboxYesterdayCard) return;
    cashboxYesterdayWrap.style.display = 'block';
    function formatDateTime(iso) {
      if (!iso) return '—';
      return formatOrderDate(iso);
    }
    var openedAtText = formatDateTime(c.openedAt || c.date);
    var closedAtText = formatDateTime(c.closedAt || null);
    var html = '';
    html += '<div class="row"><span class="label">وقت فتح القاصة</span><span class="value">' + escapeHtml(openedAtText) + '</span></div>';
    if (c.status || c.closedAt) {
      html += '<div class="row"><span class="label">وقت إغلاق القاصة</span><span class="value">' + escapeHtml(closedAtText) + '</span></div>';
    }
    if (c.salesCash != null || c.salesCard != null) {
      html += '<div class="row"><span class="label">مبيعات الكاش</span><span class="value">' + formatCashboxPrice(c.salesCash || 0) + '</span></div>';
      html += '<div class="row"><span class="label">مبيعات البطاقة</span><span class="value">' + formatCashboxPrice(c.salesCard || 0) + '</span></div>';
    }
    var totalSales = Number(c.totalSales) != null && c.totalSales !== undefined ? Number(c.totalSales) : ((Number(c.salesCash) || 0) + (Number(c.salesCard) || 0));
    html += '<div class="row"><span class="label">إجمالي المبيعات</span><span class="value">' + formatCashboxPrice(totalSales) + '</span></div>';
    if (c.openingBalance != null) html += '<div class="row"><span class="label">رصيد بداية اليوم</span><span class="value">' + formatCashboxPrice(c.openingBalance) + '</span></div>';
    if (c.totalExpenses != null) html += '<div class="row"><span class="label">المصروفات</span><span class="value">' + formatCashboxPrice(c.totalExpenses) + '</span></div>';
    if (c.totalWithdrawals != null) html += '<div class="row"><span class="label">السحب</span><span class="value">' + formatCashboxPrice(c.totalWithdrawals) + '</span></div>';
    var net = c.net != null ? c.net : (totalSales - (Number(c.expenses) || 0));
    if (c.netTotal != null) net = c.netTotal;
    html += '<div class="row"><span class="label">الصافي</span><span class="value">' + formatCashboxPrice(net) + '</span></div>';
    if (c.openedBy) html += '<div class="row"><span class="label">فتح القاصة</span><span class="value">' + escapeHtml(c.openedBy) + '</span></div>';
    if (c.closedBy) html += '<div class="row"><span class="label">أغلق القاصة</span><span class="value">' + escapeHtml(c.closedBy) + '</span></div>';
    if (c.note) html += '<div class="row"><span class="label">ملاحظة</span><span class="value">' + escapeHtml(c.note) + '</span></div>';
    cashboxYesterdayCard.innerHTML = html;
  }

  if (cashboxOpenBalanceInput) {
    cashboxOpenBalanceInput.addEventListener('input', function () {
      var raw = this.value.replace(/\D/g, '');
      this.value = raw === '' ? '0' : formatOpeningBalanceDisplay(Math.max(0, parseInt(raw, 10) || 0));
    });
    cashboxOpenBalanceInput.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') return;
      if (e.ctrlKey || e.metaKey) return;
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });
    cashboxOpenBalanceInput.addEventListener('blur', formatOpenScreenBalance);
  }

  function bindCashboxEntryListActions(listEl, kind, items) {
    if (!listEl) return;
    listEl.querySelectorAll('.btn-edit-entry').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('[data-id]');
        if (!row || !row.dataset.id) return;
        var item = items.find(function (x) {
          return String(x.id) === String(row.dataset.id);
        });
        if (!item) return;
        if (kind === 'expense') startEditExpense(item);
        else startEditWithdrawal(item);
      });
    });
    listEl.querySelectorAll('.btn-remove-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('[data-id]');
        if (!row || !row.dataset.id) return;
        if (kind === 'expense') removeExpense(row.dataset.id);
        else removeWithdrawal(row.dataset.id);
      });
    });
  }

  function setExpenseFormEditing(editing) {
    editingExpenseId = editing ? editing.id : null;
    if (btnAddExpense) {
      btnAddExpense.textContent = editing ? 'حفظ التعديل' : 'إضافة مصروف';
      btnAddExpense.classList.toggle('btn-save-mode', !!editing);
    }
    if (btnCancelExpenseEdit) btnCancelExpenseEdit.hidden = !editing;
    if (cashboxExpenseForm) {
      cashboxExpenseForm.classList.toggle('cashbox-entry-form--editing', !!editing);
    }
  }

  function resetExpenseForm() {
    setExpenseFormEditing(null);
    if (expenseName) expenseName.value = '';
    if (expenseAmount) expenseAmount.value = '';
    if (expenseNote) expenseNote.value = '';
    if (cashboxExpensesList) {
      cashboxExpensesList.querySelectorAll('.cashbox-entries-row--editing').forEach(function (li) {
        li.classList.remove('cashbox-entries-row--editing');
      });
    }
  }

  function startEditExpense(exp) {
    if (!exp) return;
    setExpenseFormEditing(exp);
    if (expenseName) expenseName.value = exp.name || '';
    if (expenseAmount) expenseAmount.value = String(Number(exp.amount) || 0);
    if (expenseNote) expenseNote.value = exp.note || '';
    if (expenseName) {
      expenseName.focus();
      expenseName.select();
    }
    if (cashboxExpenseForm) cashboxExpenseForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function addOrSaveExpense() {
    var name = expenseName ? String(expenseName.value || '').trim() : '';
    var amount = expenseAmount ? Number(expenseAmount.value) : 0;
    var note = expenseNote ? String(expenseNote.value || '').trim() : '';
    if (!name) {
      alert('أدخل اسم المصروف');
      if (expenseName) expenseName.focus();
      return;
    }
    if (!amount || amount <= 0) {
      alert('أدخل المبلغ');
      if (expenseAmount) expenseAmount.focus();
      return;
    }
    var payload = editingExpenseId
      ? { expenseUpdate: { id: editingExpenseId, name: name, amount: amount, note: note } }
      : { expense: { name: name, amount: amount, note: note } };
    api.till
      .update(payload)
      .then(function (data) {
        resetExpenseForm();
        renderTillUI(data);
      })
      .catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'فشل الحفظ');
      });
  }

  function removeExpense(id) {
    if (!id) return;
    var confirmFn = window.CafeDialog && CafeDialog.confirm ? CafeDialog.confirm : function (m) { return Promise.resolve(confirm(m)); };
    confirmFn('حذف هذا المصروف؟').then(function (ok) {
      if (!ok) return;
      if (editingExpenseId && String(editingExpenseId) === String(id)) resetExpenseForm();
      api.till.deleteExpense(id).then(renderTillUI).catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'فشل الحذف');
      });
    });
  }

  function setWithdrawalFormEditing(editing) {
    editingWithdrawalId = editing ? editing.id : null;
    if (btnAddWithdrawal) {
      btnAddWithdrawal.textContent = editing ? 'حفظ التعديل' : 'إضافة سحب';
      btnAddWithdrawal.classList.toggle('btn-save-mode', !!editing);
    }
    if (btnCancelWithdrawalEdit) btnCancelWithdrawalEdit.hidden = !editing;
    if (cashboxWithdrawalForm) {
      cashboxWithdrawalForm.classList.toggle('cashbox-entry-form--editing', !!editing);
    }
  }

  function resetWithdrawalForm() {
    setWithdrawalFormEditing(null);
    if (withdrawalAmount) withdrawalAmount.value = '';
    if (withdrawalNote) withdrawalNote.value = '';
    if (cashboxWithdrawalsList) {
      cashboxWithdrawalsList.querySelectorAll('.cashbox-entries-row--editing').forEach(function (li) {
        li.classList.remove('cashbox-entries-row--editing');
      });
    }
  }

  function startEditWithdrawal(wd) {
    if (!wd) return;
    setWithdrawalFormEditing(wd);
    if (withdrawalAmount) withdrawalAmount.value = String(Number(wd.amount) || 0);
    if (withdrawalNote) withdrawalNote.value = wd.note || '';
    if (withdrawalAmount) {
      withdrawalAmount.focus();
      withdrawalAmount.select();
    }
    if (cashboxWithdrawalForm) {
      cashboxWithdrawalForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function addOrSaveWithdrawal() {
    var amount = withdrawalAmount ? Number(withdrawalAmount.value) : 0;
    var note = withdrawalNote ? String(withdrawalNote.value || '').trim() : '';
    if (!amount || amount <= 0) {
      alert('أدخل المبلغ المسحوب');
      if (withdrawalAmount) withdrawalAmount.focus();
      return;
    }
    var payload = editingWithdrawalId
      ? { withdrawalUpdate: { id: editingWithdrawalId, amount: amount, note: note } }
      : { withdrawal: { amount: amount, note: note } };
    api.till
      .update(payload)
      .then(function (data) {
        resetWithdrawalForm();
        renderTillUI(data);
      })
      .catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'فشل الحفظ');
      });
  }

  function removeWithdrawal(id) {
    if (!id) return;
    var confirmFn = window.CafeDialog && CafeDialog.confirm ? CafeDialog.confirm : function (m) { return Promise.resolve(confirm(m)); };
    confirmFn('حذف عملية السحب؟').then(function (ok) {
      if (!ok) return;
      if (editingWithdrawalId && String(editingWithdrawalId) === String(id)) resetWithdrawalForm();
      api.till.deleteWithdrawal(id).then(renderTillUI).catch(function (err) {
        alert(err.json && err.json.error ? err.json.error : err.message || 'فشل الحذف');
      });
    });
  }

  if (btnAddExpense) btnAddExpense.addEventListener('click', addOrSaveExpense);
  if (btnCancelExpenseEdit) btnCancelExpenseEdit.addEventListener('click', resetExpenseForm);
  if (btnAddWithdrawal) btnAddWithdrawal.addEventListener('click', addOrSaveWithdrawal);
  if (btnCancelWithdrawalEdit) btnCancelWithdrawalEdit.addEventListener('click', resetWithdrawalForm);

  var cashboxNoteSaveTimeout = null;
  if (cashboxNotes) {
    cashboxNotes.addEventListener('input', function () {
      clearTimeout(cashboxNoteSaveTimeout);
      cashboxNoteSaveTimeout = setTimeout(function () {
        var note = String(cashboxNotes.value || '').trim();
        api.till.update({ note: note }).catch(function () {});
      }, 600);
    });
  }

  function openCashboxCloseModal() {
    if (!cashboxCloseModal) return;
    if (cashboxCloseNameInput) {
      var preset = cashboxOpenNameInput ? String(cashboxOpenNameInput.value || '').trim() : '';
      if (!preset && cashboxOpenedByDisplay) preset = String(cashboxOpenedByDisplay.textContent || '').trim();
      if (preset === '—') preset = '';
      cashboxCloseNameInput.value = preset;
    }
    cashboxCloseModal.classList.add('open');
    cashboxCloseModal.setAttribute('aria-hidden', 'false');
    if (cashboxCloseNameInput) cashboxCloseNameInput.focus();
  }

  function closeCashboxCloseModal() {
    if (!cashboxCloseModal) return;
    cashboxCloseModal.classList.remove('open');
    cashboxCloseModal.setAttribute('aria-hidden', 'true');
  }

  async function confirmCloseTill() {
    var closedBy = cashboxCloseNameInput ? String(cashboxCloseNameInput.value || '').trim() : '';
    if (!closedBy) {
      alert('يرجى إدخال اسم المستخدم.');
      if (cashboxCloseNameInput) cashboxCloseNameInput.focus();
      return;
    }
    if (btnCloseTillConfirm) btnCloseTillConfirm.disabled = true;
    try {
      await api.till.close(closedBy);
      closeCashboxCloseModal();
      if (cashboxNotes) cashboxNotes.value = '';
      loadTodayOrders();
      loadCashbox();
      if (selectedTableId) loadTableOrders(selectedTableId);
      if (typeof showToast === 'function') showToast('تم إغلاق القاصة بنجاح.');
      else alert('تم إغلاق القاصة بنجاح.');
    } catch (err) {
      alert(err.json && err.json.error ? err.json.error : err.message || 'فشل إغلاق القاصة.');
    } finally {
      if (btnCloseTillConfirm) btnCloseTillConfirm.disabled = false;
    }
  }

  function closeDay() {
    if (!btnCloseDay || btnCloseDay.disabled) return;
    openCashboxCloseModal();
  }

  if (btnCloseDay) btnCloseDay.addEventListener('click', closeDay);
  if (btnCloseTillCancel) btnCloseTillCancel.addEventListener('click', closeCashboxCloseModal);
  if (btnCloseTillConfirm) btnCloseTillConfirm.addEventListener('click', confirmCloseTill);
  if (cashboxCloseModal) {
    cashboxCloseModal.addEventListener('click', function (e) {
      if (e.target === cashboxCloseModal) closeCashboxCloseModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && cashboxCloseModal && cashboxCloseModal.classList.contains('open')) {
      closeCashboxCloseModal();
    }
  });
  if (btnOpenTill) btnOpenTill.addEventListener('click', openTill);
  if (cashierAutoApprovalToggle) {
    cashierAutoApprovalToggle.addEventListener('click', toggleCashierAutoApproval);
  }

  async function init() {
    loadCashierCafeBranding();
    refreshCashierNameFromTill();
    await loadCashierAutoApprovalSetting();
    try {
      tables = await api.orders.tables();
      await loadBillRequestedTables();
      try {
        cashierMenuItems = await api.menu.list();
      } catch (_) {
        cashierMenuItems = [];
      }
      try {
        cashierCategories = await api.categories.list();
      } catch (_) {
        cashierCategories = [];
      }
      renderTables();
      connectSocket();
      loadCashierPendingApprovals();
    } catch (err) {
      tablesGrid.innerHTML = '<p class="alert alert-error">فشل تحميل الطاولات. تأكد من تشغيل الخادم.</p>';
    }
  }

  init();
})();
