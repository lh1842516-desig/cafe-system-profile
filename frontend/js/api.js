/**
 * وحدة الاتصال بالـ API — نظام إدارة الكافيه
 *
 * يعمل على الشبكة المحلية (LAN) بدون إنترنت عام — يجب أن يكون السيرفر (Node) قيد التشغيل.
 * - من http://IP:3000 يُستخدم origin تلقائياً.
 * - من file:// أو origin غير صالح: http://127.0.0.1:3000 أو cafeApiBase في localStorage أو CustomerFlowConstants.API_BASE_OVERRIDE
 * - يمكن تمرير ?api=http://192.168.x.x:3000 مرة واحدة ليُحفظ العنوان.
 */
(function initApiBase() {
  var fromQuery = '';
  try {
    var q = new URLSearchParams(window.location.search || '').get('api');
    if (q) fromQuery = String(q).trim();
  } catch (_) {}
  var fromStorage = '';
  try {
    fromStorage = (localStorage.getItem('cafeApiBase') || '').trim();
  } catch (_) {}
  var fromConstants = '';
  try {
    if (window.CustomerFlowConstants && window.CustomerFlowConstants.API_BASE_OVERRIDE) {
      fromConstants = String(window.CustomerFlowConstants.API_BASE_OVERRIDE || '').trim();
    }
  } catch (_) {}
  if (fromQuery) {
    try {
      localStorage.setItem('cafeApiBase', fromQuery.replace(/\/$/, ''));
    } catch (_) {}
  }
  var origin = '';
  var proto = '';
  try {
    origin = window.location.origin || '';
    proto = window.location.protocol || '';
  } catch (_) {}
  var isFile = proto === 'file:';
  var badOrigin = !origin || origin === 'null';
  var manual = fromQuery || fromConstants;
  var port = 3000;
  try {
    if (window.CustomerFlowConstants && window.CustomerFlowConstants.DEFAULT_SERVER_PORT != null) {
      port = Number(window.CustomerFlowConstants.DEFAULT_SERVER_PORT) || 3000;
    }
  } catch (_) {}
  var defaultLocal = 'http://127.0.0.1:' + port;

  if (!isFile && !badOrigin && !manual) {
    var baseFromOrigin = origin.replace(/\/$/, '');
    try {
      var Cfc = window.CustomerFlowConstants;
      var appendLanPort = !!(Cfc && Cfc.LAN_APPEND_PORT_TO_ORIGIN);
      var locPort = '';
      try {
        locPort = String(window.location.port || '').trim();
      } catch (_lp) {}
      if (appendLanPort && proto === 'http:' && port && !locPort) {
        var hostname = '';
        try {
          hostname = String(window.location.hostname || '').trim();
        } catch (_hn) {}
        var looksLan =
          /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
          hostname === 'localhost' ||
          hostname.endsWith('.local');
        if (looksLan && port !== 80 && port !== 443) {
          baseFromOrigin = window.location.protocol + '//' + hostname + ':' + port;
        }
      }
    } catch (_lanFix) {}
    window.API_BASE = baseFromOrigin;
  } else if (manual) {
    window.API_BASE = manual.replace(/\/$/, '');
  } else if (fromStorage) {
    window.API_BASE = fromStorage.replace(/\/$/, '');
  } else {
    window.API_BASE = defaultLocal;
  }
})();
var API_BASE = window.API_BASE;

function formatCurrency(n) {
  var num = Number(n);
  if (num !== num) return '0 IQD';
  try {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + ' IQD';
  } catch (_) {
    return String(Math.round(num)) + ' IQD';
  }
}
window.formatCurrency = formatCurrency;

