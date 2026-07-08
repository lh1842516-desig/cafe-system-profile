/**
 * NotificationCenter — إشعارات كبيرة وواضحة مع صوت
 * - UI: يعرض popup/شريط إشعارات في أعلى الشاشة
 * - Audio: أصوات مختلفة لكل نوع (سياق صوتي واحد + resume لسياسة المتصفح/الموبايل)
 * - Reusable: يمكن استدعاؤه من أي صفحة
 */
(function () {
  var NotificationCenter = {};

  var containerId = 'coNotifCenter';
  var lastByType = {}; // { [type]: { ts, el, count } }

  var DEFAULT_TTL_MS = 4200;
  var GROUP_WINDOW_MS = 2000;
  /** نفس مفتاح VoiceNotify — كتم يوقف النغمة والنطق مع الإبقاء على الإشعار المرئي */
  var LS_NOTIFY_SOUND_MUTED = 'cafeVoiceMuted';
  var audioUnlocked = false;

  function isNotifySoundMuted() {
    try {
      return localStorage.getItem(LS_NOTIFY_SOUND_MUTED) === '1';
    } catch (_) {
      return false;
    }
  }

  /** سياق واحد يبقى مفتوحاً؛ إنشاء سياق جديد في كل تنبيه يُعلّقه الموبايل بدون resume */
  var sharedAudioCtx = null;

  function getOrCreateAudioContext() {
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextCtor();
    }
    return sharedAudioCtx;
  }

  /**
   * تشغيل دالة بعد إيقاظ السياق (ضروري لـ Chrome/Android/iOS عند وصول أحداث Socket بدون نقر سابق).
   */
  function runWithAudio(fn) {
    var ctx = getOrCreateAudioContext();
    if (!ctx) return;
    function go() {
      try {
        fn(ctx);
      } catch (_) {}
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      ctx.resume().then(go).catch(go);
    } else {
      go();
    }
  }

  function ensureContainer() {
    var el = document.getElementById(containerId);
    if (el) return el;
    el = document.createElement('div');
    el.id = containerId;
    el.className = 'co-notif-center';
    document.body.appendChild(el);

    var style = document.createElement('style');
    style.textContent =
      '.co-notif-center{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:12px;align-items:center;pointer-events:none;}' +
      '.co-notif{width:min(560px,calc(100vw - 24px));pointer-events:none;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:16px;border:1px solid #E2E8F0;background:#FFFFFF;color:#2D3748;box-shadow:0 8px 28px rgba(45,55,72,0.14);animation:coNotifEnter .22s ease-out;}' +
      '.co-notif__icon{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:18px;font-weight:900;}' +
      '.co-notif__content{flex:1 1 auto;min-width:0;}' +
      '.co-notif__title{font-size:16px;font-weight:900;margin:0 0 4px 0;color:#2D3748;}' +
      '.co-notif__msg{font-size:14px;margin:0;line-height:1.45;word-break:break-word;color:#4A5568;font-weight:600;}' +
      '.co-notif__count{display:inline-block;margin-inline-start:8px;padding:2px 8px;border-radius:999px;background:rgba(37,99,235,0.1);color:#2563EB;font-size:12px;font-weight:900;}' +
      '.co-notif--new{border-color:#FED7AA;background:#FFFBEB;}' +
      '.co-notif--new .co-notif__title{color:#92400E;}' +
      '.co-notif--new .co-notif__icon{background:rgba(234,88,12,0.12);color:#EA580C;border:1px solid rgba(234,88,12,0.35);}' +
      '.co-notif--ready{border-color:#86EFAC;background:#F0FDF4;}' +
      '.co-notif--ready .co-notif__title{color:#166534;}' +
      '.co-notif--ready .co-notif__msg{color:#15803D;}' +
      '.co-notif--ready .co-notif__icon{background:rgba(22,163,74,0.14);color:#16A34A;border:1px solid rgba(22,163,74,0.4);}' +
      '.co-notif--captain{border-color:#FDE68A;background:#FFFBEB;}' +
      '.co-notif--captain .co-notif__title{color:#92400E;}' +
      '.co-notif--captain .co-notif__msg{color:#B45309;}' +
      '.co-notif--captain .co-notif__icon{background:rgba(217,119,6,0.14);color:#D97706;border:1px solid rgba(217,119,6,0.38);}' +
      '.co-notif--captain-flash{animation:coNotifCaptainFlash 1s ease-in-out infinite alternate;}' +
      '@keyframes coNotifCaptainFlash{from{box-shadow:0 8px 28px rgba(45,55,72,0.14),0 0 0 2px rgba(217,119,6,0);}to{box-shadow:0 10px 32px rgba(45,55,72,0.18),0 0 0 3px rgba(217,119,6,0.35);}}' +
      '.co-notif--bill{border-color:#BBF7D0;background:#F0FDF4;}' +
      '.co-notif--bill .co-notif__title{color:#166534;}' +
      '.co-notif--bill .co-notif__msg{color:#15803D;}' +
      '.co-notif--bill .co-notif__icon{background:rgba(22,163,74,0.12);color:#16A34A;border:1px solid rgba(22,163,74,0.32);}' +
      '.co-notif--bill-flash{animation:coNotifBillFlash 1s ease-in-out infinite alternate;}' +
      '@keyframes coNotifBillFlash{from{box-shadow:0 0 0 0 rgba(22,163,74,0.35);}to{box-shadow:0 0 0 6px rgba(22,163,74,0);}}' +
      '.co-notif--flash{animation:coNotifFlash 1.2s ease-in-out infinite alternate;}' +
      '@keyframes coNotifEnter{from{opacity:0;transform:translateY(-10px) scale(0.98);}to{opacity:1;transform:translateY(0) scale(1);}}' +
      '@keyframes coNotifFlash{from{box-shadow:0 8px 28px rgba(45,55,72,0.14),0 0 0 2px rgba(234,88,12,0);}to{box-shadow:0 10px 32px rgba(45,55,72,0.18),0 0 0 3px rgba(234,88,12,0.35);}}' +
      '@media (prefers-reduced-motion: reduce){.co-notif{animation:none;}.co-notif--flash{animation:none;}}';
    document.head.appendChild(style);

    return el;
  }

  function unlockAudioOnce() {
    runWithAudio(function (ctx) {
      try {
        if (!audioUnlocked) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.frequency.value = 1000;
          o.type = 'sine';
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.00001, ctx.currentTime);
          o.start(ctx.currentTime);
          o.stop(ctx.currentTime + 0.01);
          audioUnlocked = true;
        }
      } catch (_) {}
    });
  }

  /**
   * سياسة المتصفح تمنع الصوت قبل «إيماءة مستخدم». بدل زر مخصص نربط أي تفاعل عادي
   * (لمس، نقر، مفتاح) حتى يُفعّل السياق تلقائياً عند استخدام الشاشة.
   * تُزال المستمعات بعد أن يصبح السياق running لتقليل العمل.
   */
  function bindAutoplayUntilRunning() {
    var EVENTS = ['pointerdown', 'touchstart', 'click', 'keydown'];
    var listenerOptions = { capture: true, passive: true };

    function detachIfRunning() {
      var ctx = getOrCreateAudioContext();
      if (!ctx || ctx.state !== 'running') return false;
      EVENTS.forEach(function (name) {
        window.removeEventListener(name, onUserGesture, listenerOptions);
      });
      return true;
    }

    function onUserGesture() {
      unlockAudioOnce();
      var ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (detachIfRunning()) return;
      if (ctx.resume) {
        ctx.resume().then(function () {
          detachIfRunning();
        }).catch(function () {
          detachIfRunning();
        });
      }
      setTimeout(detachIfRunning, 150);
    }

    EVENTS.forEach(function (name) {
      window.addEventListener(name, onUserGesture, listenerOptions);
    });
  }

  bindAutoplayUntilRunning();

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function safePlaySound(fn) {
    try {
      fn();
    } catch (_) {}
  }

  function playSoundNew() {
    if (isNotifySoundMuted()) return;
    safePlaySound(function () {
      runWithAudio(function (ctx) {
        var now = ctx.currentTime;

        function beep(freq, t) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.frequency.value = freq;
          o.type = 'square';
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          o.start(t);
          o.stop(t + 0.22);
        }

        beep(880, now + 0.0);
        beep(1175, now + 0.2);
      });
    });
  }

  function playSoundCaptain() {
    if (isNotifySoundMuted()) return;
    safePlaySound(function () {
      runWithAudio(function (ctx) {
        var now = ctx.currentTime;

        function chime(freq, t, dur) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.frequency.value = freq;
          o.type = 'sine';
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.start(t);
          o.stop(t + dur + 0.02);
        }

        chime(659.25, now + 0.0, 0.22);
        chime(783.99, now + 0.24, 0.22);
        chime(987.77, now + 0.48, 0.28);
      });
    });
  }

  function playSoundReady() {
    if (isNotifySoundMuted()) return;
    safePlaySound(function () {
      runWithAudio(function (ctx) {
        var now = ctx.currentTime;

        function tone(freq, t, type) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.frequency.value = freq;
          o.type = type || 'triangle';
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
          o.start(t);
          o.stop(t + 0.3);
        }

        tone(523.25, now + 0.0, 'triangle');
        tone(783.99, now + 0.26, 'sine');
      });
    });
  }

  function notify(opts) {
    opts = opts || {};
    var type = opts.type || 'new'; // 'new' | 'ready' | 'captain' | 'bill'
    var skipSound = !!opts.skipSound;
    var ttl = opts.ttlMs || DEFAULT_TTL_MS;
    var title = opts.title || '';
    var message = opts.message || '';

    var icon = type === 'ready' ? '✓' : type === 'captain' ? '🔔' : type === 'bill' ? '💰' : '⟡';
    var cssTypeClass =
      type === 'ready' ? 'co-notif--ready' : type === 'captain' ? 'co-notif--captain' : type === 'bill' ? 'co-notif--bill' : 'co-notif--new';
    var flashClass =
      type === 'captain' ? 'co-notif--captain-flash' : type === 'bill' ? 'co-notif--bill-flash' : type === 'new' ? 'co-notif--flash' : '';

    var center = ensureContainer();

    var now = Date.now();
    var last = lastByType[type];
    if (last && last.el && now - last.ts <= GROUP_WINDOW_MS) {
      last.count += 1;
      last.ts = now;
      var countEl = last.el.querySelector('[data-notif-count]');
      if (countEl) countEl.textContent = '+' + last.count;
      var msgEl = last.el.querySelector('[data-notif-msg]');
      if (msgEl) msgEl.textContent = message;
      if (!skipSound && !isNotifySoundMuted()) {
        if (type === 'ready') playSoundReady();
        else if (type === 'captain') playSoundCaptain();
        else playSoundNew();
      }
      if (flashClass) last.el.classList.add(flashClass);
      setTimeout(function () {
        last.el.classList.remove(flashClass);
      }, 1100);
      return;
    }

    var notif = document.createElement('div');
    notif.className = 'co-notif ' + cssTypeClass + ' ' + flashClass;
    notif.innerHTML =
      '<div class="co-notif__icon" aria-hidden="true">' + escapeHtml(icon) + '</div>' +
      '<div class="co-notif__content">' +
      '<div class="co-notif__title">' + escapeHtml(title) + '</div>' +
      '<div class="co-notif__msg" data-notif-msg>' + escapeHtml(message) + '</div>' +
      (type === 'new'
        ? '<div class="co-notif__count" data-notif-count aria-hidden="true">+1</div>'
        : '') +
      '</div>';

    center.appendChild(notif);

    if (!skipSound && !isNotifySoundMuted()) {
      if (type === 'ready') playSoundReady();
      else if (type === 'captain') playSoundCaptain();
      else playSoundNew();
    }

    setTimeout(function () {
      notif.classList.remove('co-notif--flash', 'co-notif--captain-flash', 'co-notif--bill-flash');
    }, 1200);

    setTimeout(function () {
      if (notif && notif.parentNode) notif.parentNode.removeChild(notif);
      if (lastByType[type] && lastByType[type].el === notif) {
        lastByType[type] = null;
      }
    }, ttl);

    lastByType[type] = { ts: now, el: notif, count: 1 };
  }

  NotificationCenter.notify = notify;
  NotificationCenter.notifyNew = function (payload) {
    return notify(Object.assign({}, payload, { type: 'new' }));
  };
  NotificationCenter.notifyReady = function (payload) {
    return notify(Object.assign({}, payload, { type: 'ready' }));
  };
  NotificationCenter.notifyCaptain = function (payload) {
    return notify(Object.assign({}, payload, { type: 'captain' }));
  };
  NotificationCenter.notifyBill = function (payload) {
    return notify(Object.assign({}, payload, { type: 'bill' }));
  };

  NotificationCenter.playSoundNew = playSoundNew;
  NotificationCenter.playSoundReady = playSoundReady;
  NotificationCenter.playSoundCaptain = playSoundCaptain;
  NotificationCenter.unlockAudio = unlockAudioOnce;
  NotificationCenter.isNotifySoundMuted = isNotifySoundMuted;

  window.NotificationCenter = NotificationCenter;
})();
