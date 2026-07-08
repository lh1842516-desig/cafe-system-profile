/**
 * KitchenMenuAvailability — منطق إدارة توفر المواد (بدون واجهة).
 * يحافظ على نفس API والسوكت وسلوك التبديل الحالي.
 */
(function (global) {
  'use strict';

  var menuItems = [];
  var categories = [];
  var pendingIds = Object.create(null);
  var socketBound = false;
  var isOpen = false;
  var searchQuery = '';
  var filterTab = 'all';
  var expandedCategories = Object.create(null);
  var loading = false;

  function isAvailable(item) {
    if (!item) return true;
    if (item.isAvailable === false || item.is_available === false) return false;
    return true;
  }

  function compareAr(a, b) {
    try {
      return String(a).localeCompare(String(b), 'ar');
    } catch (_) {
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    }
  }

  function applyPatchToLocal(patch) {
    if (!patch || patch.id == null) return;
    var id = String(patch.id);
    var idx = menuItems.findIndex(function (it) {
      return String(it.id) === id;
    });
    if (idx === -1) return;
    var next = Object.assign({}, menuItems[idx]);
    if (patch.isAvailable !== undefined) next.isAvailable = !!patch.isAvailable;
    if (patch.is_available !== undefined) next.isAvailable = !!patch.is_available;
    menuItems[idx] = next;
  }

  function deriveCategoriesFromMenu(items) {
    var seen = Object.create(null);
    (items || []).forEach(function (it) {
      var c = it && it.category != null ? String(it.category).trim() : '';
      if (c) seen[c] = true;
    });
    return Object.keys(seen)
      .sort(compareAr)
      .map(function (name) {
        return { name: name, imageUrl: null };
      });
  }

  function normalizeCategories(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (c) {
        if (!c || typeof c !== 'object') return null;
        var name = c.name != null ? String(c.name).trim() : '';
        if (!name) return null;
        return { name: name, imageUrl: c.imageUrl || null };
      })
      .filter(Boolean);
  }

  function getCategoryMetaMap() {
    var map = Object.create(null);
    categories.forEach(function (c) {
      map[c.name] = c;
    });
    return map;
  }

  function applyFilterTab(items) {
    return (items || []).filter(function (it) {
      if (filterTab === 'available' && !isAvailable(it)) return false;
      if (filterTab === 'unavailable' && isAvailable(it)) return false;
      return true;
    });
  }

  function categoryLabel(item) {
    var cat = item && item.category != null ? String(item.category).trim() : '';
    return cat || 'بدون تصنيف';
  }

  function getMatchedCategoryNames(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var names = [];
    categories.forEach(function (c) {
      if (String(c.name || '').toLowerCase().indexOf(q) !== -1) names.push(c.name);
    });
    if ('بدون تصنيف'.toLowerCase().indexOf(q) !== -1 && names.indexOf('بدون تصنيف') === -1) {
      names.push('بدون تصنيف');
    }
    return names;
  }

  /** بناء عرض البحث: تصنيف+منتجاته عند مطابقة اسم التصنيف، أو منتجات مباشرة عند مطابقة اسم المنتج */
  function buildSearchDisplay(filtered, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) {
      return { viewMode: 'categories', categories: buildCategoryGroups(filtered), products: [] };
    }

    var matchedCatNames = getMatchedCategoryNames(q);
    if (matchedCatNames.length > 0) {
      var catProducts = filtered.filter(function (it) {
        return matchedCatNames.indexOf(categoryLabel(it)) !== -1;
      });
      var groups = buildCategoryGroups(catProducts)
        .filter(function (g) {
          return matchedCatNames.indexOf(g.name) !== -1;
        })
        .map(function (g) {
          return Object.assign({}, g, { expanded: true });
        });
      return { viewMode: 'categories', categories: groups, products: [] };
    }

    var productHits = filtered.filter(function (it) {
      return String(it.name || '').toLowerCase().indexOf(q) !== -1;
    });
    productHits.sort(function (a, b) {
      return compareAr(a.name, b.name);
    });
    return { viewMode: 'products', categories: [], products: productHits };
  }

  function getFilteredItems() {
    return applyFilterTab(menuItems);
  }

  function buildCategoryGroups(items) {
    var metaMap = getCategoryMetaMap();
    var groups = Object.create(null);
    items.forEach(function (it) {
      var cat = categoryLabel(it);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(it);
    });

    Object.keys(groups).forEach(function (cat) {
      groups[cat].sort(function (a, b) {
        return compareAr(a.name, b.name);
      });
    });

    var orderedNames = categories
      .map(function (c) {
        return c.name;
      })
      .filter(function (name) {
        return !!groups[name];
      });

    Object.keys(groups).forEach(function (cat) {
      if (orderedNames.indexOf(cat) === -1) orderedNames.push(cat);
    });
    orderedNames.sort(compareAr);

    return orderedNames.map(function (name) {
      var products = groups[name] || [];
      var unavailableCount = products.filter(function (p) {
        return !isAvailable(p);
      }).length;
      var meta = metaMap[name] || { name: name, imageUrl: null };
      return {
        name: name,
        imageUrl: meta.imageUrl,
        products: products,
        totalCount: products.length,
        unavailableCount: unavailableCount,
        expanded: !!expandedCategories[name],
      };
    });
  }

  function getStats() {
    var total = menuItems.length;
    var unavailable = 0;
    menuItems.forEach(function (it) {
      if (!isAvailable(it)) unavailable += 1;
    });
    return {
      total: total,
      available: total - unavailable,
      unavailable: unavailable,
    };
  }

  function getViewModel() {
    var filtered = getFilteredItems();
    var display = buildSearchDisplay(filtered, searchQuery);
    var hasResults =
      display.viewMode === 'products'
        ? display.products.length > 0
        : display.categories.length > 0;
    return {
      isOpen: isOpen,
      loading: loading,
      searchQuery: searchQuery,
      filterTab: filterTab,
      viewMode: display.viewMode,
      stats: getStats(),
      categories: display.categories,
      products: display.products,
      pendingIds: pendingIds,
      hasMenu: menuItems.length > 0,
      emptyMessage: menuItems.length
        ? 'لا توجد نتائج مطابقة للبحث أو الفلتر.'
        : 'لا توجد منتجات في المنيو.',
      hasResults: hasResults,
    };
  }
  function notifyUI() {
    if (global.KitchenMenuAvailabilityUI && typeof global.KitchenMenuAvailabilityUI.render === 'function') {
      global.KitchenMenuAvailabilityUI.render(getViewModel());
    }
  }

  function openPage() {
    isOpen = true;
    searchQuery = '';
    filterTab = 'all';
    if (global.KitchenMenuAvailabilityUI && typeof global.KitchenMenuAvailabilityUI.setPageVisible === 'function') {
      global.KitchenMenuAvailabilityUI.setPageVisible(true);
    }
    loadMenu();
  }

  function closePage() {
    isOpen = false;
    if (global.KitchenMenuAvailabilityUI && typeof global.KitchenMenuAvailabilityUI.setPageVisible === 'function') {
      global.KitchenMenuAvailabilityUI.setPageVisible(false);
    }
  }

  function loadMenu() {
    loading = true;
    notifyUI();

    var api = global.api || global.Api;
    if (!api || !api.menu || !api.menu.list) {
      loading = false;
      notifyUI();
      return;
    }

    var menuPromise = api.menu.list();
    var categoriesPromise =
      api.categories && api.categories.list
        ? api.categories.list().catch(function () {
            return [];
          })
        : Promise.resolve([]);

    Promise.all([categoriesPromise, menuPromise])
      .then(function (results) {
        categories = normalizeCategories(results[0]);
        menuItems = Array.isArray(results[1]) ? results[1].slice() : [];
        if (!categories.length && menuItems.length) {
          categories = deriveCategoriesFromMenu(menuItems);
        }
      })
      .catch(function () {
        menuItems = [];
      })
      .finally(function () {
        loading = false;
        notifyUI();
      });
  }

  function setAvailability(id, nextAvailable, inputEl) {
    var api = global.api || global.Api;
    if (!api || !api.menu || !api.menu.setAvailability) return;
    var key = String(id);
    pendingIds[key] = true;
    if (inputEl) inputEl.disabled = true;
    notifyUI();

    api.menu
      .setAvailability(id, nextAvailable)
      .then(function (item) {
        applyPatchToLocal(item || { id: id, isAvailable: nextAvailable });
        notifyUI();
      })
      .catch(function (err) {
        if (inputEl) inputEl.checked = !nextAvailable;
        var msg =
          (err && err.json && err.json.error) ||
          (err && err.message) ||
          'تعذّر تحديث توفر المنتج.';
        alert(msg);
        notifyUI();
      })
      .finally(function () {
        delete pendingIds[key];
        if (inputEl) inputEl.disabled = false;
        notifyUI();
      });
  }

  function onListChange(id, checked, inputEl) {
    if (!id) return;
    setAvailability(id, !!checked, inputEl || null);
  }

  function setSearchQuery(value) {
    searchQuery = String(value || '');
    notifyUI();
  }

  function setFilterTab(tab) {
    var t = String(tab || 'all');
    if (t !== 'available' && t !== 'unavailable') t = 'all';
    filterTab = t;
    notifyUI();
  }

  function toggleCategory(name) {
    var key = String(name || '');
    if (!key) return;
    expandedCategories[key] = !expandedCategories[key];
    notifyUI();
  }

  function onSocketUpdate(payload) {
    if (!payload) return;
    if (payload.reason === 'deleted' && payload.id != null) {
      menuItems = menuItems.filter(function (it) {
        return String(it.id) !== String(payload.id);
      });
    } else if (payload.item) {
      applyPatchToLocal(payload.item);
    } else if (payload.id != null && payload.isAvailable !== undefined) {
      applyPatchToLocal({ id: payload.id, isAvailable: payload.isAvailable });
    }
    if (isOpen) notifyUI();
  }

  function bindSocket() {
    if (socketBound) return;
    socketBound = true;
    var attach = function () {
      var socket = global.__cafeKitchenSocket;
      if (!socket || socket.__menuAvailBound) return;
      socket.__menuAvailBound = true;
      socket.on('menu-updated', onSocketUpdate);
    };
    attach();
  }

  function init() {
    bindSocket();
    if (global.KitchenMenuAvailabilityUI && typeof global.KitchenMenuAvailabilityUI.init === 'function') {
      global.KitchenMenuAvailabilityUI.init({
        onSearch: setSearchQuery,
        onFilter: setFilterTab,
        onToggleCategory: toggleCategory,
        onAvailabilityChange: onListChange,
        onOpen: openPage,
        onClose: closePage,
      });
    }

    var openBtn = global.document.getElementById('btnKitchenMenuAvailability');
    if (openBtn) openBtn.addEventListener('click', openPage);
  }

  global.KitchenMenuAvailability = {
    init: init,
    open: openPage,
    close: closePage,
    onSocketUpdate: onSocketUpdate,
    bindSocket: bindSocket,
    isAvailable: isAvailable,
    getViewModel: getViewModel,
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
