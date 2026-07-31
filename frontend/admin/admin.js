/**
 * لوحة تحكم الأدمن — قائمة جانبية، إضافة عنصر، عرض المنيو، طلبات اليوم، وصل طباعة
 */
(function () {
  const sidebar = document.getElementById('sidebar');
  const adminMain = document.getElementById('adminMain');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const formAddItem = document.getElementById('formAddItem');
  const editId = document.getElementById('editId');
  const itemName = document.getElementById('itemName');
  const itemPrice = document.getElementById('itemPrice');
  const itemCategory = document.getElementById('itemCategory');
  const itemImage = document.getElementById('itemImage');
  const itemImagePreview = document.getElementById('itemImagePreview');
  const itemImageUrl = document.getElementById('itemImageUrl');
  const itemIngredients = document.getElementById('itemIngredients');
  const itemOptionGroups = document.getElementById('itemOptionGroups');
  const btnAddOptionGroup = document.getElementById('btnAddOptionGroup');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const menuList = document.getElementById('menuList');
  const emptyMenu = document.getElementById('emptyMenu');
  const statsSection = document.getElementById('statsSection');
  const todayGroupedList = document.getElementById('todayGroupedList');
  const emptyOrders = document.getElementById('emptyOrders');
  const receiptOverlay = document.getElementById('receiptOverlay');
  const receiptTableNum = document.getElementById('receiptTableNum');
  const receiptDate = document.getElementById('receiptDate');
  const receiptOrderId = document.getElementById('receiptOrderId');
  const receiptItems = document.getElementById('receiptItems');
  const receiptTotal = document.getElementById('receiptTotal');
  const btnPrintReceipt = document.getElementById('btnPrintReceipt');
  const btnCloseReceipt = document.getElementById('btnCloseReceipt');
  const toastEl = document.getElementById('toast');
  const btnMenuOpen = document.getElementById('btnMenuOpen');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnAddMenuItem = document.getElementById('btnAddMenuItem');
  const btnBackCategories = document.getElementById('btnBackCategories');
  const menuCategoriesWrap = document.getElementById('menuCategoriesWrap');
  const menuCategoryCards = document.getElementById('menuCategoryCards');
  const emptyCategories = document.getElementById('emptyCategories');
  const menuCategoryDetail = document.getElementById('menuCategoryDetail');
  const menuPageTitle = document.getElementById('menuPageTitle');
  const btnAddCategory = document.getElementById('btnAddCategory');
  const addCategoryOverlay = document.getElementById('addCategoryOverlay');
  const addCategoryInput = document.getElementById('addCategoryInput');
  const btnAddCategoryCancel = document.getElementById('btnAddCategoryCancel');
  const btnAddCategorySubmit = document.getElementById('btnAddCategorySubmit');
  const btnAddCategoryClose = document.getElementById('btnAddCategoryClose');
  const deleteCategoryOverlay = document.getElementById('deleteCategoryOverlay');
  const deleteCategoryMessage = document.getElementById('deleteCategoryMessage');
  const btnDeleteCategoryCancel = document.getElementById('btnDeleteCategoryCancel');
  const btnDeleteCategoryConfirm = document.getElementById('btnDeleteCategoryConfirm');
  const btnDeleteCategoryClose = document.getElementById('btnDeleteCategoryClose');
  const menuCategoryDetailTitle = document.getElementById('menuCategoryDetailTitle');
  const btnEditCategoryName = document.getElementById('btnEditCategoryName');
  const btnDeleteCategoryOutside = document.getElementById('btnDeleteCategoryOutside');
  const categoryImageOverlay = document.getElementById('categoryImageOverlay');
  const categoryImagePreviewBox = document.getElementById('categoryImagePreviewBox');
  const categoryImageEmpty = document.getElementById('categoryImageEmpty');
  const menuCategoryImagePreview = document.getElementById('menuCategoryImagePreview');
  const menuCategoryImageInput = document.getElementById('menuCategoryImageInput');
  const btnPickCategoryImage = document.getElementById('btnPickCategoryImage');
  const btnCategoryImageChange = document.getElementById('btnCategoryImageChange');
  const btnCategoryImageCloseX = document.getElementById('btnCategoryImageCloseX');
  const btnRemoveCategoryImage = document.getElementById('btnRemoveCategoryImage');
  const renameCategoryOverlay = document.getElementById('renameCategoryOverlay');
  const renameCategoryInput = document.getElementById('renameCategoryInput');
  const btnRenameCategoryCancel = document.getElementById('btnRenameCategoryCancel');
  const btnRenameCategorySubmit = document.getElementById('btnRenameCategorySubmit');
  const btnRenameCategoryClose = document.getElementById('btnRenameCategoryClose');
  const archiveDate = document.getElementById('archiveDate');
  const archiveMonth = document.getElementById('archiveMonth');
  const archiveYear = document.getElementById('archiveYear');
  const btnArchiveReport = document.getElementById('btnArchiveReport');
  const archiveStatsRow = document.getElementById('archiveStatsRow');
  const archiveGroupedList = document.getElementById('archiveGroupedList');
  const emptyArchive = document.getElementById('emptyArchive');
  const archiveSampleNotice = document.getElementById('archiveSampleNotice');

  const CAFE_NAME = 'منيو الكافيه';
  var archiveReportOrders = [];
  var displaySessionsList = [];
  var currentTodaySessionReceipt = null;
  const todaySessionReceiptOverlay = document.getElementById('todaySessionReceiptOverlay');
  const cashierTableOrderDetailOverlay = document.getElementById('cashierTableOrderDetailOverlay');
  const cashierTableOrderDetailTitle = document.getElementById('cashierTableOrderDetailTitle');
  const cashierTableOrderDetailSubtitle = document.getElementById('cashierTableOrderDetailSubtitle');
  const cashierTableOrderDetailBody = document.getElementById('cashierTableOrderDetailBody');
  const cashierTableOrderDetailTotal = document.getElementById('cashierTableOrderDetailTotal');
  var allMenuItems = [];
  var selectedCategory = null;
  var lastCategoriesWithCounts = [];

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }
  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('mobile-open');
  }
  function openMobileSidebar() {
    if (sidebar) sidebar.classList.add('mobile-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('mobile-open');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
  }

  function formatMoney(n) {
    return window.formatCurrency ? window.formatCurrency(n) : String(Math.round(n)) + ' IQD';
  }

  var IQD_PRICE_STEP = 1000;

  function parseIqdPriceInput(str) {
    var digits = String(str == null ? '' : str).replace(/[^\d]/g, '');
    if (!digits) return 0;
    var n = parseInt(digits, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function formatIqdPriceInput(n) {
    var num = Math.max(0, Math.round(Number(n) || 0));
    try {
      return num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    } catch (_) {
      return String(num);
    }
  }

  function readItemPrice() {
    return parseIqdPriceInput(itemPrice ? itemPrice.value : 0);
  }

  function writeItemPrice(n, placeCursorAtEnd) {
    if (!itemPrice) return;
    itemPrice.value = formatIqdPriceInput(n);
    if (placeCursorAtEnd) {
      var len = itemPrice.value.length;
      try {
        itemPrice.setSelectionRange(len, len);
      } catch (_) {}
    }
  }

  /** تنسيق السعر أثناء الكتابة مع الحفاظ على موضع المؤشر */
  function formatPriceInputLive() {
    if (!itemPrice) return;
    var raw = itemPrice.value;
    var cursor = itemPrice.selectionStart;
    if (cursor == null) cursor = raw.length;

    var digits = raw.replace(/[^\d]/g, '');
    if (!digits) {
      itemPrice.value = '';
      try {
        itemPrice.setSelectionRange(0, 0);
      } catch (_) {}
      return;
    }

    var formatted = formatIqdPriceInput(parseInt(digits, 10));
    var digitsBefore = raw.slice(0, cursor).replace(/[^\d]/g, '').length;
    var newCursor = formatted.length;

    if (digitsBefore > 0) {
      var count = 0;
      for (var i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted.charAt(i))) {
          count++;
          if (count === digitsBefore) {
            newCursor = i + 1;
            break;
          }
        }
      }
    } else {
      newCursor = 0;
    }

    itemPrice.value = formatted;
    try {
      itemPrice.setSelectionRange(newCursor, newCursor);
    } catch (_) {}
  }

  function stepItemPrice(delta) {
    writeItemPrice(readItemPrice() + delta, true);
  }

  if (itemPrice) {
    itemPrice.addEventListener('input', formatPriceInputLive);
    itemPrice.addEventListener('blur', function () {
      if (!String(itemPrice.value || '').replace(/[^\d]/g, '')) {
        writeItemPrice(0);
      } else {
        formatPriceInputLive();
      }
    });
    itemPrice.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      var digits = text.replace(/[^\d]/g, '');
      if (!digits) return;
      var merged = readItemPrice();
      if (typeof itemPrice.selectionStart === 'number' && typeof itemPrice.selectionEnd === 'number') {
        var before = itemPrice.value.slice(0, itemPrice.selectionStart).replace(/[^\d]/g, '');
        var after = itemPrice.value.slice(itemPrice.selectionEnd).replace(/[^\d]/g, '');
        merged = parseIqdPriceInput(before + digits + after);
      } else {
        merged = parseIqdPriceInput(digits);
      }
      writeItemPrice(merged, true);
      formatPriceInputLive();
    });
    itemPrice.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepItemPrice(IQD_PRICE_STEP);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepItemPrice(-IQD_PRICE_STEP);
      }
    });
  }
  var itemPriceUp = document.getElementById('itemPriceUp');
  var itemPriceDown = document.getElementById('itemPriceDown');
  if (itemPriceUp) {
    itemPriceUp.addEventListener('click', function () {
      stepItemPrice(IQD_PRICE_STEP);
      if (itemPrice) itemPrice.focus();
    });
  }
  if (itemPriceDown) {
    itemPriceDown.addEventListener('click', function () {
      stepItemPrice(-IQD_PRICE_STEP);
      if (itemPrice) itemPrice.focus();
    });
  }

  function showToast(message, type) {
    if (!toastEl) return;
    var msg = String(message != null ? message : '');
    var kind = type;
    if (!kind) {
      kind = /فشل|خطأ|غير صحيح|تعذر|يرجى/i.test(msg) ? 'error' : 'success';
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast toast--' + (kind === 'error' ? 'error' : 'success');
    toastEl.classList.add('show');
    setTimeout(function () {
      toastEl.classList.remove('show');
    }, 3200);
  }
  window.showToast = showToast;

  var adminWrap = document.querySelector('.admin-wrap');
  function expandSidebarIfDesktop() {
    if (!isMobile() && sidebar && adminWrap && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      adminWrap.classList.remove('sidebar-collapsed');
    }
  }
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isMobile()) {
        closeMobileSidebar();
      } else {
        if (sidebar) sidebar.classList.toggle('collapsed');
        if (adminWrap) adminWrap.classList.toggle('sidebar-collapsed');
      }
    });
  }
  if (sidebar) {
    sidebar.addEventListener('click', function () {
      expandSidebarIfDesktop();
    });
  }
  if (btnMenuOpen) {
    btnMenuOpen.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openMobileSidebar();
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', function () { closeMobileSidebar(); });
  }
  if (btnAddMenuItem) {
    btnAddMenuItem.addEventListener('click', function () {
      setEditMode(null);
      if (selectedCategory !== null && itemCategory) itemCategory.value = selectedCategory;
      switchToPage('add-item');
    });
  }
  if (btnBackCategories) {
    btnBackCategories.addEventListener('click', function () {
      selectedCategory = null;
      showCategoriesView();
      renderCategoryCards(lastCategoriesWithCounts);
    });
  }

  if (btnAddCategory) btnAddCategory.addEventListener('click', openAddCategoryModal);
  if (btnAddCategoryCancel) btnAddCategoryCancel.addEventListener('click', closeAddCategoryModal);
  if (btnAddCategoryClose) btnAddCategoryClose.addEventListener('click', closeAddCategoryModal);
  if (addCategoryOverlay) {
    addCategoryOverlay.addEventListener('click', function (e) {
      if (e.target === addCategoryOverlay) closeAddCategoryModal();
    });
  }
  if (btnAddCategorySubmit && addCategoryInput) {
    btnAddCategorySubmit.addEventListener('click', async function () {
      var name = (addCategoryInput.value || '').trim();
      if (!name) {
        showToast('أدخل اسم التصنيف');
        return;
      }
      try {
        if (api.categories && api.categories.add) {
          await api.categories.add(name);
          showToast('تمت إضافة التصنيف');
          closeAddCategoryModal();
          loadMenu();
        } else {
          showToast('خاصية التصنيفات غير متوفرة');
        }
      } catch (err) {
        showToast(err.json && err.json.error ? err.json.error : err.message || 'فشل الإضافة');
      }
    });
  }

  /** تبديل الصفحة المعروضة فقط (بدون مسح النموذج) */
  function switchToPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    var navEl = document.querySelector('.nav-item[data-page="' + pageName + '"]');
    if (navEl) navEl.classList.add('active');
    document.querySelectorAll('.admin-page').forEach(function (p) { p.classList.remove('active'); });
    var pageId =
      pageName === 'add-item'
        ? 'AddItem'
        : pageName === 'view-menu'
          ? 'ViewMenu'
          : pageName === 'reports'
            ? 'Reports'
            : pageName === 'archive'
              ? 'Archive'
              : pageName === 'settings'
                ? 'Settings'
                : 'TodayOrders';
    var pageEl = document.getElementById('page' + pageId);
    if (pageEl) pageEl.classList.add('active');
  }

  function collapseSidebarIfDesktop() {
    if (!isMobile() && sidebar && adminWrap) {
      sidebar.classList.add('collapsed');
      adminWrap.classList.add('sidebar-collapsed');
    }
  }

  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var page = el.dataset.page;
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      el.classList.add('active');
      document.querySelectorAll('.admin-page').forEach(function (p) { p.classList.remove('active'); });
      if (page === 'add-item') {
        document.getElementById('pageAddItem').classList.add('active');
        setEditMode(null); /* عند فتح "إضافة عنصر" من القائمة نُفرغ النموذج */
      } else if (page === 'view-menu') {
        document.getElementById('pageViewMenu').classList.add('active');
        selectedCategory = null;
        loadMenu();
      } else if (page === 'reports') {
        document.getElementById('pageReports').classList.add('active');
        loadStats();
        setReportsDateline();
      } else if (page === 'today-orders') {
        document.getElementById('pageTodayOrders').classList.add('active');
        loadTodayOrders();
      } else if (page === 'archive') {
        document.getElementById('pageArchive').classList.add('active');
        initArchiveDefaults();
        loadArchiveReport();
      } else if (page === 'settings') {
        document.getElementById('pageSettings').classList.add('active');
        if (window.AdminSettings && window.AdminSettings.loadPage) window.AdminSettings.loadPage();
      }
      if (isMobile()) closeMobileSidebar();
    });
    el.addEventListener('dblclick', function () {
      if (!isMobile()) {
        collapseSidebarIfDesktop();
      }
    });
  });

  if (adminMain) {
    adminMain.addEventListener('click', function (e) {
      if (isMobile()) return;
      if (sidebar && sidebar.contains(e.target)) return;
      if (sidebar && !sidebar.classList.contains('collapsed')) {
        collapseSidebarIfDesktop();
      }
    });
  }

  function clearOptionGroups() {
    if (!itemOptionGroups) return;
    itemOptionGroups.innerHTML = '';
  }

  function parseOptionValuesText(raw) {
    return String(raw || '')
      .split(/[\n,،]+/g)
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(Boolean);
  }

  function normalizeOptionGroupValues(valuesInput) {
    if (Array.isArray(valuesInput)) {
      return valuesInput
        .map(function (v) {
          return String(v != null ? v : '').trim();
        })
        .filter(Boolean);
    }
    return parseOptionValuesText(valuesInput);
  }

  function addOptionGroupRow(title, valuesInput) {
    if (!itemOptionGroups) return;
    var titleStr = title != null ? String(title) : '';
    var initialValues = normalizeOptionGroupValues(valuesInput);
    var trimmedTitle = titleStr.trim();
    var hasVals = initialValues.length > 0;
    /* طي تلقائي عند وجود اسم وقيم (تحميل تعديل)؛ توسيع عند صف جديد أو ناقص */
    var startOpen = !(trimmedTitle && hasVals);

    var row = document.createElement('div');
    row.className = 'item-option-group-row' + (startOpen ? ' is-open' : '');

    var header = document.createElement('div');
    header.className = 'item-option-accordion__header';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'item-option-accordion__trigger';
    trigger.setAttribute('aria-expanded', startOpen ? 'true' : 'false');
    trigger.setAttribute('aria-label', 'توسيع أو طي حقل القيم');
    var chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevronSvg.setAttribute('class', 'item-option-chevron');
    chevronSvg.setAttribute('viewBox', '0 0 24 24');
    chevronSvg.setAttribute('width', '20');
    chevronSvg.setAttribute('height', '20');
    chevronSvg.setAttribute('fill', 'none');
    chevronSvg.setAttribute('stroke', 'currentColor');
    chevronSvg.setAttribute('stroke-width', '2');
    chevronSvg.setAttribute('stroke-linecap', 'round');
    chevronSvg.setAttribute('stroke-linejoin', 'round');
    var chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    chevronPath.setAttribute('d', 'M6 9l6 6 6-6');
    chevronSvg.appendChild(chevronPath);
    trigger.appendChild(chevronSvg);

    var titleWrap = document.createElement('div');
    titleWrap.className = 'item-option-title-wrap';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'opt-group-title';
    inp.placeholder = 'اسم الخيار (مثال: السكر)';
    inp.value = titleStr;
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('aria-label', 'اسم الخيار');
    titleWrap.appendChild(inp);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-danger item-option-group-remove';
    removeBtn.title = 'حذف هذا الخيار';
    removeBtn.setAttribute('aria-label', 'حذف الخيار');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      row.remove();
    });

    var panel = document.createElement('div');
    panel.className = 'item-option-accordion__panel';
    panel.setAttribute('aria-hidden', startOpen ? 'false' : 'true');

    function setPanelOpen(open) {
      row.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      tagInput.tabIndex = open ? 0 : -1;
      tagAddBtn.tabIndex = open ? 0 : -1;
    }

    trigger.addEventListener('click', function () {
      setPanelOpen(!row.classList.contains('is-open'));
    });

    inp.addEventListener('focus', function () {
      setPanelOpen(true);
    });

    header.appendChild(trigger);
    header.appendChild(titleWrap);
    header.appendChild(removeBtn);
    var panelInner = document.createElement('div');
    panelInner.className = 'item-option-accordion__panel-inner';
    var body = document.createElement('div');
    body.className = 'item-option-accordion__body';

    var inner = document.createElement('div');
    inner.className = 'item-option-group-row__inner';

    var fg2 = document.createElement('div');
    fg2.className = 'form-group item-option-group-field';
    var l2 = document.createElement('label');
    l2.textContent = 'القيم';
    fg2.appendChild(l2);

    var tagField = document.createElement('div');
    tagField.className = 'item-option-tag-field';

    var preview = document.createElement('div');
    preview.className = 'item-option-chips-preview';
    preview.setAttribute('aria-live', 'polite');

    var tagInputRow = document.createElement('div');
    tagInputRow.className = 'item-option-tag-input-row';

    var tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'opt-group-tag-input';
    tagInput.placeholder = 'اكتب قيمة واحدة (مثال: بدون سكر)';
    tagInput.setAttribute('autocomplete', 'off');
    tagInput.setAttribute('aria-label', 'إضافة قيمة للخيار');
    tagInput.tabIndex = startOpen ? 0 : -1;

    var tagAddBtn = document.createElement('button');
    tagAddBtn.type = 'button';
    tagAddBtn.className = 'item-option-tag-add-btn';
    tagAddBtn.setAttribute('aria-label', 'إضافة القيمة');
    tagAddBtn.title = 'إضافة';
    tagAddBtn.innerHTML = '<span class="item-option-tag-add-btn__glyph" aria-hidden="true">+</span>';
    tagAddBtn.tabIndex = startOpen ? 0 : -1;

    function readChipValues() {
      return Array.from(preview.querySelectorAll('.item-option-chip-text'))
        .map(function (el) {
          return String(el.textContent || '').trim();
        })
        .filter(Boolean);
    }

    function appendOptionTag(val, opts) {
      var trimmed = String(val != null ? val : '').trim();
      if (!trimmed) return false;
      if (readChipValues().indexOf(trimmed) !== -1) {
        tagInput.value = '';
        return false;
      }
      var chip = document.createElement('span');
      chip.className = 'item-option-chip';
      var text = document.createElement('span');
      text.className = 'item-option-chip-text';
      text.textContent = trimmed;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'item-option-chip-remove';
      rm.setAttribute('aria-label', 'حذف القيمة «' + trimmed + '»');
      rm.textContent = '×';
      rm.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        chip.remove();
      });
      chip.appendChild(text);
      chip.appendChild(rm);
      preview.appendChild(chip);
      tagInput.value = '';
      if (!opts || opts.focus !== false) tagInput.focus();
      return true;
    }

    function commitTagInput() {
      appendOptionTag(tagInput.value);
    }

    tagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTagInput();
      }
    });

    tagAddBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      commitTagInput();
    });

    tagInputRow.appendChild(tagInput);
    tagInputRow.appendChild(tagAddBtn);
    tagField.appendChild(preview);
    tagField.appendChild(tagInputRow);
    fg2.appendChild(tagField);

    initialValues.forEach(function (val) {
      appendOptionTag(val, { focus: false });
    });
    tagInput.value = '';

    inner.appendChild(fg2);
    body.appendChild(inner);
    panelInner.appendChild(body);
    panel.appendChild(panelInner);

    row.appendChild(header);
    row.appendChild(panel);
    itemOptionGroups.appendChild(row);
  }

  function collectOptionsFromDom() {
    if (!itemOptionGroups) return [];
    var rows = itemOptionGroups.querySelectorAll('.item-option-group-row');
    var out = [];
    rows.forEach(function (row) {
      var titleEl = row.querySelector('.opt-group-title');
      var title = titleEl ? String(titleEl.value || '').trim() : '';
      var values = Array.from(row.querySelectorAll('.item-option-chip-text'))
        .map(function (el) {
          return String(el.textContent || '').trim();
        })
        .filter(Boolean);
      if (title && values.length) out.push({ title: title, values: values });
    });
    return out;
  }

  function setEditMode(item) {
    var titleEl = document.getElementById('pageAddItemTitle');
    if (item) {
      editId.value = item.id;
      itemName.value = item.name;
      writeItemPrice(item.price);
      itemCategory.value = item.category || '';
      itemImageUrl.value = item.imageUrl || '';
      itemIngredients.value = item.ingredients || '';
      itemImage.value = '';
      clearOptionGroups();
      if (Array.isArray(item.options) && item.options.length) {
        item.options.forEach(function (g) {
          addOptionGroupRow(g.title, g.values || []);
        });
      }
      if (item.imageUrl) {
        itemImagePreview.src = (window.API_BASE || '') + item.imageUrl;
        itemImagePreview.style.display = 'block';
      } else { itemImagePreview.style.display = 'none'; }
      formAddItem.querySelector('button[type="submit"]').textContent = 'حفظ التعديل';
      if (titleEl) titleEl.textContent = 'تعديل عنصر';
    } else {
      editId.value = '';
      formAddItem.reset();
      writeItemPrice(0);
      itemImageUrl.value = '';
      itemImagePreview.style.display = 'none';
      clearOptionGroups();
      formAddItem.querySelector('button[type="submit"]').textContent = 'حفظ';
      if (titleEl) titleEl.textContent = 'إضافة عنصر جديد';
    }
  }

  itemImage.addEventListener('change', async function () {
    var file = this.files[0];
    if (!file) {
      itemImagePreview.style.display = 'none';
      itemImageUrl.value = '';
      return;
    }
    try {
      var url = await api.uploadImage(file);
      itemImageUrl.value = url;
      itemImagePreview.src = (window.API_BASE || '') + url;
      itemImagePreview.style.display = 'block';
    } catch (e) {
      showToast('فشل رفع الصورة');
    }
  });

  btnCancelEdit.addEventListener('click', function () {
    setEditMode(null);
    switchToPage('view-menu');
    loadStats();
    loadMenu();
  });

  if (btnAddOptionGroup) {
    btnAddOptionGroup.addEventListener('click', function () {
      addOptionGroupRow('', '');
    });
  }

  formAddItem.addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = editId.value.trim();
    var payload = {
      name: itemName.value.trim(),
      price: readItemPrice(),
      category: itemCategory.value || '',
      imageUrl: itemImageUrl.value.trim(),
      ingredients: itemIngredients.value.trim(),
      options: collectOptionsFromDom(),
    };
    try {
      if (id) {
        await api.menu.update(id, payload);
        showToast('تم التعديل بنجاح');
      } else {
        await api.menu.create(payload);
        showToast('تمت الإضافة بنجاح');
      }
      setEditMode(null);
      loadMenu();
      loadStats();
      document.querySelector('.nav-item[data-page="view-menu"]').click();
    } catch (err) {
      showToast(err.json && err.json.error ? err.json.error : err.message || 'حدث خطأ');
    }
  });

  function countOrdersByTypeFromList(orders) {
    var dineIn = 0;
    var takeaway = 0;
    var delivery = 0;
    (orders || []).forEach(function (o) {
      var tid = String(o.table != null ? o.table : o.tableId != null ? o.tableId : '').trim().toUpperCase();
      var t = o.orderType ? String(o.orderType).trim().toUpperCase() : '';
      if (t === 'TAKEAWAY' || tid === 'TAKEAWAY') takeaway += 1;
      else if (t === 'DELIVERY' || tid === 'DELIVERY') delivery += 1;
      else dineIn += 1;
    });
    return { dineIn: dineIn, takeaway: takeaway, delivery: delivery };
  }

  function buildAdminStatsCardsHtml(opts) {
    opts = opts || {};
    var topLabel =
      opts.topProduct && opts.topProduct.name && opts.topProduct.count != null
        ? opts.topProduct.name + ' (' + opts.topProduct.count + ')'
        : opts.topProduct && opts.topProductCount
          ? opts.topProduct + ' (' + opts.topProductCount + ')'
          : '—';
    var dineIn = opts.dineInOrders != null ? opts.dineInOrders : 0;
    var takeaway = opts.takeawayOrders != null ? opts.takeawayOrders : 0;
    var delivery = opts.deliveryOrders != null ? opts.deliveryOrders : 0;
    var ordersLabel = opts.ordersLabel || 'مجموع طلبات اليوم';
    return (
      '<div class="stat-card"><span class="label">' +
      escapeHtml(ordersLabel) +
      '</span><span class="value">' +
      (opts.totalOrders != null ? opts.totalOrders : '0') +
      '</span></div>' +
      '<div class="stat-card"><span class="label">مجموع المبيعات</span><span class="value">' +
      formatMoney(opts.totalProfit != null ? opts.totalProfit : 0) +
      '</span></div>' +
      '<div class="stat-card"><span class="label">عدد المنتجات المباع</span><span class="value">' +
      (opts.itemsSold != null ? opts.itemsSold : '0') +
      '</span></div>' +
      '<div class="stat-card"><span class="label">أكثر منتج مبيعاً</span><span class="value long">' +
      escapeHtml(topLabel) +
      '</span></div>' +
      '<div class="stat-card"><span class="label">طلبات داخل الصالة</span><span class="value">' +
      dineIn +
      '</span></div>' +
      '<div class="stat-card"><span class="label">طلبات السفري</span><span class="value">' +
      takeaway +
      '</span></div>' +
      '<div class="stat-card"><span class="label">طلبات التوصيل</span><span class="value">' +
      delivery +
      '</span></div>'
    );
  }

  /** إحصائيات اليوم — 7 بطاقات */
  function renderStats(data) {
    if (!statsSection) return;
    if (!data) {
      statsSection.innerHTML = '';
      return;
    }
    var byType = countOrdersByTypeFromList(data.orders);
    statsSection.innerHTML = buildAdminStatsCardsHtml({
      totalOrders: data.ordersCountToday != null ? data.ordersCountToday : 0,
      totalProfit: data.revenueToday != null ? data.revenueToday : 0,
      itemsSold: data.itemsSoldToday != null ? data.itemsSoldToday : 0,
      topProduct: data.topProduct,
      dineInOrders:
        data.dineInOrdersToday != null ? data.dineInOrdersToday : byType.dineIn,
      takeawayOrders:
        data.takeawayOrdersToday != null ? data.takeawayOrdersToday : byType.takeaway,
      deliveryOrders:
        data.deliveryOrdersToday != null ? data.deliveryOrdersToday : byType.delivery,
    });
  }

  function renderArchiveStatsRow(data) {
    if (!archiveStatsRow) return;
    if (!data) {
      archiveStatsRow.innerHTML = '';
      return;
    }
    var byType = countOrdersByTypeFromList(data.orders);
    archiveStatsRow.innerHTML = buildAdminStatsCardsHtml({
      ordersLabel: 'عدد الطلبات',
      totalOrders: data.totalOrders != null ? data.totalOrders : 0,
      totalProfit: data.totalProfit != null ? data.totalProfit : 0,
      itemsSold: data.itemsSold != null ? data.itemsSold : 0,
      topProduct: data.topProduct,
      topProductCount: data.topProductCount,
      dineInOrders: data.dineInOrders != null ? data.dineInOrders : byType.dineIn,
      takeawayOrders: data.takeawayOrders != null ? data.takeawayOrders : byType.takeaway,
      deliveryOrders: data.deliveryOrders != null ? data.deliveryOrders : byType.delivery,
    });
  }

  /** تحميل إحصائيات الصفحة الرئيسية + كارت قاصة اليوم. أثناء وجود قاصة مفتوحة تُحسب الإحصائيات من جلسة القاصة (وليس تقويم «اليوم» فقط). */
  async function loadStats() {
    var todayStr = getTodayDateStr();
    var closingsList = null;
    try {
      var tillRes = await api.till.current();
      var tillData = tillRes && tillRes.till;
      var tillOpen = tillData && tillData.status === 'open' && !tillData.closedAt;
      if (tillOpen) {
        try {
          var liveStats = await api.stats.today();
          renderStats(liveStats);
        } catch (_) {
          renderStats(null);
        }
      } else {
        closingsList = await api.closings.list();
        var matchesToday = function (c) {
          if (!c) return false;
          var raw = c.open_date || c.date || c.closedAt || c.openedAt;
          if (!raw) return false;
          var d = String(raw).trim().split('T')[0].split(' ')[0];
          return d === todayStr;
        };
        var todayClosings = closingsList ? closingsList.filter(matchesToday) : [];
        var closingForToday = todayClosings.length > 0 ? todayClosings[todayClosings.length - 1] : null;
        if (closingForToday) {
          try {
            var report = await api.archive.report('day', todayStr);
            if (report && !report.sampleData && (report.orders || []).length > 0) {
              renderStats({
                ordersCountToday: report.totalOrders != null ? report.totalOrders : 0,
                revenueToday: report.totalProfit != null ? report.totalProfit : closingForToday.totalSales,
                itemsSoldToday: report.itemsSold != null ? report.itemsSold : 0,
                topProduct: report.topProduct != null && report.topProductCount != null
                  ? { name: report.topProduct, count: report.topProductCount }
                  : { name: '—', count: 0 },
                dineInOrdersToday: report.dineInOrders != null ? report.dineInOrders : 0,
                takeawayOrdersToday: report.takeawayOrders != null ? report.takeawayOrders : 0,
                deliveryOrdersToday: report.deliveryOrders != null ? report.deliveryOrders : 0,
                orders: report.orders,
              });
            } else {
              renderStats({
                ordersCountToday: closingForToday.orderCount != null ? closingForToday.orderCount : 0,
                revenueToday: closingForToday.totalSales != null ? closingForToday.totalSales : 0,
                itemsSoldToday: '—',
                topProduct: { name: '—', count: 0 },
              });
            }
          } catch (_) {
            renderStats({
              ordersCountToday: closingForToday.orderCount != null ? closingForToday.orderCount : 0,
              revenueToday: closingForToday.totalSales != null ? closingForToday.totalSales : 0,
              itemsSoldToday: '—',
              topProduct: { name: '—', count: 0 },
            });
          }
        } else {
          try {
            var data = await api.stats.today();
            renderStats(data);
          } catch (_) {
            renderStats(null);
          }
        }
      }
    } catch (_) {
      renderStats(null);
    }
    try {
      var list = closingsList || (await api.closings.list());
      var matchesTodayCard = function (c) {
        if (!c) return false;
        var raw = c.open_date || c.date || c.closedAt || c.openedAt;
        if (!raw) return false;
        var d = String(raw).trim().split('T')[0].split(' ')[0];
        return d === todayStr;
      };
      var cardClosings = list ? list.filter(matchesTodayCard) : [];
      var closingForTodayCard = cardClosings.length > 0 ? cardClosings[cardClosings.length - 1] : null;
      renderClosingCard(closingForTodayCard);
    } catch (_) {
      renderClosingCard(null);
    }
  }

  function getTodayDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  var lastClosingForDetail = null;

  /** تنسيق وقت بصيغة 12 ساعة مع ص/م (مثل 5:17 م) */
  function formatTime12h(timeStrOrIso) {
    if (!timeStrOrIso) return '—';
    var d;
    if (typeof timeStrOrIso === 'string' && timeStrOrIso.indexOf(':') !== -1 && timeStrOrIso.length <= 8) {
      var parts = timeStrOrIso.trim().split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) || 0;
      if (isNaN(h)) return timeStrOrIso;
      d = new Date(2000, 0, 1, h, m);
    } else {
      d = new Date(timeStrOrIso);
    }
    if (isNaN(d.getTime())) return '—';
    var h = d.getHours();
    var m = d.getMinutes();
    var am = h < 12 ? 'ص' : 'م';
    var h12 = h % 12 || 12;
    // استخدام مسافة غير قابلة للكسر قبل ص/م حتى لا ينفصل الحرف في سطر جديد
    return h12 + ':' + (m < 10 ? '0' : '') + m + '\u00A0' + am;
  }

  /** تنسيق تاريخ ووقت للعرض في نافذة التفاصيل */
  function formatClosingDateTime(isoOrDate, timeStr) {
    if (timeStr) return formatTime12h(timeStr);
    if (!isoOrDate) return '—';
    var d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return '—';
    var datePart = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    return datePart + ' — ' + formatTime12h(isoOrDate);
  }

  /** تنسيق التاريخ والوقت للعرض في كارت القاصة (تاريخ — ساعة 12h مع م/ص) */
  function formatClosingCardDateDisplay(dateStr, timeStr) {
    if (!dateStr) return '—';
    var timePart = timeStr ? formatTime12h(timeStr) : '';
    return timePart ? dateStr + ' — ' + timePart : dateStr;
  }

  /** مدة العمل بين فتح وإغلاق القاصة (ساعات ودقائق) */
  function formatDuration(openedAt, closedAt) {
    if (!openedAt || !closedAt) return '—';
    var start = new Date(openedAt);
    var end = new Date(closedAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
    var ms = end.getTime() - start.getTime();
    if (ms < 0) return '—';
    var totalMins = Math.floor(ms / 60000);
    var hours = Math.floor(totalMins / 60);
    var mins = totalMins % 60;
    if (hours > 0 && mins > 0) return hours + ' س ' + mins + ' د';
    if (hours > 0) return hours + ' س';
    return mins + ' د';
  }

  function openClosingDetail(c) {
    if (!c) return;
    var body = document.getElementById('closingDetailBody');
    var overlay = document.getElementById('closingDetailOverlay');
    if (!body || !overlay) return;

    var openTime = c.openedAt ? formatClosingDateTime(c.openedAt) : (c.open_time ? (c.date ? c.date + ' — ' : '') + formatTime12h(c.open_time) : (c.date && c.time ? c.date + ' — ' + formatTime12h(c.time) : (c.date || '—')));
    var closeTime = c.closedAt ? formatClosingDateTime(c.closedAt) : (c.close_time ? (c.date ? c.date + ' — ' : '') + formatTime12h(c.close_time) : (c.time ? formatTime12h(c.time) : '—'));

    var html = '';
    html += '<div class="closing-detail-grid">';
    html += '<div class="closing-detail-row"><span class="label">وقت فتح القاصة</span><span class="value value-datetime">' + escapeHtml(openTime) + '</span></div>';
    html += '<div class="closing-detail-row"><span class="label">وقت إغلاق القاصة</span><span class="value value-datetime">' + escapeHtml(closeTime) + '</span></div>';
    if (c.openedBy) html += '<div class="closing-detail-row"><span class="label">فتح القاصة</span><span class="value">' + escapeHtml(c.openedBy) + '</span></div>';
    html += '<div class="closing-detail-row"><span class="label">مبيعات الكاش</span><span class="value accent">' + formatMoney(c.salesCash != null ? c.salesCash : 0) + '</span></div>';
    html += '<div class="closing-detail-row"><span class="label">مبيعات البطاقة</span><span class="value accent">' + formatMoney(c.salesCard != null ? c.salesCard : 0) + '</span></div>';
    html += '<div class="closing-detail-row"><span class="label">إجمالي المبيعات</span><span class="value accent">' + formatMoney(c.totalSales != null ? c.totalSales : 0) + '</span></div>';
    html += '<div class="closing-detail-row"><span class="label">رصيد بداية اليوم</span><span class="value">' + formatMoney(c.openingBalance != null ? c.openingBalance : 0) + '</span></div>';
    html += '</div>';

    var expenses = Array.isArray(c.expenses) ? c.expenses : [];
    var totalExp = c.totalExpenses != null ? c.totalExpenses : expenses.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
    html += '<div class="closing-detail-section"><h4 class="closing-detail-section-title">المصروفات</h4>';
    if (expenses.length) {
      html += '<ul class="closing-detail-list">';
      expenses.forEach(function (e) {
        var name = (e.name || 'مصروف') + (e.note ? ' — ' + e.note : '');
        html += '<li><span class="item-name">' + escapeHtml(name) + '</span><span class="item-amount">' + formatMoney(e.amount || 0) + '</span></li>';
      });
      html += '</ul><div class="closing-detail-row"><span class="label">مجموع المصروفات</span><span class="value accent">' + formatMoney(totalExp) + '</span></div>';
    } else {
      html += '<div class="closing-detail-row"><span class="label">مجموع المصروفات</span><span class="value">' + formatMoney(totalExp) + '</span></div>';
    }
    html += '</div>';

    var withdrawals = Array.isArray(c.withdrawals) ? c.withdrawals : [];
    var totalWd = c.totalWithdrawals != null ? c.totalWithdrawals : withdrawals.reduce(function (s, w) { return s + (Number(w.amount) || 0); }, 0);
    html += '<div class="closing-detail-section"><h4 class="closing-detail-section-title">السحب من القاصة</h4>';
    if (withdrawals.length) {
      html += '<ul class="closing-detail-list">';
      withdrawals.forEach(function (w) {
        var note = w.note ? ' — ' + w.note : '';
        html += '<li><span class="item-name">سحب' + escapeHtml(note) + '</span><span class="item-amount">' + formatMoney(w.amount || 0) + '</span></li>';
      });
      html += '</ul><div class="closing-detail-row"><span class="label">مجموع السحب</span><span class="value accent">' + formatMoney(totalWd) + '</span></div>';
    } else {
      html += '<div class="closing-detail-row"><span class="label">مجموع السحب</span><span class="value">' + formatMoney(totalWd) + '</span></div>';
    }
    html += '</div>';

    html += '<div class="closing-detail-row"><span class="label">الصافي</span><span class="value accent">' + formatMoney(c.net != null ? c.net : 0) + '</span></div>';
    if (c.closedBy) html += '<div class="closing-detail-row"><span class="label">أغلق القاصة</span><span class="value">' + escapeHtml(c.closedBy) + '</span></div>';
    if (c.note) html += '<div class="closing-detail-row closing-detail-note"><span class="label">ملاحظة</span><span class="value">' + escapeHtml(c.note) + '</span></div>';

    body.innerHTML = html;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeClosingDetail() {
    var overlay = document.getElementById('closingDetailOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function renderClosingCard(c) {
    var section = document.getElementById('closingCardSection');
    if (!section) return;
    lastClosingForDetail = c;
    if (!c) {
      section.innerHTML = '';
      return;
    }
    var totalSales = Number(c.totalSales) || 0;
    var dateDisplay = formatClosingCardDateDisplay(c.date, c.time);
    section.innerHTML =
      '<div class="stat-card closing-till-card" role="button" tabindex="0" aria-label="عرض تفاصيل القاصة">' +
        '<span class="label">قاصة اليوم</span>' +
        '<span class="value closing-date">' + escapeHtml(dateDisplay) + '</span>' +
        '<div class="closing-row"><span class="label">إجمالي المبيعات</span><span class="value">' + formatMoney(totalSales) + '</span></div>' +
        (c.note ? '<div class="closing-row closing-note"><span class="label">ملاحظة</span><span class="value long">' + escapeHtml(c.note) + '</span></div>' : '') +
        '<div class="closing-card-hint">عرض التفاصيل</div>' +
      '</div>';
    var card = section.querySelector('.closing-till-card');
    if (card) {
      card.addEventListener('click', function () { openClosingDetail(lastClosingForDetail); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClosingDetail(lastClosingForDetail); } });
    }
  }

  function setReportsDateline() {
    var el = document.getElementById('reportsDateline');
    if (!el) return;
    var d = new Date();
    var day = d.toLocaleDateString('ar-IQ-u-ca-gregory', { weekday: 'long' });
    var date = d.toLocaleDateString('en-GB-u-ca-gregory', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    el.textContent = 'تقرير يوم ' + day + ' ' + date;
  }

  var placeholderImg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%232e333b%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%229aa0a6%22 font-size=%2212%22%3Eبدون صورة%3C/text%3E%3C/svg%3E';

  /** عدد عناصر المنيو لكل تصنيف */
  function getCountByCategory(items) {
    var countBy = {};
    if (items && items.length) {
      items.forEach(function (item) {
        var key = item.category != null ? String(item.category).trim() : '';
        countBy[key] = (countBy[key] || 0) + 1;
      });
    }
    return countBy;
  }

  /** دمج تصنيفات الـ API مع تصنيفات المستخدمة في المنيو + العدد */
  function mergeCategoriesWithCounts(apiList, menuItems) {
    var countBy = getCountByCategory(menuItems);
    var seen = {};
    var list = [];
    (apiList || []).forEach(function (entry) {
      var id = typeof entry === 'object' && entry && entry.name != null ? String(entry.name).trim() : String(entry).trim();
      var imageUrl = null;
      if (typeof entry === 'object' && entry && entry.imageUrl) {
        imageUrl = String(entry.imageUrl).trim() || null;
      }
      if (id && !seen[id]) {
        seen[id] = true;
        list.push({ id: id, name: id, imageUrl: imageUrl, count: countBy[id] || 0, fromApi: true });
      }
    });
    Object.keys(countBy).forEach(function (id) {
      if (!seen[id]) {
        seen[id] = true;
        list.push({ id: id, name: id === '' ? 'بدون تصنيف' : id, imageUrl: null, count: countBy[id] || 0, fromApi: false });
      }
    });
    list.sort(function (a, b) {
      if (a.id === '') return 1;
      if (b.id === '') return -1;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
    return list;
  }

  function showCategoriesView() {
    if (menuCategoriesWrap) menuCategoriesWrap.style.display = '';
    if (menuCategoryDetail) menuCategoryDetail.style.display = 'none';
    if (menuPageTitle) menuPageTitle.textContent = 'عرض تصنيفات';
    if (btnAddCategory) btnAddCategory.style.display = '';
    if (btnAddMenuItem) btnAddMenuItem.style.display = 'none';
  }

  function getSelectedCategoryImageUrl() {
    var found = (lastCategoriesWithCounts || []).find(function (c) { return c.id === selectedCategory; });
    return found && found.imageUrl ? found.imageUrl : null;
  }

  function updateCategoryImageDialog(url) {
    var base = window.API_BASE || '';
    var hasImage = !!url;
    if (menuCategoryImagePreview) {
      menuCategoryImagePreview.style.display = hasImage ? 'block' : 'none';
      menuCategoryImagePreview.src = hasImage ? base + url : '';
      menuCategoryImagePreview.alt = selectedCategory ? ('صورة تصنيف ' + selectedCategory) : 'صورة التصنيف';
    }
    if (categoryImageEmpty) categoryImageEmpty.style.display = hasImage ? 'none' : 'flex';
    if (btnRemoveCategoryImage) btnRemoveCategoryImage.style.display = hasImage ? 'inline-flex' : 'none';
    if (btnCategoryImageChange) btnCategoryImageChange.textContent = hasImage ? 'تغيير صورة' : 'إضافة صورة';
  }

  function openCategoryImageDialog() {
    if (!categoryImageOverlay) return;
    var hideImageActions = selectedCategory === '' || selectedCategory == null;
    if (hideImageActions) return;
    updateCategoryImageDialog(getSelectedCategoryImageUrl());
    categoryImageOverlay.style.display = 'flex';
    categoryImageOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeCategoryImageDialog() {
    if (!categoryImageOverlay) return;
    categoryImageOverlay.style.display = 'none';
    categoryImageOverlay.setAttribute('aria-hidden', 'true');
  }

  function updateCategoryImageToolbar() {
    if (!btnPickCategoryImage) return;
    var hideImageActions = selectedCategory === '' || selectedCategory == null;
    if (hideImageActions) {
      btnPickCategoryImage.style.display = 'none';
      closeCategoryImageDialog();
      return;
    }
    btnPickCategoryImage.style.display = 'inline-flex';
    var hasImage = !!getSelectedCategoryImageUrl();
    btnPickCategoryImage.textContent = hasImage ? 'تغيير صورة تصنيف' : 'إضافة صورة لتصنيف';
    updateCategoryImageDialog(getSelectedCategoryImageUrl());
  }

  function showCategoryDetailView(categoryKey) {
    if (menuCategoriesWrap) menuCategoriesWrap.style.display = 'none';
    if (menuCategoryDetail) menuCategoryDetail.style.display = 'block';
    var displayName = categoryKey === '' ? 'بدون تصنيف' : categoryKey;
    if (menuPageTitle) menuPageTitle.textContent = 'عرض تصنيفات';
    if (menuCategoryDetailTitle) menuCategoryDetailTitle.textContent = displayName;
    if (btnAddCategory) btnAddCategory.style.display = 'none';
    if (btnAddMenuItem) btnAddMenuItem.style.display = 'flex';
    updateCategoryImageToolbar();
  }

  function renderCategoryCards(categories) {
    if (!menuCategoryCards) return;
    if (!categories || !categories.length) {
      menuCategoryCards.innerHTML = '';
      if (emptyCategories) emptyCategories.style.display = 'block';
      return;
    }
    if (emptyCategories) emptyCategories.style.display = 'none';
    var base = window.API_BASE || '';
    menuCategoryCards.innerHTML = categories.map(function (c) {
      var label = c.count === 1 ? 'عنصر' : 'عناصر';
      var src = c.imageUrl ? base + escapeHtml(c.imageUrl) : placeholderImg;
      var thumb =
        '<div class="menu-category-card__thumb">' +
          '<img src="' +
          src +
          '" alt="' +
          escapeHtml(c.name) +
          '" loading="lazy" decoding="async" width="400" height="300"/>' +
        '</div>';
      return '<div class="menu-category-card" data-category="' + escapeHtml(c.id) + '">' +
        thumb +
        '<span class="category-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="category-count">' + c.count + ' ' + label + '</span>' +
        '</div>';
    }).join('');
    menuCategoryCards.querySelectorAll('.menu-category-card').forEach(function (card) {
      card.addEventListener('click', function () {
        selectedCategory = card.dataset.category;
        var filtered = allMenuItems.filter(function (item) {
          var cat = item.category != null ? String(item.category).trim() : '';
          return cat === selectedCategory;
        });
        showCategoryDetailView(selectedCategory);
        renderMenu(filtered);
      });
    });
  }

  function renderMenu(items) {
    if (!menuList) return;
    if (!items || !items.length) {
      menuList.innerHTML = '';
      if (emptyMenu) emptyMenu.style.display = 'block';
      return;
    }
    if (emptyMenu) emptyMenu.style.display = 'none';
    var base = window.API_BASE || '';
    menuList.innerHTML = items.map(function (item) {
      return '<div class="menu-card-admin">' +
        '<img src="' + ((item.imageUrl && base + item.imageUrl) || placeholderImg) + '" alt="' + escapeHtml(item.name) + '">' +
        '<div class="body">' +
          '<div class="name">' + escapeHtml(item.name) + '</div>' +
          '<div class="meta">' + escapeHtml(item.category || '—') + '</div>' +
          '<div class="price">' + formatMoney(item.price) + '</div>' +
          '<div class="actions">' +
            '<button type="button" class="btn btn-sm btn-secondary" data-edit="' + escapeHtml(item.id) + '">تعديل</button>' +
            '<button type="button" class="btn btn-sm btn-danger" data-delete="' + escapeHtml(item.id) + '">حذف</button>' +
          '</div>' +
        '</div></div>';
    }).join('');
    menuList.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = items.find(function (i) { return i.id === btn.dataset.edit; });
        if (item) {
          setEditMode(item);
          switchToPage('add-item');
        }
      });
    });
    menuList.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!(await (window.CafeDialog && CafeDialog.confirm ? CafeDialog.confirm('حذف هذا العنصر؟') : Promise.resolve(confirm('حذف هذا العنصر؟'))))) return;
        try {
          await api.menu.delete(btn.dataset.delete);
          showToast('تم الحذف');
          loadMenu();
          loadStats();
        } catch (err) {
          showToast(err.json && err.json.error ? err.json.error : err.message);
        }
      });
    });
  }

  function fillCategorySelect(categories) {
    if (!itemCategory) return;
    itemCategory.innerHTML = '<option value="">— اختر —</option>' +
      (categories || []).map(function (c) {
        return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
      }).join('');
  }

  function openAddCategoryModal() {
    if (addCategoryOverlay) addCategoryOverlay.style.display = 'flex';
    if (addCategoryInput) {
      addCategoryInput.value = '';
      addCategoryInput.focus();
    }
  }
  function closeAddCategoryModal() {
    if (addCategoryOverlay) addCategoryOverlay.style.display = 'none';
  }

  var pendingDeleteCategoryName = null;
  function openDeleteCategoryModal(categoryName, itemCount) {
    pendingDeleteCategoryName = categoryName || '';
    var displayName = categoryName || 'بدون تصنيف';
    var count = itemCount != null ? itemCount : 0;
    var countText = count === 0 ? 'لا يوجد فيه منتجات.' : 'عدد المنتجات فيه: ' + count + ' — سيتم حذفها نهائياً.';
    if (deleteCategoryMessage) {
      deleteCategoryMessage.innerHTML = 'سيتم حذف التصنيف <strong>«' + escapeHtml(displayName) + '»</strong> وجميع المنتجات فيه. ' + countText + '<br><span class="delete-warning-hint">لا يمكن التراجع عن الحذف.</span>';
    }
    if (deleteCategoryOverlay) {
      deleteCategoryOverlay.style.display = 'flex';
      deleteCategoryOverlay.setAttribute('aria-hidden', 'false');
    }
  }
  function closeDeleteCategoryModal() {
    pendingDeleteCategoryName = null;
    if (deleteCategoryOverlay) {
      deleteCategoryOverlay.style.display = 'none';
      deleteCategoryOverlay.setAttribute('aria-hidden', 'true');
    }
  }
  function confirmDeleteCategory() {
    if (pendingDeleteCategoryName == null) return;
    var name = pendingDeleteCategoryName;
    closeDeleteCategoryModal();
    api.categories.delete(name).then(function () {
      showToast('تم حذف التصنيف');
      selectedCategory = null;
      loadMenu();
    }).catch(function (err) {
      showToast(err.json && err.json.error ? err.json.error : err.message);
    });
  }
  if (btnDeleteCategoryCancel) btnDeleteCategoryCancel.addEventListener('click', closeDeleteCategoryModal);
  if (btnDeleteCategoryClose) btnDeleteCategoryClose.addEventListener('click', closeDeleteCategoryModal);
  if (btnDeleteCategoryConfirm) btnDeleteCategoryConfirm.addEventListener('click', confirmDeleteCategory);
  if (deleteCategoryOverlay) {
    deleteCategoryOverlay.addEventListener('click', function (e) {
      if (e.target === deleteCategoryOverlay) closeDeleteCategoryModal();
    });
  }

  function openRenameCategoryModal() {
    var displayName = selectedCategory === '' ? 'بدون تصنيف' : (selectedCategory || '');
    if (renameCategoryInput) {
      renameCategoryInput.value = displayName;
      renameCategoryInput.focus();
    }
    if (renameCategoryOverlay) renameCategoryOverlay.style.display = 'flex';
  }
  function closeRenameCategoryModal() {
    if (renameCategoryOverlay) renameCategoryOverlay.style.display = 'none';
  }
  function submitRenameCategory() {
    var newName = renameCategoryInput ? renameCategoryInput.value.trim() : '';
    if (!newName) {
      showToast('أدخل الاسم الجديد');
      return;
    }
    var oldName = selectedCategory === undefined ? '' : selectedCategory;
    closeRenameCategoryModal();
    api.categories.rename(oldName, newName).then(function () {
      showToast('تم تغيير اسم التصنيف');
      selectedCategory = newName;
      loadMenu();
    }).catch(function (err) {
      showToast(err.json && err.json.error ? err.json.error : err.message);
    });
  }
  if (btnEditCategoryName) btnEditCategoryName.addEventListener('click', openRenameCategoryModal);
  if (btnRenameCategoryCancel) btnRenameCategoryCancel.addEventListener('click', closeRenameCategoryModal);
  if (btnRenameCategoryClose) btnRenameCategoryClose.addEventListener('click', closeRenameCategoryModal);
  if (btnRenameCategorySubmit) btnRenameCategorySubmit.addEventListener('click', submitRenameCategory);
  if (renameCategoryOverlay) {
    renameCategoryOverlay.addEventListener('click', function (e) {
      if (e.target === renameCategoryOverlay) closeRenameCategoryModal();
    });
  }
  if (renameCategoryInput) {
    renameCategoryInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitRenameCategory(); }
    });
  }

  if (btnDeleteCategoryOutside) {
    btnDeleteCategoryOutside.addEventListener('click', function () {
      var count = 0;
      if (selectedCategory !== undefined && selectedCategory !== null) {
        count = allMenuItems.filter(function (item) {
          var cat = item.category != null ? String(item.category).trim() : '';
          return cat === selectedCategory;
        }).length;
      }
      openDeleteCategoryModal(selectedCategory || '', count);
    });
  }

  var coverPreviewObjectUrl = null;
  var coverUploadToken = 0;

  function revokeCoverObjectUrl() {
    if (!coverPreviewObjectUrl) return;
    try { URL.revokeObjectURL(coverPreviewObjectUrl); } catch (_) {}
    coverPreviewObjectUrl = null;
  }

  function setCoverButtonsDisabled(disabled) {
    if (btnPickCategoryImage) btnPickCategoryImage.disabled = !!disabled;
    if (btnCategoryImageChange) btnCategoryImageChange.disabled = !!disabled;
    if (btnRemoveCategoryImage) btnRemoveCategoryImage.disabled = !!disabled;
    if (btnCategoryImageCloseX) btnCategoryImageCloseX.disabled = !!disabled;
  }

  function showCoverPreviewFromBlob(blobUrl) {
    if (menuCategoryImagePreview) {
      menuCategoryImagePreview.style.display = 'block';
      menuCategoryImagePreview.src = blobUrl;
    }
    if (categoryImageEmpty) categoryImageEmpty.style.display = 'none';
    if (categoryImagePreviewBox) categoryImagePreviewBox.classList.add('is-loading');
  }

  async function uploadCoverFile(file) {
    if (!file) return;
    if (selectedCategory === '' || selectedCategory == null) return;
    if (!api.categories || !api.categories.setImage) {
      showToast('خاصية الصورة غير متوفرة');
      return;
    }

    var token = ++coverUploadToken;
    try {
      setCoverButtonsDisabled(true);

      // معاينة فورية قبل رفع الصورة
      revokeCoverObjectUrl();
      coverPreviewObjectUrl = URL.createObjectURL(file);
      showCoverPreviewFromBlob(coverPreviewObjectUrl);

      var uploadedUrl = await api.uploadImage(file);
      await api.categories.setImage(selectedCategory, uploadedUrl);

      showToast('تم تحديث صورة الغلاف');
      if (token !== coverUploadToken) return;
      await loadMenu();
    } catch (err) {
      showToast(err.json && err.json.error ? err.json.error : err.message || 'فشل رفع الصورة');
    } finally {
      setCoverButtonsDisabled(false);
      revokeCoverObjectUrl();
      if (categoryImagePreviewBox) categoryImagePreviewBox.classList.remove('is-loading');
      updateCategoryImageToolbar();
    }
  }

  async function removeCoverImage() {
    if (selectedCategory === '' || selectedCategory == null) return;
    if (!api.categories || !api.categories.setImage) {
      showToast('خاصية الصورة غير متوفرة');
      return;
    }
    try {
      setCoverButtonsDisabled(true);
      if (categoryImagePreviewBox) categoryImagePreviewBox.classList.add('is-loading');
      await api.categories.setImage(selectedCategory, null);
      showToast('تمت إزالة صورة الغلاف');
      await loadMenu();
    } catch (err) {
      showToast(err.json && err.json.error ? err.json.error : err.message || 'فشل الإزالة');
    } finally {
      setCoverButtonsDisabled(false);
      if (categoryImagePreviewBox) categoryImagePreviewBox.classList.remove('is-loading');
      updateCategoryImageToolbar();
    }
  }

  if (btnPickCategoryImage && menuCategoryImageInput) {
    btnPickCategoryImage.addEventListener('click', function (e) {
      e.stopPropagation();
      openCategoryImageDialog();
    });
  }
  if (btnCategoryImageChange && menuCategoryImageInput) {
    btnCategoryImageChange.addEventListener('click', function () {
      menuCategoryImageInput.click();
    });
  }
  if (btnCategoryImageCloseX) btnCategoryImageCloseX.addEventListener('click', closeCategoryImageDialog);
  if (categoryImageOverlay) {
    categoryImageOverlay.addEventListener('click', function (e) {
      if (e.target === categoryImageOverlay) closeCategoryImageDialog();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && categoryImageOverlay && categoryImageOverlay.style.display === 'flex') {
      closeCategoryImageDialog();
    }
  });

  // رفع بالاختيار
  if (menuCategoryImageInput) {
    menuCategoryImageInput.addEventListener('change', async function () {
      var file = this.files && this.files[0] ? this.files[0] : null;
      this.value = '';
      if (!file) return;
      await uploadCoverFile(file);
    });
  }

  if (btnRemoveCategoryImage) {
    btnRemoveCategoryImage.addEventListener('click', async function (e) {
      e.stopPropagation();
      await removeCoverImage();
    });
  }

  async function loadMenu() {
    try {
      var apiCatPromise = (api.categories && api.categories.list)
        ? api.categories.list().catch(function () { return []; })
        : Promise.resolve([]);
      var [items, apiCategoriesRaw] = await Promise.all([
        api.menu.list(),
        apiCatPromise
      ]);
      allMenuItems = items || [];
      var apiCategories = Array.isArray(apiCategoriesRaw) ? apiCategoriesRaw : [];
      var categoriesWithCounts = mergeCategoriesWithCounts(apiCategories, allMenuItems);
      lastCategoriesWithCounts = categoriesWithCounts;
      fillCategorySelect(categoriesWithCounts);
      if (selectedCategory === null) {
        showCategoriesView();
        renderCategoryCards(categoriesWithCounts);
      } else {
        var filtered = allMenuItems.filter(function (item) {
          var cat = item.category != null ? String(item.category).trim() : '';
          return cat === selectedCategory;
        });
        showCategoryDetailView(selectedCategory);
        renderMenu(filtered);
      }
    } catch (_) {
      allMenuItems = [];
      if (menuCategoryCards) menuCategoryCards.innerHTML = '';
      if (emptyCategories) emptyCategories.style.display = 'block';
      if (menuList) menuList.innerHTML = '';
      if (emptyMenu) emptyMenu.style.display = 'block';
    }
  }

  /** تنسيق الوقت: 12 ساعة بأرقام إنجليزي مع ص/م */
  function formatTime(d) {
    var h = d.getHours();
    var m = d.getMinutes();
    var am = h < 12;
    var h12 = h % 12 || 12;
    var suffix = am ? ' ص' : ' م';
    return h12 + ':' + (m < 10 ? '0' : '') + m + suffix;
  }
  /** تنسيق التاريخ: أرقام عادية (يوم/شهر/سنة) */
  function formatDateNormal(d) {
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = d.getFullYear();
    return day + '/' + month + '/' + year;
  }
  /** نص واحد للتاريخ والوقت (وصل، نصوص أخرى) */
  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return formatTime(d) + ' · ' + formatDateNormal(d);
  }
  /** HTML لعرض التاريخ والوقت في الجدول/البطاقة — سطران مرتبان */
  function formatDateTimeBlock(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var time = formatTime(d);
    var date = formatDateNormal(d);
    return '<span class="date-time-block"><span class="date-time-time">' + escapeHtml(time) + '</span><span class="date-time-date">' + escapeHtml(date) + '</span></span>';
  }

  /** رقم الطلب للعرض في الوصل: T1-001 أو — */
  function getOrderIdDisplay(order) {
    if (!order || !order.id || typeof order.id !== 'string') return '—';
    if (/^T\d+-\d{1,}$/.test(order.id.trim())) return order.id.trim();
    return '—';
  }

  /** تاريخ ووقت للوصل بنفس شكل الكاشير (يوم/شهر/سنة ساعة:دقيقة ص/م) */
  function formatReceiptDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var dateStr = formatDateNormal(d);
    var timeStr = formatTime(d);
    return dateStr + ' ' + timeStr;
  }

  function openReceipt(order) {
    var total = order.total != null ? order.total : (order.items || []).reduce(function (s, it) { return s + (it.price || 0) * (it.quantity || 0); }, 0);
    if (receiptTableNum) receiptTableNum.textContent = 'طاولة ' + (order.tableId || '');
    if (receiptDate) receiptDate.textContent = formatReceiptDateTime(order.closedAt || order.createdAt);
    if (receiptOrderId) receiptOrderId.textContent = 'رقم الطلب: ' + getOrderIdDisplay(order);
    if (receiptItems) {
      receiptItems.innerHTML = (order.items || []).map(function (it) {
        return '<tr><td class="col-name">' + escapeHtml(it.name || '') + '</td><td class="col-qty">' + (it.quantity || 0) + '</td><td class="col-price">' + formatMoney(it.price || 0) + '</td></tr>';
      }).join('');
    }
    if (receiptTotal) receiptTotal.textContent = 'المجموع الكلي: ' + formatMoney(total);
    receiptOverlay.classList.add('open');
  }

  btnCloseReceipt.addEventListener('click', function () { receiptOverlay.classList.remove('open'); });
  receiptOverlay.addEventListener('click', function (e) { if (e.target === receiptOverlay) receiptOverlay.classList.remove('open'); });
  btnPrintReceipt.addEventListener('click', function () { window.print(); });

  var todaySessionReceiptCloseX = document.getElementById('todaySessionReceiptCloseX');
  if (todaySessionReceiptCloseX) {
    todaySessionReceiptCloseX.addEventListener('click', closeTodaySessionReceiptModal);
  }
  if (todaySessionReceiptOverlay) {
    todaySessionReceiptOverlay.addEventListener('click', function (e) {
      if (e.target === todaySessionReceiptOverlay) closeTodaySessionReceiptModal();
    });
  }
  var cashierTableOrderDetailCloseX = document.getElementById('cashierTableOrderDetailCloseX');
  if (cashierTableOrderDetailCloseX) {
    cashierTableOrderDetailCloseX.addEventListener('click', closeCashierTableOrderDetailModal);
  }
  if (cashierTableOrderDetailOverlay) {
    cashierTableOrderDetailOverlay.addEventListener('click', function (e) {
      if (e.target === cashierTableOrderDetailOverlay) closeCashierTableOrderDetailModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (cashierTableOrderDetailOverlay && cashierTableOrderDetailOverlay.classList.contains('open')) {
      closeCashierTableOrderDetailModal();
      return;
    }
    if (todaySessionReceiptOverlay && todaySessionReceiptOverlay.classList.contains('open')) {
      closeTodaySessionReceiptModal();
    }
  });

  var btnCloseClosingDetail = document.getElementById('btnCloseClosingDetail');
  var closingDetailOverlay = document.getElementById('closingDetailOverlay');
  if (btnCloseClosingDetail) btnCloseClosingDetail.addEventListener('click', closeClosingDetail);
  if (closingDetailOverlay) closingDetailOverlay.addEventListener('click', function (e) { if (e.target === closingDetailOverlay) closeClosingDetail(); });

  function normalizeOrderTypeAdmin(order) {
    if (!order) return 'DINE_IN';
    if (order.orderType === 'TAKEAWAY' || order.orderType === 'DELIVERY') return order.orderType;
    var tid = String(order.tableId != null ? order.tableId : order.table != null ? order.table : '');
    if (tid === 'TAKEAWAY') return 'TAKEAWAY';
    if (tid === 'DELIVERY') return 'DELIVERY';
    return 'DINE_IN';
  }

  function orderTypeLabelArAdmin(t) {
    if (t === 'TAKEAWAY') return 'سفري';
    if (t === 'DELIVERY') return 'دلفري';
    return 'صالة';
  }

  function todayPaymentMethodLabel(method) {
    return (method || 'cash').toLowerCase() === 'card' ? 'ماستر كارد' : 'كاش';
  }

  function todayPaymentMethodClass(method) {
    return (method || 'cash').toLowerCase() === 'card' ? 'payment-card' : 'payment-cash';
  }

  function orderSectionLabel(idx) {
    var n = idx + 1;
    if (n === 1) return 'الطلب الأول';
    if (n === 2) return 'الطلب الثاني';
    if (n === 3) return 'الطلب الثالث';
    return 'الطلب ' + n;
  }

  function formatSessionTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return formatTime(d);
  }

  function normalizeArchiveOrder(o) {
    var items = (o.items || []).map(function (it) {
      return {
        name: it.name,
        quantity: it.qty != null ? it.qty : it.quantity || 1,
        price: it.price || 0,
      };
    });
    var total =
      o.total != null
        ? o.total
        : items.reduce(function (s, it) {
            return s + (it.price || 0) * (it.quantity || 0);
          }, 0);
    var tableId = o.tableId != null ? String(o.tableId) : o.table != null ? String(o.table) : '';
    return {
      id: o.id,
      tableId: tableId,
      total: total,
      items: items,
      createdAt: o.createdAt || o.closedAt || null,
      closedAt: o.closedAt || null,
      paymentMethod: o.paymentMethod || 'cash',
      orderType: o.orderType,
    };
  }

  function closedAtSecondBucketAdmin(iso) {
    if (!iso) return 'unknown';
    var t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 'unknown';
    return String(Math.floor(t / 1000));
  }

  function buildSessionsFromArchiveOrders(orders) {
    var norm = (orders || []).map(normalizeArchiveOrder);
    var byKey = {};
    norm.forEach(function (o) {
      var orderType = normalizeOrderTypeAdmin(o);
      var tableId = String(o.tableId || '');
      var pay = (o.paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
      var bucket = closedAtSecondBucketAdmin(o.closedAt);
      var key =
        orderType === 'DINE_IN'
          ? 'D:' + tableId + ':' + bucket + ':' + pay
          : 'T:' + tableId + ':' + o.id + ':' + bucket + ':' + pay;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(o);
    });
    return Object.keys(byKey).map(function (key) {
      var matched = byKey[key].slice().sort(function (a, b) {
        var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });
      var orderType = normalizeOrderTypeAdmin(matched[0]);
      var tableId =
        orderType === 'DINE_IN' ? String(matched[0].tableId || '') : String(matched[0].tableId || orderType);
      var payMethod = (matched[0].paymentMethod || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
      var orderSnapshots = matched.map(function (o, i) {
        return {
          orderId: o.id,
          displayOrderId: getOrderIdDisplay(o) !== '—' ? getOrderIdDisplay(o) : String(o.id || ''),
          orderIndex: i,
          createdAt: o.createdAt,
          closedAt: o.closedAt,
          total: o.total,
          items: o.items,
        };
      });
      var paymentAt = matched.reduce(function (max, o) {
        var t = o.closedAt || o.createdAt;
        if (!t) return max;
        if (!max || new Date(t) > new Date(max)) return t;
        return max;
      }, null);
      var displayId = getOrderIdDisplay(matched[0]);
      if (displayId === '—') displayId = String(matched[0].id || '');
      return {
        id: 'arc_' + key,
        displayId: displayId,
        tableId: tableId,
        orderType: orderType,
        orderCount: orderSnapshots.length,
        firstOrderAt: matched[0].createdAt,
        paymentAt: paymentAt,
        paymentMethod: payMethod,
        totalAmount: orderSnapshots.reduce(function (s, x) {
          return s + (Number(x.total) || 0);
        }, 0),
        orders: orderSnapshots,
      };
    });
  }

  function groupTodaySessionsByTable(sessions) {
    var byKey = {};
    (sessions || []).forEach(function (sess) {
      var orderType = normalizeOrderTypeAdmin(sess);
      var groupKey =
        orderType === 'DINE_IN'
          ? 'T:' + String(sess.tableId != null ? sess.tableId : '')
          : 'TYPE:' + orderType;
      if (!byKey[groupKey]) {
        byKey[groupKey] = {
          tableId: String(sess.tableId != null ? sess.tableId : ''),
          orderType: orderType,
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
        sessions: list,
        total: total,
        lastPaymentAt: lastAt,
        sessionCount: list.length,
        orderCount: orderCount,
      };
    });
  }

  function renderSessionsGroupedList(container, sessions, emptyEl) {
    if (!container) return;
    if (!sessions || !sessions.length) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    displaySessionsList = sessions;
    var grouped = groupTodaySessionsByTable(sessions);
    container.innerHTML = grouped
      .map(function (g, idx) {
        var cardId = 'sess-card-' + idx;
        var lastTimeText = g.lastPaymentAt ? formatDateTime(g.lastPaymentAt) : '—';
        var isDineIn = normalizeOrderTypeAdmin({ orderType: g.orderType, tableId: g.tableId }) === 'DINE_IN';
        var headTitle = isDineIn
          ? 'طاولة ' + escapeHtml(g.tableId)
          : 'طلبات ' + escapeHtml(orderTypeLabelArAdmin(g.orderType));
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
              escapeHtml(formatSessionTime(sess.firstOrderAt)) +
              '</td>' +
              '<td>' +
              escapeHtml(formatSessionTime(sess.paymentAt)) +
              '</td>' +
              '<td class="col-amount">' +
              formatMoney(Number(sess.totalAmount) || 0) +
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
          formatMoney(g.total) +
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

    container.querySelectorAll('.today-table-card-head').forEach(function (head) {
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
    container.querySelectorAll('.btn-today-session-receipt').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var sid = btn.getAttribute('data-session-id');
        var sess = displaySessionsList.find(function (s) {
          return String(s.id) === String(sid);
        });
        if (sess) openTodaySessionReceiptModal(sess);
      });
    });
  }

  function openTodaySessionOrderDetail(orderSnap, orderLabel) {
    if (!cashierTableOrderDetailOverlay || !orderSnap) return;
    if (cashierTableOrderDetailTitle) cashierTableOrderDetailTitle.textContent = orderLabel;
    if (cashierTableOrderDetailSubtitle) cashierTableOrderDetailSubtitle.textContent = '';
    var rows = (orderSnap.items || [])
      .map(function (item) {
        var qty = Number(item.quantity) || 0;
        var price = Number(item.price) || 0;
        return (
          '<tr><td class="col-name">' +
          escapeHtml(item.name || '') +
          '</td><td class="col-qty">' +
          qty +
          '</td><td>' +
          formatMoney(price) +
          '</td><td class="col-line-sub">' +
          formatMoney(qty * price) +
          '</td></tr>'
        );
      })
      .join('');
    if (cashierTableOrderDetailBody) {
      cashierTableOrderDetailBody.innerHTML = rows
        ? rows
        : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">لا أصناف</td></tr>';
    }
    if (cashierTableOrderDetailTotal) {
      cashierTableOrderDetailTotal.textContent =
        'المجموع: ' + formatMoney(Number(orderSnap.total) || 0);
    }
    cashierTableOrderDetailOverlay.classList.add('open');
    cashierTableOrderDetailOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeCashierTableOrderDetailModal() {
    if (!cashierTableOrderDetailOverlay) return;
    cashierTableOrderDetailOverlay.classList.remove('open');
    cashierTableOrderDetailOverlay.setAttribute('aria-hidden', 'true');
  }

  function closeTodaySessionReceiptModal() {
    if (cashierTableOrderDetailOverlay && cashierTableOrderDetailOverlay.classList.contains('open')) {
      closeCashierTableOrderDetailModal();
    }
    if (!todaySessionReceiptOverlay) return;
    currentTodaySessionReceipt = null;
    todaySessionReceiptOverlay.classList.remove('open');
    todaySessionReceiptOverlay.setAttribute('aria-hidden', 'true');
  }

  function openTodaySessionReceiptModal(session) {
    var titleEl = document.getElementById('todaySessionReceiptTitle');
    var ordersEl = document.getElementById('todaySessionReceiptOrders');
    var totalEl = document.getElementById('todaySessionReceiptTotal');
    var payEl = document.getElementById('todaySessionReceiptPayment');
    if (!todaySessionReceiptOverlay || !session) return;
    currentTodaySessionReceipt = session;
    if (titleEl) titleEl.textContent = 'رقم الطلب: ' + (session.displayId || '—');
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
            escapeHtml(formatSessionTime(ord.createdAt)) +
            '</span>' +
            '<span class="today-session-order-row__amount">' +
            formatMoney(Number(ord.total) || 0) +
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
          if (ord) openTodaySessionOrderDetail(ord, orderSectionLabel(ix));
        });
      });
    }
    if (totalEl) {
      totalEl.textContent = 'الإجمالي النهائي: ' + formatMoney(Number(session.totalAmount) || 0);
    }
    if (payEl) {
      payEl.textContent = 'طريقة الدفع: ' + todayPaymentMethodLabel(session.paymentMethod);
    }
    todaySessionReceiptOverlay.classList.add('open');
    todaySessionReceiptOverlay.setAttribute('aria-hidden', 'false');
  }

  async function resolveSessionsForReport(type, dateVal, fallbackOrders) {
    var sessions = [];
    try {
      if (api.orders.todaySessions && typeof api.orders.todaySessions.report === 'function') {
        sessions = await api.orders.todaySessions.report(type, dateVal);
        if (!Array.isArray(sessions)) sessions = [];
      }
    } catch (_) {
      sessions = [];
    }
    if (!sessions.length && fallbackOrders && fallbackOrders.length) {
      sessions = buildSessionsFromArchiveOrders(fallbackOrders);
    }
    return sessions;
  }

  function renderTodayOrders(orders) {
    if (!todayGroupedList) return;
    var todayStr = getTodayDateStr();
    resolveSessionsForReport('day', todayStr, orders || [])
      .then(function (sessions) {
        renderSessionsGroupedList(todayGroupedList, sessions, emptyOrders);
      })
      .catch(function () {
        if (todayGroupedList) todayGroupedList.innerHTML = '';
        if (emptyOrders) emptyOrders.style.display = 'block';
      });
  }

  /** عرض آخر قاصة في صفحة «مجموع طلبات اليوم» (نظام الإغلاق اليومي — لا تفاصيل طلبات). */
  function renderLastClosingCard(c) {
    if (!todayGroupedList) return;
    emptyOrders.style.display = 'none';
    var totalSales = Number(c.totalSales) || 0;
    todayGroupedList.innerHTML =
      '<div class="today-table-card today-closing-card expanded">' +
        '<div class="today-table-card-head">' +
          '<div><span class="table-num">قاصة ' + escapeHtml(c.date || '') + '</span><span class="table-meta">' + (c.time ? ' — ' + escapeHtml(c.time) : '') + '</span></div>' +
          '<span class="table-total">' + formatMoney(totalSales) + '</span>' +
        '</div>' +
        '<div class="today-table-card-detail">' +
          '<table class="today-detail-table"><tbody>' +
            '<tr><td>إجمالي المبيعات</td><td class="col-amount">' + formatMoney(totalSales) + '</td></tr>' +
            (c.note ? '<tr><td colspan="2">ملاحظة: ' + escapeHtml(c.note) + '</td></tr>' : '') +
          '</tbody></table></div></div>';
  }

  async function loadTodayOrders() {
    var todayStr = getTodayDateStr();
    try {
      var [list, fallbackOrders] = await Promise.all([
        api.closings.list().catch(function () { return null; }),
        api.orders.today().catch(function () { return []; })
      ]);
      var closingForToday = list ? list.find(function (c) { return String(c.date) === todayStr; }) : null;
      if (closingForToday) {
        try {
          var report = await api.archive.report('day', todayStr);
          if (report && !report.sampleData && report.orders && report.orders.length) {
            renderTodayOrders(report.orders);
            return;
          }
        } catch (_) {}
      }
      renderTodayOrders(fallbackOrders || []);
    } catch (_) {
      if (todayGroupedList) todayGroupedList.innerHTML = '';
      emptyOrders.style.display = 'block';
    }
  }

  function initArchiveDefaults() {
    var d = new Date();
    if (archiveDate) archiveDate.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (archiveMonth) archiveMonth.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (archiveYear) archiveYear.value = String(d.getFullYear());
  }

  /** عرض قاصات الفترة المحددة (حسب تاريخ الفتح). التفاصيل الكاملة تظهر عند النقر على البطاقة. */
  function renderArchiveClosings(closings, type, dateVal, range) {
    var section = document.getElementById('archiveClosingsSection');
    var row = document.getElementById('archiveClosingsRow');
    var titleEl = document.getElementById('archiveClosingsTitle');
    var emptyEl = document.getElementById('archiveClosingsEmpty');
    if (!section || !row) return;
    section.style.display = '';
    if (titleEl) {
      if (type === 'day' && dateVal) titleEl.textContent = 'قاصات فُتحت في يوم ' + dateVal;
      else if (range && range.start && range.end) titleEl.textContent = 'قاصات فُتحت في الفترة ' + range.start + ' — ' + range.end;
      else titleEl.textContent = 'تقارير القاصة';
    }
    if (!closings || !closings.length) {
      row.innerHTML = '';
      if (emptyEl) { emptyEl.style.display = 'block'; }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    var openTimeStr = function (c) {
      return c.openedAt ? formatClosingDateTime(c.openedAt) : (c.open_time ? (c.date ? c.date + ' — ' : '') + formatTime12h(c.open_time) : (c.date && c.time ? c.date + ' — ' + formatTime12h(c.time) : (c.date || '—')));
    };
    var closeTimeStr = function (c) {
      return c.closedAt ? formatClosingDateTime(c.closedAt) : (c.close_time ? formatTime12h(c.close_time) : (c.time ? formatTime12h(c.time) : '—'));
    };
    row.innerHTML = closings.map(function (c, idx) {
      var openTime = openTimeStr(c);
      var closeTime = closeTimeStr(c);
      var duration = formatDuration(c.openedAt, c.closedAt);
      var totalSales = Number(c.totalSales) || 0;
      return '<div class="stat-card archive-closing-card" role="button" tabindex="0" aria-label="عرض تفاصيل القاصة" data-closing-index="' + idx + '">' +
        '<span class="label">قاصة (فتح: ' + escapeHtml(c.date || '') + ')</span>' +
        '<span class="value archive-closing-date">' + escapeHtml(openTime) + '</span>' +
        '<div class="closing-row"><span class="label">إغلاق</span><span class="value">' + escapeHtml(closeTime) + '</span></div>' +
        '<div class="closing-row"><span class="label">مدة العمل</span><span class="value archive-closing-duration">' + escapeHtml(duration) + '</span></div>' +
        '<div class="closing-row"><span class="label">إجمالي المبيعات</span><span class="value">' + formatMoney(totalSales) + '</span></div>' +
        '<div class="closing-card-hint">عرض التفاصيل</div>' +
      '</div>';
    }).join('');
    var archiveClosingsList = closings;
    row.querySelectorAll('.archive-closing-card').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-closing-index'), 10);
      var c = archiveClosingsList[idx];
      if (!c) return;
      card.addEventListener('click', function () { openClosingDetail(c); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClosingDetail(c); } });
    });
  }

  function renderArchiveReport(data, loadError) {
    if (!data) {
      data = { totalProfit: 0, totalOrders: 0, itemsSold: 0, topProduct: '', topProductCount: 0, orders: [], sampleData: false };
      if (emptyArchive) {
        emptyArchive.textContent = loadError
          ? 'تعذر تحميل التقرير. تأكد من تشغيل السيرفر ثم أعد تحميل الصفحة واضغط «عرض التقارير».'
          : 'لا توجد طلبات في الفترة المحددة.';
        emptyArchive.style.display = 'block';
      }
      if (archiveGroupedList) archiveGroupedList.innerHTML = '';
    }
    var orders = data.orders || [];
    archiveReportOrders = orders;
    if (archiveSampleNotice) archiveSampleNotice.style.display = data.sampleData ? 'block' : 'none';
    renderArchiveStatsRow(data);
    if (!orders.length) {
      if (archiveGroupedList) archiveGroupedList.innerHTML = '';
      if (emptyArchive) emptyArchive.style.display = 'block';
      return;
    }
    if (emptyArchive) emptyArchive.style.display = 'none';
    var archiveType = window._lastArchiveReportType || 'day';
    var archiveDateVal = window._lastArchiveReportDate || '';
    resolveSessionsForReport(archiveType, archiveDateVal, orders)
      .then(function (sessions) {
        renderSessionsGroupedList(archiveGroupedList, sessions, emptyArchive);
      })
      .catch(function () {
        if (archiveGroupedList) archiveGroupedList.innerHTML = '';
        if (emptyArchive) emptyArchive.style.display = 'block';
      });
  }

  function getArchiveOpenDateRange(type, dateVal) {
    if (type === 'day') return { start: dateVal, end: dateVal };
    if (type === 'month') {
      var lastDay = new Date(dateVal + '-01');
      lastDay.setMonth(lastDay.getMonth() + 1);
      lastDay.setDate(0);
      var end = lastDay.getFullYear() + '-' + String(lastDay.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay.getDate()).padStart(2, '0');
      return { start: dateVal + '-01', end: end };
    }
    if (type === 'year') return { start: dateVal + '-01-01', end: dateVal + '-12-31' };
    return { start: '', end: '' };
  }

  async function loadArchiveReport() {
    var type = 'day';
    var dateVal = '';
    if (archiveDate && archiveDate.value.trim()) {
      type = 'day';
      dateVal = archiveDate.value.trim();
    } else if (archiveMonth && archiveMonth.value.trim()) {
      type = 'month';
      dateVal = archiveMonth.value.trim();
    } else if (archiveYear && archiveYear.value.trim()) {
      type = 'year';
      dateVal = archiveYear.value.trim();
    } else {
      showToast('اختر يومًا أو شهرًا أو سنة');
      return;
    }
    try {
      window._lastArchiveReportType = type;
      window._lastArchiveReportDate = dateVal;
      var range = getArchiveOpenDateRange(type, dateVal);
      var reportPromise = api.archive.report(type, dateVal);
      var closingsPromise = (range.start === range.end)
        ? api.closings.listByOpenDate(range.start)
        : api.closings.listByOpenDateRange(range.start, range.end);
      var [data, closingsList] = await Promise.all([reportPromise, closingsPromise]);
      renderArchiveReport(data);
      renderArchiveClosings(closingsList, type, dateVal, range);
    } catch (err) {
      showToast(err.json && err.json.error ? err.json.error : 'فشل تحميل التقرير');
      renderArchiveReport(null, true);
      renderArchiveClosings([], null, null, null);
    }
  }

  if (btnArchiveReport) btnArchiveReport.addEventListener('click', loadArchiveReport);

  try {
    var socket = io(window.location.origin);
    socket.on('stats-updated', function () {
      loadStats();
      if (document.getElementById('pageTodayOrders').classList.contains('active')) loadTodayOrders();
      if (document.getElementById('pageArchive').classList.contains('active')) loadArchiveReport();
    });
  } catch (_) {}

  loadStats();
  loadMenu();
  setReportsDateline();
})();