var api = {
  request: function (path, options) {
    var url = path.indexOf('http') === 0 ? path : API_BASE + path;
    var method = options.method || 'GET';
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers);
    try {
      var token = sessionStorage.getItem('cafezip_saas_token');
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    } catch (_) {}
    try {
      if (!headers['x-cafe-id']) {
        var activeCafeId = (new URLSearchParams(window.location.search)).get('cafeId') ||
                           sessionStorage.getItem('cust_cafe_id') ||
                           sessionStorage.getItem('cafezip_cafe_id') ||
                           localStorage.getItem('cafezip_cafe_id');
        if (activeCafeId) {
          headers['x-cafe-id'] = String(activeCafeId).trim();
        }
      }
    } catch (_) {}
    return fetch(url, {
      method: method,
      cache: options.cache != null ? options.cache : method === 'GET' ? 'no-store' : 'default',
      headers: headers,
      body: options.body,
    }).then(function (res) {
      return res.text().then(function (text) {
        if (!res.ok) {
          var rawMsg = text || res.statusText;
          var friendly = rawMsg;
          var parsedJson = null;
          try {
            if (rawMsg && String(rawMsg).trim().charAt(0) === '{') {
              parsedJson = JSON.parse(rawMsg);
            }
          } catch (_) {}
          if (parsedJson && parsedJson.error) {
            friendly = String(parsedJson.error);
          } else if (rawMsg && /Cannot\s+(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(String(rawMsg))) {
            /* Express الافتراضي — غالباً السيرفر قديم ولم يُحمَّل مسار جديد بعد */
            friendly =
              res.status === 404
                ? 'المسار غير متوفر على السيرفر. أعد تشغيل الخادم من مجلد backend (أوقف نافذة npm start ثم شغّل npm start من جديد) ثم جرّب إلغاء الطلب مرة أخرى.'
                : String(rawMsg);
          } else if (rawMsg && (rawMsg.indexOf('<!DOCTYPE') === 0 || rawMsg.indexOf('<html') !== -1)) {
            var preMatch = rawMsg.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
            if (preMatch) {
              friendly = preMatch[1].trim();
            } else if (/Cannot GET/i.test(rawMsg)) {
              friendly = 'المسار غير متوفر على السيرفر. أعد تشغيل خادم البرنامج بعد التحديث.';
            } else {
              friendly = 'خطأ من السيرفر.';
            }
          }
          if (friendly && friendly.length > 220) {
            friendly = friendly.slice(0, 217) + '…';
          }
          var err = new Error(friendly);
          err.status = res.status;
          err.body = text;
          err.json = parsedJson;
          throw err;
        }
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch (_) {
          return text;
        }
      });
    });
  },

  get: function (path) {
    return this.request(path, { method: 'GET' });
  },

  post: function (path, body) {
    return this.request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  },

  put: function (path, body) {
    return this.request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  },

  patch: function (path, body) {
    return this.request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  },

  delete: function (path) {
    return this.request(path, { method: 'DELETE' });
  },

  categories: {
    list: function () {
      return api.get('/api/categories');
    },
    add: function (name) {
      return api.post('/api/categories', { name: name || '' });
    },
    delete: function (name) {
      return api.post('/api/categories/delete', { name: name || '' });
    },
    rename: function (oldName, newName) {
      return api.post('/api/categories/rename', { oldName: oldName || '', newName: (newName || '').trim() });
    },
    setImage: function (name, imageUrl) {
      return api.post('/api/categories/image', { name: name || '', imageUrl: imageUrl == null ? null : imageUrl });
    },
  },

  kitchen: {
    queue: function () {
      return api.get('/api/kitchen/queue');
    },
    today: function () {
      return api.get('/api/kitchen/today');
    },
    setStatus: function (orderId, status) {
      return api.post('/api/kitchen/' + encodeURIComponent(orderId) + '/status', { status: status });
    },
  },

  menu: {
    list: function () {
      return api.get('/api/menu');
    },
    get: function (id) {
      return api.get('/api/menu/' + id);
    },
    create: function (data) {
      return api.post('/api/menu', data);
    },
    update: function (id, data) {
      return api.put('/api/menu/' + id, data);
    },
    delete: function (id) {
      return api.delete('/api/menu/' + encodeURIComponent(id));
    },
    setAvailability: function (id, isAvailable) {
      return api.patch('/api/menu/' + encodeURIComponent(id) + '/availability', {
        isAvailable: !!isAvailable,
      });
    },
  },

  /** جلسات الطاولة وحالاتها (available / in_use / occupied) */
  tableSessions: {
    getBillRequestedTables: function () {
      return api.get('/api/table-sessions/bill-requested-tables');
    },
  },

  orders: {
    tables: function () {
      return api.get('/api/orders/tables');
    },
    byTable: function (tableId) {
      return api.get('/api/orders/table/' + encodeURIComponent(String(tableId)));
    },
    /** كل طلبات الطاولة (مفتوحة + مغلقة) ضمن جلسة القاصة — لوصولات الزبون */
    byTableAll: function (tableId) {
      return api.get('/api/orders/table/' + encodeURIComponent(String(tableId)) + '/all');
    },
    today: function () {
      return api.get('/api/orders/today');
    },
    /** سجل جلسات طلبات اليوم (بعد إغلاق الحساب فقط) */
    todaySessions: {
      list: function () {
        return api.get('/api/today-sessions');
      },
      report: function (type, date) {
        return api.get(
          '/api/today-sessions/report?type=' +
            encodeURIComponent(String(type || 'day')) +
            '&date=' +
            encodeURIComponent(String(date || ''))
        );
      },
      get: function (sessionId) {
        return api.get('/api/today-sessions/' + encodeURIComponent(String(sessionId)));
      },
      create: function (payload) {
        return api.post('/api/today-sessions', payload || {});
      },
    },
    create: function (tableId, items, opts) {
      var body = { items: items };
      if (tableId != null && String(tableId).trim() !== '') body.tableId = tableId;
      if (opts && opts.customerName) body.customerName = String(opts.customerName);
      if (opts && opts.customerSessionId) body.customerSessionId = String(opts.customerSessionId);
      if (opts && opts.orderType) body.orderType = String(opts.orderType);
      if (opts && opts.serviceMeta && typeof opts.serviceMeta === 'object') body.serviceMeta = opts.serviceMeta;
      return api.post('/api/orders', body);
    },
    appendItems: function (orderId, tableId, items) {
      return api.post('/api/orders/' + encodeURIComponent(String(orderId)) + '/items', {
        tableId: tableId,
        items: items,
      });
    },
    kitchenStatus: function (orderId) {
      return api.get('/api/orders/' + encodeURIComponent(String(orderId)) + '/kitchen-status');
    },
    pendingCashierApproval: function () {
      return api.get('/api/orders/pending-cashier-approval');
    },
    approveKitchen: function (orderId) {
      return api.post(
        '/api/orders/' + encodeURIComponent(String(orderId)) + '/approve-kitchen',
        {}
      );
    },
    rejectKitchen: function (orderId) {
      return api.post(
        '/api/orders/' + encodeURIComponent(String(orderId)) + '/reject-kitchen',
        {}
      );
    },
    close: function (orderId, options) {
      var body = (options && options.paymentMethod) ? { paymentMethod: options.paymentMethod } : undefined;
      return api.post('/api/orders/' + encodeURIComponent(orderId) + '/close', body);
    },
  },

  stats: {
    today: function () {
      return api.get('/api/stats/today');
    },
  },

  archive: {
    report: function (type, date) {
      var q = '?type=' + encodeURIComponent(type) + '&date=' + encodeURIComponent(date);
      return api.get('/api/archive/report' + q).then(function (r) {
        if (typeof r === 'string' && r.trim().indexOf('<!') === 0) throw new Error('استجابة غير صحيحة من السيرفر');
        return r;
      });
    },
  },

  closings: {
    list: function () {
      return api.get('/api/closings');
    },
    /** قاصات فُتحت في تاريخ معيّن (حسب open_date فقط) */
    listByOpenDate: function (dateStr) {
      var q = '?open_date=' + encodeURIComponent(String(dateStr || '').trim());
      return api.get('/api/closings' + q);
    },
    /** قاصات فُتحت ضمن نطاق تواريخ (للشهر/السنة) */
    listByOpenDateRange: function (startStr, endStr) {
      var q = '?open_date_start=' + encodeURIComponent(String(startStr || '').trim()) +
              '&open_date_end=' + encodeURIComponent(String(endStr || '').trim());
      return api.get('/api/closings' + q);
    },
    last: function () {
      return api.get('/api/closings/last');
    },
    create: function (data) {
      return api.post('/api/closings', data);
    },
  },

  till: {
    current: function () {
      return api.get('/api/till/current');
    },
    open: function (data) {
      return api.post('/api/till/open', data || {});
    },
    update: function (data) {
      return api.patch('/api/till/current', data);
    },
    close: function (closedBy) {
      return api.post('/api/till/close', { closedBy: closedBy || '' });
    },
    deleteExpense: function (id) {
      return api.delete('/api/till/expense/' + encodeURIComponent(id));
    },
    deleteWithdrawal: function (id) {
      return api.delete('/api/till/withdrawal/' + encodeURIComponent(id));
    },
  },

  uploadImage: function (file) {
    var form = new FormData();
    form.append('image', file);
    var headers = {};
    try {
      var token = sessionStorage.getItem('cafezip_saas_token');
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    } catch (_) {}
    try {
      var activeCafeId = (new URLSearchParams(window.location.search)).get('cafeId') ||
                         sessionStorage.getItem('cust_cafe_id') ||
                         sessionStorage.getItem('cafezip_cafe_id') ||
                         localStorage.getItem('cafezip_cafe_id');
      if (activeCafeId) {
        headers['x-cafe-id'] = String(activeCafeId).trim();
      }
    } catch (_) {}
    var baseUrl = typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || '');
    return fetch(baseUrl + '/api/upload', {
      method: 'POST',
      headers: headers,
      body: form,
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = t;
          try {
            var parsed = JSON.parse(t);
            if (parsed && parsed.error) msg = parsed.error;
          } catch (_) {}
          throw new Error(msg);
        });
      }
      return res.json().then(function (data) { return data.url; });
    });
  },

  settings: {
    getCafe: function () {
      return api.get('/api/settings/cafe');
    },
    updateCafe: function (data) {
      return api.put('/api/settings/cafe', data || {});
    },
    updateLocation: function (data) {
      return api.put('/api/settings/cafe/location', data || {});
    },
    updateKitchenApproval: function (requireCashierKitchenApproval) {
      return api.post('/api/settings/cafe/kitchen-approval', {
        requireCashierKitchenApproval: !!requireCashierKitchenApproval,
      });
    },
    uploadLogo: function (file) {
      var form = new FormData();
      form.append('logo', file);
      var headers = {};
      try {
        var token = sessionStorage.getItem('cafezip_saas_token');
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
      } catch (_) {}
      return fetch(API_BASE + '/api/settings/cafe/logo', {
        method: 'POST',
        headers: headers,
        body: form,
      }).then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            var err = new Error(body && body.error ? body.error : 'upload_failed');
            err.json = body;
            err.status = res.status;
            throw err;
          }
          return body;
        });
      });
    },
    deleteLogo: function () {
      return api.post('/api/settings/cafe/logo/delete', {}).catch(function (err) {
        if (err && (err.status === 404 || err.status === 405)) {
          return api.delete('/api/settings/cafe/logo');
        }
        throw err;
      });
    },
    getTables: function () {
      return api.get('/api/settings/tables');
    },
    addTable: function () {
      return api.post('/api/settings/tables', {});
    },
    deleteTable: function (tableId) {
      return api.delete('/api/settings/tables/' + encodeURIComponent(String(tableId || '').trim()));
    },
    regenerateTableQr: function (tableId) {
      return api.post('/api/settings/tables/' + encodeURIComponent(String(tableId || '').trim()) + '/regenerate-qr', {});
    },
    downloadTableQr: function (tableId) {
      var tid = encodeURIComponent(String(tableId || '').trim());
      var headers = {};
      try {
        var token = sessionStorage.getItem('cafezip_saas_token');
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
      } catch (_) {}
      return fetch(API_BASE + '/api/settings/tables/' + tid + '/download-qr', {
        method: 'GET',
        headers: headers,
      }).then(function (res) {
        if (!res.ok) {
          return res.json().then(function (b) {
            throw new Error((b && b.error) || 'fished_download');
          });
        }
        return res.blob();
      });
    },
  },

  admin: {
    login: function (username, password) {
      return api.post('/api/admin/login', {
        username: username || '',
        password: password != null ? String(password) : '',
      });
    },
    changePassword: function (data) {
      return api.put('/api/admin/password', {
        currentPassword: data && data.currentPassword != null ? String(data.currentPassword) : '',
        newPassword: data && data.newPassword != null ? String(data.newPassword) : '',
        confirmPassword: data && data.confirmPassword != null ? String(data.confirmPassword) : '',
      });
    },
  },
};
if (typeof window !== 'undefined') { window.api = api; }
