/**
 * KitchenMenuAvailabilityUI — واجهة صفحة إدارة توفر المواد (عرض فقط).
 */
(function (global) {
  'use strict';

  var handlers = {};
  var pageEl = null;
  var queueViewEl = null;
  var mainEl = null;
  var headerTitleEl = null;
  var openBtnEl = null;
  var statsEls = { total: null, available: null, unavailable: null };
  var searchEl = null;
  var filterBarEl = null;
  var categoriesEl = null;
  var loadingEl = null;
  var emptyEl = null;
  var lastRenderKey = '';

  var PLACEHOLDER_SVG =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect fill="#2a2f36" width="120" height="120"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#8a9199" font-size="14" font-family="sans-serif">☕</text></svg>'
    );

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(price) {
    var n = Number(price) || 0;
    if (global.formatCurrency) return global.formatCurrency(n);
    return n.toFixed(0) + ' IQD';
  }

  function encodeCategory(name) {
    return encodeURIComponent(String(name || ''));
  }

  function decodeCategory(raw) {
    try {
      return decodeURIComponent(String(raw || ''));
    } catch (_) {
      return String(raw || '');
    }
  }

  function imageSrc(url) {
    if (!url) return PLACEHOLDER_SVG;
    var s = String(url).trim();
    if (!s) return PLACEHOLDER_SVG;
    if (/^https?:\/\//i.test(s) || /^data:/i.test(s)) return s;
    var base = String(global.API_BASE || '').replace(/\/$/, '');
    return base + (s.charAt(0) === '/' ? s : '/' + s);
  }


  function buildFiltersKey(filterTab, searchQuery) {
    return String(filterTab || 'all') + '|' + String(searchQuery || '');
  }

  function buildCategoriesKey(categories) {
    return (categories || [])
      .map(function (g) {
        return (
          g.name +
          ':' +
          g.totalCount +
          ':' +
          g.unavailableCount +
          ':' +
          (g.expanded ? '1' : '0') +
          ':' +
          (g.products || [])
            .map(function (p) {
              return p.id + (p.isAvailable === false ? '0' : '1');
            })
            .join(',')
        );
      })
      .join('|');
  }

  function renderToggleInput(product, pendingIds) {
    var available = product.isAvailable !== false && product.is_available !== false;
    var busy = !!(pendingIds && pendingIds[String(product.id)]);
    return (
      '<label class="kitchen-avail-switch" title="' +
      (available ? 'متوفر — اضغط لإيقاف التوفر' : 'غير متوفر — اضغط للتفعيل') +
      '">' +
      '<input type="checkbox" class="kitchen-avail-switch__input" data-id="' +
      escapeHtml(product.id) +
      '"' +
      (available ? ' checked' : '') +
      (busy ? ' disabled' : '') +
      ' aria-label="توفر ' +
      escapeHtml(product.name) +
      '">' +
      '<span class="kitchen-avail-switch__track" aria-hidden="true"></span>' +
      '</label>'
    );
  }

  function renderProductRow(product, pendingIds) {
    var available = product.isAvailable !== false && product.is_available !== false;
    var img = product.imageUrl ? imageSrc(product.imageUrl) : PLACEHOLDER_SVG;
    return (
      '<div class="kitchen-avail-product' +
      (available ? '' : ' kitchen-avail-product--off') +
      '" data-id="' +
      escapeHtml(product.id) +
      '">' +
      '<div class="kitchen-avail-product__thumb">' +
      '<img src="' +
      escapeHtml(img) +
      '" alt="" loading="lazy" decoding="async">' +
      '</div>' +
      '<div class="kitchen-avail-product__body">' +
      '<div class="kitchen-avail-product__name">' +
      escapeHtml(product.name) +
      '</div>' +
      '<div class="kitchen-avail-product__price">' +
      escapeHtml(formatPrice(product.price)) +
      '</div>' +
      (available ? '' : '<span class="kitchen-avail-product__badge">غير متوفر</span>') +
      '</div>' +
      renderToggleInput(product, pendingIds) +
      '</div>'
    );
  }

  function buildProductsKey(products) {
    return (products || [])
      .map(function (p) {
        return p.id + (p.isAvailable === false ? '0' : '1');
      })
      .join(',');
  }

  function renderProductsFlat(products, pendingIds) {
    if (!products || !products.length) return '';
    return (
      '<div class="kitchen-avail-products-flat">' +
      products
        .map(function (p) {
          return renderProductRow(p, pendingIds);
        })
        .join('') +
      '</div>'
    );
  }

  function renderCategoryCard(group, pendingIds) {
    var enc = encodeCategory(group.name);
    var img = imageSrc(group.imageUrl);
    var offLine =
      group.unavailableCount > 0
        ? '<span class="kitchen-avail-cat__off">' + group.unavailableCount + ' غير متوفر</span>'
        : '';
    var productsHtml = '';
    if (group.expanded && group.products && group.products.length) {
      productsHtml =
        '<div class="kitchen-avail-cat__products" id="kitchenAvailCatProducts-' +
        escapeHtml(enc) +
        '">' +
        group.products
          .map(function (p) {
            return renderProductRow(p, pendingIds);
          })
          .join('') +
        '</div>';
    } else if (group.expanded) {
      productsHtml =
        '<div class="kitchen-avail-cat__products"><p class="kitchen-empty kitchen-empty--inline">لا منتجات في هذا التصنيف.</p></div>';
    }

    return (
      '<article class="kitchen-avail-cat' +
      (group.expanded ? ' is-expanded' : '') +
      '" data-category="' +
      escapeHtml(enc) +
      '">' +
      '<button type="button" class="kitchen-avail-cat__head" aria-expanded="' +
      (group.expanded ? 'true' : 'false') +
      '" data-category-toggle="' +
      escapeHtml(enc) +
      '">' +
      '<div class="kitchen-avail-cat__img-wrap">' +
      '<img class="kitchen-avail-cat__img" src="' +
      escapeHtml(img) +
      '" alt="" loading="lazy" decoding="async">' +
      '</div>' +
      '<div class="kitchen-avail-cat__meta">' +
      '<h3 class="kitchen-avail-cat__title">' +
      escapeHtml(group.name) +
      '</h3>' +
      '<p class="kitchen-avail-cat__counts">' +
      '<span>' +
      group.totalCount +
      ' منتج</span>' +
      offLine +
      '</p>' +
      '</div>' +
      '<span class="kitchen-avail-cat__chevron" aria-hidden="true"></span>' +
      '</button>' +
      productsHtml +
      '</article>'
    );
  }

  function updateStats(stats) {
    if (statsEls.total) statsEls.total.textContent = String(stats.total || 0);
    if (statsEls.available) statsEls.available.textContent = String(stats.available || 0);
    if (statsEls.unavailable) statsEls.unavailable.textContent = String(stats.unavailable || 0);
  }

  function updateFilterTabs(filterTab) {
    if (!filterBarEl) return;
    filterBarEl.querySelectorAll('[data-avail-filter]').forEach(function (btn) {
      var active = btn.getAttribute('data-avail-filter') === filterTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function render(model) {
    if (!model || !model.isOpen) return;

    if (loadingEl) loadingEl.hidden = !model.loading;

    updateStats(model.stats);
    updateFilterTabs(model.filterTab);
    if (searchEl && global.document.activeElement !== searchEl && searchEl.value !== model.searchQuery) {
      searchEl.value = model.searchQuery;
    }

    var pendingKey = Object.keys(model.pendingIds || {})
      .sort()
      .join(',');
    var renderKey =
      buildFiltersKey(model.filterTab, model.searchQuery) +
      '||' +
      String(model.viewMode || 'categories') +
      '||' +
      buildCategoriesKey(model.categories) +
      '||' +
      buildProductsKey(model.products) +
      '||' +
      pendingKey +
      '||' +
      (model.loading ? '1' : '0');

    var hasResults = model.hasResults !== false && (model.viewMode === 'products'
      ? (model.products && model.products.length > 0)
      : (model.categories && model.categories.length > 0));

    if (!hasResults && !model.loading) {
      if (categoriesEl) categoriesEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = model.emptyMessage || 'لا توجد نتائج.';
        emptyEl.hidden = false;
      }
    } else {
      if (emptyEl) emptyEl.hidden = true;
      if (categoriesEl && renderKey !== lastRenderKey) {
        if (model.viewMode === 'products') {
          categoriesEl.innerHTML = renderProductsFlat(model.products, model.pendingIds);
        } else {
          categoriesEl.innerHTML = (model.categories || [])
            .map(function (g) {
              return renderCategoryCard(g, model.pendingIds);
            })
            .join('');
        }
      }
    }

    lastRenderKey = renderKey;
  }

  function setPageVisible(visible) {
    var showAvail = !!visible;
    if (mainEl) mainEl.setAttribute('data-kitchen-view', showAvail ? 'availability' : 'queue');
    if (global.document.body) {
      global.document.body.classList.toggle('kitchen-page--availability', showAvail);
      global.document.body.classList.toggle('kitchen-page--queue', !showAvail);
    }
    if (pageEl) pageEl.hidden = !showAvail;
    if (queueViewEl) queueViewEl.hidden = showAvail;
    if (openBtnEl) openBtnEl.hidden = showAvail;

    if (showAvail) {
      pageEl && pageEl.classList.add('is-active');
      try {
        global.window.scrollTo(0, 0);
      } catch (_) {}
      if (searchEl) searchEl.focus();
    } else {
      pageEl && pageEl.classList.remove('is-active');
      lastRenderKey = '';
      try {
        global.window.scrollTo(0, 0);
      } catch (_) {}
    }
  }

  function onCategoriesClick(e) {
    var toggleBtn = e.target.closest('[data-category-toggle]');
    if (toggleBtn && categoriesEl && categoriesEl.contains(toggleBtn)) {
      handlers.onToggleCategory(decodeCategory(toggleBtn.getAttribute('data-category-toggle')));
      return;
    }
  }

  function onCategoriesChange(e) {
    var input = e.target;
    if (!input || !input.classList || !input.classList.contains('kitchen-avail-switch__input')) return;
    if (!categoriesEl || !categoriesEl.contains(input)) return;
    handlers.onAvailabilityChange(input.getAttribute('data-id'), !!input.checked, input);
  }

  function init(h) {
    handlers = h || {};
    pageEl = global.document.getElementById('kitchenViewAvailability');
    queueViewEl = global.document.getElementById('kitchenViewQueue');
    mainEl = global.document.getElementById('kitchenMain');
    headerTitleEl = global.document.getElementById('kitchenHeaderTitle');
    openBtnEl = global.document.getElementById('btnKitchenMenuAvailability');
    searchEl = global.document.getElementById('kitchenAvailSearch');
    filterBarEl = global.document.getElementById('kitchenAvailFilters');
    categoriesEl = global.document.getElementById('kitchenAvailCategories');
    loadingEl = global.document.getElementById('kitchenAvailLoading');
    emptyEl = global.document.getElementById('kitchenAvailEmpty');

    statsEls.total = global.document.getElementById('kitchenAvailStatTotal');
    statsEls.available = global.document.getElementById('kitchenAvailStatAvailable');
    statsEls.unavailable = global.document.getElementById('kitchenAvailStatUnavailable');

    var backBtn = global.document.getElementById('btnKitchenAvailBack');
    if (backBtn) backBtn.addEventListener('click', function () {
      if (typeof handlers.onClose === 'function') handlers.onClose();
    });

    if (searchEl) {
      searchEl.addEventListener('input', function () {
        if (typeof handlers.onSearch === 'function') handlers.onSearch(searchEl.value);
      });
    }

    if (filterBarEl) {
      filterBarEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-avail-filter]');
        if (!btn) return;
        if (typeof handlers.onFilter === 'function') {
          handlers.onFilter(btn.getAttribute('data-avail-filter'));
        }
      });
    }

    if (categoriesEl) {
      categoriesEl.addEventListener('click', onCategoriesClick);
      categoriesEl.addEventListener('change', onCategoriesChange);
    }

    global.document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mainEl && mainEl.getAttribute('data-kitchen-view') === 'availability') {
        if (typeof handlers.onClose === 'function') handlers.onClose();
      }
    });

    setPageVisible(false);
  }

  global.KitchenMenuAvailabilityUI = {
    init: init,
    render: render,
    setPageVisible: setPageVisible,
  };
})(typeof window !== 'undefined' ? window : this);
