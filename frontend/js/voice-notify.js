/**
 * VoiceNotify — نطق عربي (SpeechSynthesis) مع كتم، ومنع تداخل، وبديل صوتي عند الفشل.
 * اختياري: window.CAFE_VOICE_MP3_FALLBACK = '/path/to.mp3' لملف صوتي بدل النغمة.
 */
(function (global) {
  var LS_MUTE = 'cafeVoiceMuted';
  var MP3_KEY = 'CAFE_VOICE_MP3_FALLBACK';

  var VoiceNotify = {};
  var styleInjected = false;

  function ensureStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.id = 'cafe-voice-notify-styles';
    s.textContent =
      '.cafe-voice-mute-btn{min-width:44px;min-height:44px;padding:0.35rem 0.55rem;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:inherit;font-size:1.15rem;line-height:1;cursor:pointer;transition:background .2s;}' +
      '.cafe-voice-mute-btn:hover{background:rgba(255,255,255,0.12);}' +
      '.cafe-voice-mute-btn:focus{outline:2px solid rgba(100,160,255,0.5);outline-offset:2px;}';
    document.head.appendChild(s);
  }

  function isMuted() {
    try {
      return localStorage.getItem(LS_MUTE) === '1';
    } catch (_) {
      return false;
    }
  }

  function setMuted(muted) {
    try {
      if (muted) localStorage.setItem(LS_MUTE, '1');
      else localStorage.removeItem(LS_MUTE);
    } catch (_) {}
  }

  function toggleMute() {
    setMuted(!isMuted());
    return isMuted();
  }

  function playChimeFallback(kind) {
    if (isMuted()) return;
    var NC = global.NotificationCenter;
    if (!NC) return;
    if (kind === 'ready') {
      if (NC.playSoundReady) NC.playSoundReady();
    } else if (NC.playSoundNew) {
      NC.playSoundNew();
    }
  }

  function playMp3OrChime(kind) {
    if (isMuted()) return;
    var url = global[MP3_KEY] || global.CAFE_VOICE_MP3_FALLBACK;
    if (!url) {
      playChimeFallback(kind);
      return;
    }
    try {
      var a = new Audio(url);
      a.volume = 0.75;
      var done = false;
      function fallback() {
        if (done) return;
        done = true;
        playChimeFallback(kind);
      }
      a.addEventListener('error', fallback);
      a.addEventListener('ended', function () {
        done = true;
      });
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(fallback);
    } catch (_) {
      playChimeFallback(kind);
    }
  }

  /** أرقام لاتينية → أرقام عربية شرقية لنطق أوضح بالعربية */
  function toArabicIndicDigits(str) {
    var map = { '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩' };
    return String(str).replace(/[0-9]/g, function (d) {
      return map[d] || d;
    });
  }

  /** استخراج رقم/تسمية الطاولة للنطق فقط */
  function normalizeTableNumberForSpeech(tableId) {
    var s = String(tableId == null ? '' : tableId).trim();
    s = s.replace(/^طاولة\s*/i, '');
    return toArabicIndicDigits(s);
  }

  /**
   * أولوية: ar-SA ثم ar-EG ثم أي صوت lang يبدأ بـ ar
   */
  function pickArabicVoice() {
    try {
      var voices = speechSynthesis.getVoices();
      if (!voices || !voices.length) return null;
      var i;
      var preferred = ['ar-sa', 'ar-eg', 'ar-ae', 'ar-xa', 'ar'];
      for (var p = 0; p < preferred.length; p++) {
        var want = preferred[p];
        for (i = 0; i < voices.length; i++) {
          var lang = (voices[i].lang || '').toLowerCase().replace(/_/g, '-');
          if (lang === want || lang.indexOf(want + '-') === 0) {
            return voices[i];
          }
        }
      }
      for (i = 0; i < voices.length; i++) {
        if ((voices[i].lang || '').toLowerCase().indexOf('ar') === 0) return voices[i];
      }
    } catch (_) {}
    return null;
  }

  /**
   * إلغاء أي نطق سابق ثم نطق جديد (لا تداخل).
   */
  function speakArabic(text, kind) {
    kind = kind || 'new';
    if (isMuted()) return;

    try {
      if (global.NotificationCenter && typeof NotificationCenter.unlockAudio === 'function') {
        NotificationCenter.unlockAudio();
      }
    } catch (_) {}

    try {
      speechSynthesis.cancel();
    } catch (_) {}

    if (!('speechSynthesis' in global) || !global.SpeechSynthesisUtterance) {
      playMp3OrChime(kind);
      return;
    }

    var ran = false;
    function run() {
      if (ran) return;
      ran = true;

      var u = new global.SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      var v = pickArabicVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang && /^ar/i.test(v.lang) ? v.lang : 'ar-SA';
      } else {
        u.lang = 'ar-SA';
      }

      u.onerror = function () {
        playMp3OrChime(kind);
      };

      try {
        speechSynthesis.speak(u);
      } catch (_) {
        playMp3OrChime(kind);
      }
    }

    if (speechSynthesis.getVoices().length) {
      run();
      return;
    }

    var timeoutId = setTimeout(function () {
      run();
    }, 600);

    function onVoices() {
      speechSynthesis.removeEventListener('voiceschanged', onVoices);
      clearTimeout(timeoutId);
      run();
    }
    speechSynthesis.addEventListener('voiceschanged', onVoices);
  }

  VoiceNotify.isMuted = isMuted;
  VoiceNotify.setMuted = setMuted;
  VoiceNotify.toggleMute = toggleMute;

  function speakArabicSequence(lines, kind) {
    if (isMuted()) return;
    var list = (lines || []).map(function (x) {
      return String(x || '').trim();
    }).filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) {
      speakArabic(list[0], kind);
      return;
    }
    var idx = 0;
    function next() {
      if (idx >= list.length) return;
      var text = list[idx++];
      if (!('speechSynthesis' in global) || !global.SpeechSynthesisUtterance) {
        speakArabic(text, kind);
        if (idx < list.length) setTimeout(next, 1200);
        return;
      }
      try {
        speechSynthesis.cancel();
      } catch (_) {}
      var u = new global.SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      var v = pickArabicVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang && /^ar/i.test(v.lang) ? v.lang : 'ar-SA';
      } else {
        u.lang = 'ar-SA';
      }
      u.onend = function () {
        setTimeout(next, 280);
      };
      u.onerror = function () {
        setTimeout(next, 400);
      };
      try {
        speechSynthesis.speak(u);
      } catch (_) {
        setTimeout(next, 400);
      }
    }
    try {
      if (global.NotificationCenter && typeof NotificationCenter.unlockAudio === 'function') {
        NotificationCenter.unlockAudio();
      }
    } catch (_) {}
    next();
  }

  VoiceNotify.speakArabicSequence = speakArabicSequence;

  VoiceNotify.announceKitchenNew = function (tableId, orderType) {
    var type = String(orderType || '').trim().toUpperCase();
    var tid = String(tableId || '').trim().toUpperCase();
    if (!type && tid === 'TAKEAWAY') type = 'TAKEAWAY';
    if (!type && tid === 'DELIVERY') type = 'DELIVERY';
    if (type === 'TAKEAWAY') {
      speakArabic('تم وصول طلب سفري جديد', 'new');
      return;
    }
    if (type === 'DELIVERY') {
      speakArabic('تم وصول طلب دلفري جديد', 'new');
      return;
    }
    var num = normalizeTableNumberForSpeech(tableId);
    speakArabic('تم وصول طلب جديد طاولة رقم ' + num, 'new');
  };

  VoiceNotify.announceCashierOrderSent = function (orderType, orderId) {
    var type = String(orderType || '').trim().toUpperCase();
    var typeLabel = type === 'TAKEAWAY' ? 'سفري' : type === 'DELIVERY' ? 'دلفري' : 'داخل الصالة';
    var idSpeech = toArabicIndicDigits(String(orderId || '').replace(/^.*-/, ''));
    speakArabicSequence(
      ['تم إرسال الطلب إلى المطبخ', 'نوع الطلب ' + typeLabel, 'رقم الطلب ' + idSpeech],
      'new'
    );
  };

  VoiceNotify.announceCaptainReady = function (tableId) {
    var num = normalizeTableNumberForSpeech(tableId);
    speakArabic('تم تجهيز طلب طاولة رقم ' + num, 'ready');
  };

  /**
   * @param {HTMLElement} container
   * @param {{ beforeSelector?: string, className?: string }} [options]
   */
  VoiceNotify.mountMuteButton = function (container, options) {
    if (!container) return null;
    ensureStyles();
    options = options || {};

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = options.className || 'cafe-voice-mute-btn';
    btn.setAttribute('aria-pressed', isMuted() ? 'true' : 'false');
    btn.setAttribute('aria-label', 'كتم أو تشغيل صوت التنبيهات (النغمة والنطق)');

    function render() {
      var m = isMuted();
      btn.textContent = m ? '🔇' : '🔊';
      btn.title = m ? 'تشغيل صوت التنبيهات' : 'كتم صوت التنبيهات (مرئي فقط)';
      btn.setAttribute('aria-pressed', m ? 'true' : 'false');
    }
    render();

    btn.addEventListener('click', function () {
      toggleMute();
      render();
    });

    function onStorage(e) {
      if (e.key === LS_MUTE) render();
    }
    window.addEventListener('storage', onStorage);

    if (options.beforeSelector) {
      var ref = container.querySelector(options.beforeSelector);
      if (ref) container.insertBefore(btn, ref);
      else container.appendChild(btn);
    } else {
      container.appendChild(btn);
    }
    return btn;
  };

  global.VoiceNotify = VoiceNotify;
})(typeof window !== 'undefined' ? window : this);
