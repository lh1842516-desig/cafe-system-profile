/**
 * CafeDialog — تنبيهات وتأكيدات في وسط الشاشة (بديل alert/confirm)
 * إشعارات NotificationCenter (أعلى الشاشة) للمطبخ والكابتن فقط — لا تُستبدل هنا.
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'cafe-dialog-styles-v2';
  var Z_INDEX = 100050;
  var overlay = null;
  var queue = [];
  var busy = false;

  var TYPE_META = {
    info: { icon: 'ℹ', className: 'cafe-dialog--info' },
    success: { icon: '✓', className: 'cafe-dialog--success' },
    warning: { icon: '!', className: 'cafe-dialog--warning' },
    error: { icon: '✕', className: 'cafe-dialog--error' },
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.cafe-dialog-overlay{position:fixed;inset:0;z-index:' +
      Z_INDEX +
      ';display:flex;align-items:center;justify-content:center;padding:1.25rem;background:rgba(45,55,72,0.42);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility .22s ease;}' +
      '.cafe-dialog-overlay.open{pointer-events:auto;}' +
      '.cafe-dialog-overlay.open{opacity:1;visibility:visible;}' +
      '.cafe-dialog{width:min(400px,calc(100vw - 2rem));background:#fff;border:1px solid #E2E8F0;border-radius:16px;box-shadow:0 16px 48px rgba(45,55,72,0.18);padding:1.35rem 1.25rem 1.15rem;text-align:center;transform:translateY(8px) scale(.98);transition:transform .22s ease;}' +
      '.cafe-dialog-overlay.open .cafe-dialog{transform:translateY(0) scale(1);}' +
      '.cafe-dialog__icon{width:52px;height:52px;margin:0 auto .85rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.45rem;font-weight:900;line-height:1;}' +
      '.cafe-dialog--info .cafe-dialog__icon{background:#EFF6FF;border:2px solid #BFDBFE;color:#2563EB;}' +
      '.cafe-dialog--success .cafe-dialog__icon{background:#F0FDF4;border:2px solid #86EFAC;color:#16A34A;}' +
      '.cafe-dialog--warning .cafe-dialog__icon{background:#FFF7ED;border:2px solid #FED7AA;color:#EA580C;}' +
      '.cafe-dialog--error .cafe-dialog__icon{background:#FEF2F2;border:2px solid #FECACA;color:#DC2626;}' +
      '.cafe-dialog__title{margin:0 0 .45rem;font-size:1.05rem;font-weight:800;color:#2D3748;line-height:1.35;}' +
      '.cafe-dialog__message{margin:0 0 1.15rem;font-size:.95rem;font-weight:600;color:#4A5568;line-height:1.55;white-space:pre-wrap;word-break:break-word;}' +
      '.cafe-dialog__actions{display:flex;gap:.55rem;flex-wrap:wrap;justify-content:center;}' +
      '.cafe-dialog__btn{min-height:44px;padding:.55rem 1.15rem;border-radius:10px;font-family:inherit;font-size:.95rem;font-weight:700;cursor:pointer;border:1px solid transparent;transition:background .2s,border-color .2s,color .2s;flex:1 1 120px;max-width:100%;}' +
      '.cafe-dialog__btn--primary{background:#2563EB;color:#fff;border-color:#2563EB;}' +
      '.cafe-dialog__btn--primary:hover{background:#1D4ED8;}' +
      '.cafe-dialog__btn--ghost{background:#F8F9FA;color:#2D3748;border-color:#E2E8F0;}' +
      '.cafe-dialog__btn--ghost:hover{background:#EFF6FF;border-color:#BFDBFE;color:#2563EB;}' +
      '.cafe-dialog__btn:focus-visible{outline:3px solid rgba(37,99,235,.35);outline-offset:2px;}';
    document.head.appendChild(style);
  }

  function bringOverlayToFront(el) {
    if (!el || !document.body) return;
    document.body.appendChild(el);
  }

  function ensureOverlay() {
    if (overlay) {
      bringOverlayToFront(overlay);
      return overlay;
    }
    injectStyles();
    overlay = document.createElement('div');
    overlay.id = 'cafeDialogOverlay';
    overlay.className = 'cafe-dialog-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    bringOverlayToFront(overlay);
    return overlay;
  }

  function guessType(message, explicit) {
    if (explicit && TYPE_META[explicit]) return explicit;
    var m = String(message || '').toLowerCase();
    if (/فشل|تعذّر|تعذر|خطأ|error|غير مفتوح|لا يمكن/.test(m)) return 'error';
    if (/تم |نجاح|بنجاح|success/.test(m)) return 'success';
    if (/تأكيد|حذف|؟|\?/.test(m)) return 'warning';
    return 'info';
  }

  function enqueue(job) {
    return new Promise(function (resolve) {
      queue.push({ job: job, resolve: resolve });
      drain();
    });
  }

  function drain() {
    if (busy || !queue.length) return;
    busy = true;
    var item = queue.shift();
    item.job(function (result) {
      busy = false;
      item.resolve(result);
      drain();
    });
  }

  function render(job, done) {
    var opts = job && job.opts ? job.opts : job;
    if (!opts || typeof opts !== 'object') {
      done(false);
      return;
    }
    var meta = TYPE_META[opts.type] || TYPE_META.info;
    var root = ensureOverlay();
    var isConfirm = opts.mode === 'confirm';

    root.innerHTML =
      '<div class="cafe-dialog ' +
      meta.className +
      '" role="alertdialog" aria-modal="true" aria-labelledby="cafeDialogTitle" aria-describedby="cafeDialogMsg">' +
      '<div class="cafe-dialog__icon" aria-hidden="true">' +
      meta.icon +
      '</div>' +
      '<h2 class="cafe-dialog__title" id="cafeDialogTitle">' +
      escapeHtml(opts.title) +
      '</h2>' +
      '<p class="cafe-dialog__message" id="cafeDialogMsg">' +
      escapeHtml(opts.message) +
      '</p>' +
      '<div class="cafe-dialog__actions">' +
      (isConfirm
        ? '<button type="button" class="cafe-dialog__btn cafe-dialog__btn--ghost" data-act="cancel">' +
          escapeHtml(opts.cancelText) +
          '</button>'
        : '') +
      '<button type="button" class="cafe-dialog__btn cafe-dialog__btn--primary" data-act="ok" autofocus>' +
      escapeHtml(opts.okText) +
      '</button>' +
      '</div></div>';

    function close(result) {
      root.classList.remove('open');
      root.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onKey);
      done(result);
    }

    function onKey(e) {
      if (e.key === 'Escape' && isConfirm) {
        e.preventDefault();
        close(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    }

    root.querySelector('[data-act="ok"]').addEventListener('click', function () {
      close(true);
    });
    var cancelBtn = root.querySelector('[data-act="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        close(false);
      });
    }
    root.addEventListener('click', function (e) {
      if (e.target === root && isConfirm) close(false);
    });

    document.addEventListener('keydown', onKey);
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    bringOverlayToFront(root);
    var ok = root.querySelector('[data-act="ok"]');
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        root.classList.add('open');
        root.setAttribute('aria-hidden', 'false');
        if (ok) ok.focus();
      });
    });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function alert(message, options) {
    options = options || {};
    var msg = String(message == null ? '' : message);
    return enqueue(function (done) {
      render(
        {
          mode: 'alert',
          message: msg,
          title: options.title || 'تنبيه',
          type: guessType(msg, options.type),
          okText: options.okText || 'حسناً',
        },
        function () {
          done(true);
        }
      );
    });
  }

  function confirm(message, options) {
    options = options || {};
    var msg = String(message == null ? '' : message);
    return enqueue(function (done) {
      render(
        {
          mode: 'confirm',
          message: msg,
          title: options.title || 'تأكيد',
          type: guessType(msg, options.type || 'warning'),
          okText: options.okText || 'نعم',
          cancelText: options.cancelText || 'إلغاء',
        },
        done
      );
    });
  }

  function installGlobal() {
    if (installGlobal._done) return;
    installGlobal._done = true;
    var showAlert = alert;
    global.alert = function (message) {
      return showAlert(message);
    };
  }

  global.CafeDialog = {
    alert: alert,
    confirm: confirm,
    install: installGlobal,
    installGlobal: installGlobal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installGlobal);
  } else {
    installGlobal();
  }
})(typeof window !== 'undefined' ? window : this);
