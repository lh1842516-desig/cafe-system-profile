/**
 * لوحة الإعدادات — الكافيه والطاولات.
 */
(function (global) {
  'use strict';

  var bound = false;
  var pendingLogoFile = null;
  var serverLogoUrl = null;
  var deleteLogoInProgress = false;

  function $(id) {
    return global.document.getElementById(id);
  }

  function toast(msg) {
    if (global.showToast && typeof global.showToast === 'function') {
      global.showToast(msg);
      return;
    }
    try {
      global.alert(msg);
    } catch (_) {}
  }

  function apiBase() {
    return String(global.API_BASE || global.location.origin || '').replace(/\/$/, '');
  }

  function absAssetUrl(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return apiBase() + (p.charAt(0) === '/' ? p : '/' + p);
  }

  function clearLogoPreviewBlob() {
    var preview = $('settingsLogoPreview');
    if (!preview) return;
    var blobUrl = preview.getAttribute('data-blob-url');
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (_) {}
      preview.removeAttribute('data-blob-url');
    }
  }

  function renderCafeSettings(data) {
    var nameEl = $('settingsCafeName');
    var preview = $('settingsLogoPreview');
    var empty = $('settingsLogoEmpty');
    var btnDelete = $('btnSettingsLogoDelete');
    if (nameEl && data && data.cafeName) nameEl.value = String(data.cafeName);
    var logoUrl = data && data.logoUrl ? String(data.logoUrl).trim() : '';
    serverLogoUrl = logoUrl || null;
    if (preview && empty) {
      clearLogoPreviewBlob();
      if (logoUrl) {
        preview.src = absAssetUrl(logoUrl) + '?v=' + Date.now();
        preview.style.display = 'block';
        empty.style.display = 'none';
        if (btnDelete) btnDelete.style.display = 'inline-flex';
      } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        empty.style.display = 'flex';
        if (btnDelete) btnDelete.style.display = 'none';
      }
    }
  }

  function escapeHtml(text) {
    return String(text != null ? text : '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildTableCard(t) {
    var id = String(t.id || '').trim();
    var label = String(t.label != null ? t.label : id).trim() || id;
    var downloadBtn = '<button type="button" class="btn btn-secondary" data-action="download-qr" data-id="' +
      escapeHtml(id) +
      '">تحميل QR</button>';
    return (
      '<article class="settings-table-card" data-table-id="' +
      escapeHtml(id) +
      '">' +
      '<span class="settings-table-card__status is-ok">QR جاهز</span>' +
      '<div class="settings-table-card__body">' +
      '<p class="settings-table-card__name">طاولة <span>' +
      escapeHtml(label) +
      '</span></p>' +
      '</div>' +
      '<div class="settings-table-card__actions">' +
      downloadBtn +
      '<button type="button" class="btn btn-danger" data-action="delete-table" data-id="' +
      escapeHtml(id) +
      '">حذف</button>' +
      '</div></article>'
    );
  }

  function renderTables(payload) {
    var listEl = $('settingsTableList');
    var countEl = $('settingsTableCount');
    var emptyEl = $('settingsTableEmpty');
    if (!listEl) return;
    var tables = payload && Array.isArray(payload.tables) ? payload.tables : [];
    var count = payload && payload.count != null ? payload.count : tables.length;
    if (countEl) {
      countEl.innerHTML = 'عدد الطاولات الحالية: <strong>' + count + '</strong>';
    }
    if (!tables.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = tables.map(buildTableCard).join('');
  }

  function loadCafeSettings() {
    if (!global.api || !global.api.settings || !global.api.settings.getCafe) {
      return Promise.resolve(null);
    }
    return global.api.settings.getCafe().then(renderCafeSettings).catch(function (err) {
      toast((err && err.message) || 'فشل تحميل إعدادات الكافيه');
      return null;
    });
  }

  function loadTablesSettings() {
    if (!global.api || !global.api.settings || !global.api.settings.getTables) {
      return Promise.resolve(null);
    }
    return global.api.settings.getTables().then(renderTables).catch(function (err) {
      toast((err && err.message) || 'فشل تحميل الطاولات');
      return null;
    });
  }

  function loadPage() {
    return Promise.all([loadCafeSettings(), loadTablesSettings()]);
  }

  function saveCafeSettings(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var nameEl = $('settingsCafeName');
    var name = nameEl ? String(nameEl.value || '').trim() : '';
    if (!name) {
      toast('اسم الكافيه مطلوب');
      return Promise.resolve(null);
    }
    var chain = global.api.settings.updateCafe({ cafeName: name });
    if (pendingLogoFile) {
      chain = chain.then(function () {
        return global.api.settings.uploadLogo(pendingLogoFile);
      });
    }
    return chain
      .then(function (saved) {
        pendingLogoFile = null;
        var input = $('settingsLogoInput');
        if (input) input.value = '';
        renderCafeSettings(saved);
        toast(
          saved && saved.tableQrsRegenerated
            ? 'تم حفظ اسم الكافيه — تم تحديث ' + saved.tableQrsRegenerated + ' بطاقة QR'
            : 'تم حفظ إعدادات الكافيه'
        );
        return saved;
      })
      .catch(function (err) {
        var msg =
          err && err.json && err.json.error
            ? String(err.json.error)
            : err && err.message
              ? String(err.message)
              : 'فشل الحفظ';
        toast(msg);
        return null;
      });
  }

  function onLogoSelected(ev) {
    var file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    var okType = /^(image\/png|image\/jpeg|image\/webp)$/i.test(String(file.type || ''));
    if (!okType) {
      toast('نوع الصورة غير مدعوم. استخدم png أو jpg أو webp');
      ev.target.value = '';
      return;
    }
    pendingLogoFile = file;
    var preview = $('settingsLogoPreview');
    var empty = $('settingsLogoEmpty');
    var btnDelete = $('btnSettingsLogoDelete');
    if (preview && empty) {
      clearLogoPreviewBlob();
      var blobUrl = URL.createObjectURL(file);
      preview.setAttribute('data-blob-url', blobUrl);
      preview.src = blobUrl;
      preview.style.display = 'block';
      empty.style.display = 'none';
      if (btnDelete) btnDelete.style.display = 'inline-flex';
    }
  }

  function clearLocalLogoSelection() {
    pendingLogoFile = null;
    var input = $('settingsLogoInput');
    if (input) input.value = '';
    clearLogoPreviewBlob();
    renderCafeSettings({
      cafeName: $('settingsCafeName') ? $('settingsCafeName').value : '',
      logoUrl: serverLogoUrl,
    });
  }

  function forceHideLogoPreview() {
    var preview = $('settingsLogoPreview');
    var empty = $('settingsLogoEmpty');
    var btnDelete = $('btnSettingsLogoDelete');
    clearLogoPreviewBlob();
    serverLogoUrl = null;
    pendingLogoFile = null;
    if (preview) {
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }
    if (empty) empty.style.display = 'flex';
    if (btnDelete) {
      btnDelete.disabled = false;
      btnDelete.style.display = 'none';
      btnDelete.textContent = 'حذف الشعار';
    }
    var input = $('settingsLogoInput');
    if (input) input.value = '';
  }

  function hasLogoToDelete() {
    if (serverLogoUrl || pendingLogoFile) return true;
    var preview = $('settingsLogoPreview');
    return !!(preview && preview.style.display !== 'none' && (preview.getAttribute('src') || preview.src));
  }

  function performDeleteLogo() {
    if (deleteLogoInProgress) return Promise.resolve(null);
    if (!global.api || !global.api.settings || typeof global.api.settings.deleteLogo !== 'function') {
      toast('تعذّر حذف الشعار — حدّث الصفحة (Ctrl+F5) ثم أعد تشغيل الخادم.');
      return Promise.resolve(null);
    }
    if (!serverLogoUrl && pendingLogoFile) {
      clearLocalLogoSelection();
      toast('تم إزالة الصورة المختارة');
      return Promise.resolve(null);
    }
    if (!hasLogoToDelete()) {
      toast('لا يوجد شعار لحذفه');
      return Promise.resolve(null);
    }
    var btnDelete = $('btnSettingsLogoDelete');
    deleteLogoInProgress = true;
    if (btnDelete) {
      btnDelete.disabled = true;
      btnDelete.textContent = 'جاري الحذف…';
    }
    return global.api.settings
      .deleteLogo()
      .then(function (saved) {
        forceHideLogoPreview();
        renderCafeSettings(saved || { cafeName: $('settingsCafeName') ? $('settingsCafeName').value : '', logoUrl: null });
        toast('تم حذف الشعار');
        return saved;
      })
      .catch(function (err) {
        toast((err && err.json && err.json.error) || err.message || 'فشل حذف الشعار');
        return null;
      })
      .then(function () {
        deleteLogoInProgress = false;
        if (btnDelete) {
          btnDelete.disabled = false;
          btnDelete.textContent = 'حذف الشعار';
        }
      });
  }

  function deleteLogo(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var ok = false;
    try {
      ok = window.confirm('حذف شعار الكافيه؟');
    } catch (_) {
      ok = false;
    }
    if (!ok) return;
    performDeleteLogo();
  }

  function addTable() {
    if (!global.api || !global.api.settings || !global.api.settings.addTable) return;
    var btn = $('btnAddTable');
    if (btn) btn.disabled = true;
    global.api.settings
      .addTable()
      .then(function (res) {
        renderTables({ count: res.tables.length, tables: res.tables });
        toast('تمت إضافة الطاولة وتوليد QR');
      })
      .catch(function (err) {
        toast((err && err.json && err.json.error) || err.message || 'فشل إضافة الطاولة');
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function deleteTable(tableId) {
    if (!tableId) return;
    var confirmFn = global.CafeDialog && global.CafeDialog.confirm ? global.CafeDialog.confirm : function (m) { return Promise.resolve(global.confirm(m)); };
    confirmFn('حذف طاولة ' + tableId + '؟ سيتم حذف QR والبيانات المرتبطة.').then(function (ok) {
      if (!ok) return;
      global.api.settings
        .deleteTable(tableId)
        .then(function (res) {
          renderTables({ count: res.tables.length, tables: res.tables });
          toast('تم حذف الطاولة');
        })
        .catch(function (err) {
          toast((err && err.json && err.json.error) || err.message || 'فشل حذف الطاولة');
        });
    });
  }

  function downloadQr(tableId, btn) {
    if (!tableId || !global.api || !global.api.settings || !global.api.settings.downloadTableQr) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري التوليد…';
    }
    global.api.settings
      .downloadTableQr(tableId)
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'table_' + tableId + '_qr.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        toast('تم تحميل بطاقة QR للطاولة ' + tableId);
      })
      .catch(function (err) {
        toast((err && err.message) || 'فشل تحميل بطاقة QR');
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'تحميل QR';
        }
      });
  }

  var geofenceMapObj = null;
  var geofenceMarker = null;
  var geofenceCircle = null;

  function initGeofenceMap(lat, lng, radius) {
    if (typeof L === 'undefined') return;
    var mapContainer = $('geofenceMap');
    if (!mapContainer) return;

    var initialLat = Number(lat) || 33.3152;
    var initialLng = Number(lng) || 44.3661;
    var initialRadius = Number(radius) || 100;

    if (!geofenceMapObj) {
      geofenceMapObj = L.map('geofenceMap').setView([initialLat, initialLng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(geofenceMapObj);

      geofenceMarker = L.marker([initialLat, initialLng], { draggable: true }).addTo(geofenceMapObj);
      geofenceCircle = L.circle([initialLat, initialLng], {
        color: '#3182ce',
        fillColor: '#3182ce',
        fillOpacity: 0.25,
        radius: initialRadius
      }).addTo(geofenceMapObj);

      function updateCoordsFromPos(latVal, lngVal) {
        var roundedLat = Math.round(latVal * 1000000) / 1000000;
        var roundedLng = Math.round(lngVal * 1000000) / 1000000;
        var latInput = $('geofenceLatInput');
        var lngInput = $('geofenceLngInput');
        if (latInput) latInput.value = roundedLat;
        if (lngInput) lngInput.value = roundedLng;
        if (geofenceMarker) geofenceMarker.setLatLng([roundedLat, roundedLng]);
        if (geofenceCircle) geofenceCircle.setLatLng([roundedLat, roundedLng]);
      }

      geofenceMarker.on('dragend', function (e) {
        var pos = e.target.getLatLng();
        updateCoordsFromPos(pos.lat, pos.lng);
      });

      geofenceMapObj.on('click', function (e) {
        updateCoordsFromPos(e.latlng.lat, e.latlng.lng);
      });

      var radiusInput = $('geofenceRadiusInput');
      if (radiusInput) {
        radiusInput.addEventListener('input', function () {
          var r = Number(radiusInput.value) || 100;
          if (geofenceCircle) geofenceCircle.setRadius(r);
        });
      }
    } else {
      geofenceMapObj.setView([initialLat, initialLng], 16);
      if (geofenceMarker) geofenceMarker.setLatLng([initialLat, initialLng]);
      if (geofenceCircle) {
        geofenceCircle.setLatLng([initialLat, initialLng]);
        geofenceCircle.setRadius(initialRadius);
      }
      setTimeout(function () { geofenceMapObj.invalidateSize(); }, 300);
    }
  }

  function renderGeofenceSettings(data) {
    if (!data) return;
    var enableToggle = $('geofenceEnableToggle');
    var radiusInput = $('geofenceRadiusInput');
    var latInput = $('geofenceLatInput');
    var lngInput = $('geofenceLngInput');

    if (enableToggle) enableToggle.checked = !!data.enableGeofence;
    if (radiusInput) radiusInput.value = data.allowedRadius != null ? data.allowedRadius : 100;
    if (latInput) latInput.value = data.latitude != null ? data.latitude : 33.3152;
    if (lngInput) lngInput.value = data.longitude != null ? data.longitude : 44.3661;

    initGeofenceMap(data.latitude, data.longitude, data.allowedRadius);
  }

  function saveGeofenceSettings(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var enableToggle = $('geofenceEnableToggle');
    var radiusInput = $('geofenceRadiusInput');
    var latInput = $('geofenceLatInput');
    var lngInput = $('geofenceLngInput');

    var payload = {
      enableGeofence: enableToggle ? enableToggle.checked : false,
      allowedRadius: radiusInput ? Number(radiusInput.value) || 100 : 100,
      latitude: latInput ? Number(latInput.value) || 33.3152 : 33.3152,
      longitude: lngInput ? Number(lngInput.value) || 44.3661 : 44.3661,
    };

    if (!global.api || !global.api.settings || !global.api.settings.updateLocation) {
      toast('API غير متاح');
      return Promise.resolve(null);
    }

    return global.api.settings.updateLocation(payload)
      .then(function (saved) {
        renderGeofenceSettings(saved);
        toast('✨ تم حفظ إعدادات الموقع الجغرافي (Geofencing) بنجاح');
        return saved;
      })
      .catch(function (err) {
        toast((err && err.message) || 'فشل حفظ إعدادات الموقع');
        return null;
      });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast('متصفحك لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    toast('جاري تحديد موقعك الحالي...');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var latInput = $('geofenceLatInput');
        var lngInput = $('geofenceLngInput');
        if (latInput) latInput.value = Math.round(lat * 1000000) / 1000000;
        if (lngInput) lngInput.value = Math.round(lng * 1000000) / 1000000;
        var r = $('geofenceRadiusInput') ? Number($('geofenceRadiusInput').value) || 100 : 100;
        initGeofenceMap(lat, lng, r);
        toast('📍 تم جلب موقعك الحالي بنجاح');
      },
      function (_) {
        toast('⚠️ تعذر جلب الموقع الجغرافي الحالي');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function loadCafeSettings() {
    if (!global.api || !global.api.settings || !global.api.settings.getCafe) {
      return Promise.resolve(null);
    }
    return global.api.settings.getCafe().then(function (data) {
      renderCafeSettings(data);
      renderGeofenceSettings(data);
      return data;
    }).catch(function (err) {
      toast((err && err.message) || 'فشل تحميل إعدادات الكافيه');
      return null;
    });
  }

  function onTableListClick(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    if (action === 'delete-table') deleteTable(id);
    else if (action === 'download-qr') downloadQr(id, btn);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    var form = $('formCafeSettings');
    if (form) form.addEventListener('submit', saveCafeSettings);
    var formGeo = $('formGeofenceSettings');
    if (formGeo) formGeo.addEventListener('submit', saveGeofenceSettings);
    var btnCurrentLoc = $('btnLocateCurrentPos');
    if (btnCurrentLoc) btnCurrentLoc.addEventListener('click', useCurrentLocation);

    var btnLogo = $('btnSettingsLogoUpload');
    var logoInput = $('settingsLogoInput');
    if (btnLogo && logoInput) {
      btnLogo.addEventListener('click', function () {
        logoInput.click();
      });
      logoInput.addEventListener('change', onLogoSelected);
    }
    var btnDelLogo = $('btnSettingsLogoDelete');
    if (btnDelLogo) {
      btnDelLogo.addEventListener('click', deleteLogo);
    }
    var btnAdd = $('btnAddTable');
    if (btnAdd) btnAdd.addEventListener('click', addTable);
    var list = $('settingsTableList');
    if (list) list.addEventListener('click', onTableListClick);
  }

  function init() {
    bindEvents();
  }

  global.AdminSettings = {
    init: init,
    loadPage: loadPage,
    deleteLogo: deleteLogo,
  };

  init();
})(typeof window !== 'undefined' ? window : this);
