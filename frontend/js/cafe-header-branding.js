/**
 * اسم الكافيه في ترويسة الشاشات — تحميل من API وتحديث فوري عبر Socket.
 */
(function (global) {
  'use strict';

  function applyCafeHeaderName(el, cafeName) {
    if (!el) return;
    var name = String(cafeName || '').trim();
    if (name) {
      el.textContent = name;
      el.hidden = false;
      el.removeAttribute('hidden');
    } else {
      el.textContent = '';
      el.hidden = true;
      el.setAttribute('hidden', '');
    }
  }

  function setDocumentTitle(prefix, cafeName) {
    if (!prefix) return;
    var name = String(cafeName || '').trim();
    try {
      global.document.title = name ? prefix + ' — ' + name : prefix;
    } catch (_) {}
  }

  function loadCafeHeaderName(el, titlePrefix) {
    var api = global.api || global.Api;
    if (!api || !api.settings || typeof api.settings.getCafe !== 'function') {
      return Promise.resolve();
    }
    return api.settings
      .getCafe()
      .then(function (data) {
        var name = data && data.cafeName;
        applyCafeHeaderName(el, name);
        setDocumentTitle(titlePrefix, name);
        return data;
      })
      .catch(function () {
        applyCafeHeaderName(el, '');
        setDocumentTitle(titlePrefix, '');
      });
  }

  function bindCafeSettingsSocket(socket, el, titlePrefix) {
    if (!socket || typeof socket.on !== 'function') return;
    socket.on('cafe-settings-updated', function (payload) {
      if (payload && payload.cafeName != null) {
        applyCafeHeaderName(el, payload.cafeName);
        setDocumentTitle(titlePrefix, payload.cafeName);
      } else {
        loadCafeHeaderName(el, titlePrefix);
      }
    });
  }

  global.CafeHeaderBranding = {
    apply: applyCafeHeaderName,
    load: loadCafeHeaderName,
    bindSocket: bindCafeSettingsSocket,
  };
})(typeof window !== 'undefined' ? window : this);
