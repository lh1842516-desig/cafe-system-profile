/**
 * حماية صفحة الأدمن — تسجيل دخول + استعادة برمز ثابت
 */
(function () {
  const AUTH_KEY = 'shotCafeAdminAuth';
  const RECOVERY_CODE = 'alijan2003518';

  const gate = document.getElementById('adminLoginGate');
  const appWrap = document.getElementById('adminAppWrap');
  const form = document.getElementById('adminLoginForm');
  const normalPanel = document.getElementById('adminLoginNormal');
  const recoveryPanel = document.getElementById('adminLoginRecovery');
  const userInput = document.getElementById('adminLoginUser');
  const passInput = document.getElementById('adminLoginPass');
  const recoveryInput = document.getElementById('adminRecoveryCode');
  const errorEl = document.getElementById('adminLoginError');
  const recoveryErrorEl = document.getElementById('adminRecoveryError');
  const btnForgotPass = document.getElementById('btnForgotPass');
  const btnBackToLogin = document.getElementById('btnBackToLogin');
  const btnTogglePass = document.getElementById('btnTogglePass');
  const btnToggleRecovery = document.getElementById('btnToggleRecovery');

  if (!gate || !appWrap || !form) return;

  let recoveryMode = false;
  let loginAnimating = false;
  const loginCard = gate.querySelector('.admin-login-card');
  const submitBtn = form.querySelector('.btn-admin-login');

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function showApp(animateEnter) {
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    gate.classList.remove('is-exiting');
    appWrap.hidden = false;
    appWrap.removeAttribute('aria-hidden');
    document.body.classList.add('admin-authenticated');
    if (animateEnter && !prefersReducedMotion()) {
      appWrap.classList.remove('is-entering');
      void appWrap.offsetWidth;
      appWrap.classList.add('is-entering');
      appWrap.addEventListener('animationend', function onEnterEnd(ev) {
        if (ev.animationName !== 'adminAppEnter') return;
        appWrap.classList.remove('is-entering');
        appWrap.removeEventListener('animationend', onEnterEnd);
      });
    }
  }

  function showLogin() {
    gate.hidden = false;
    gate.removeAttribute('aria-hidden');
    appWrap.hidden = true;
    appWrap.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-authenticated');
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }

  function setInputType(input, visible) {
    if (!input) return;
    const value = input.value;
    input.setAttribute('type', visible ? 'text' : 'password');
    input.value = value;
  }

  function bindEyeToggle(input, btn, labels) {
    if (!input || !btn) return function () {};

    let visible = false;

    function apply() {
      setInputType(input, visible);
      btn.classList.toggle('is-visible', visible);
      const label = visible ? labels.hide : labels.show;
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    function onToggle(e) {
      e.preventDefault();
      e.stopPropagation();
      visible = !visible;
      apply();
      input.focus();
    }

    apply();
    btn.addEventListener('click', onToggle);

    return function reset(showVisible) {
      visible = !!showVisible;
      apply();
    };
  }

  const resetPassVisibility = bindEyeToggle(passInput, btnTogglePass, {
    show: 'إظهار رمز الدخول',
    hide: 'إخفاء رمز الدخول'
  });

  const resetRecoveryVisibility = bindEyeToggle(recoveryInput, btnToggleRecovery, {
    show: 'إظهار رمز الاستيراد',
    hide: 'إخفاء رمز الاستيراد'
  });

  function setRecoveryMode(on) {
    recoveryMode = !!on;
    if (normalPanel) normalPanel.hidden = recoveryMode;
    if (recoveryPanel) recoveryPanel.hidden = !recoveryMode;
    clearError(errorEl);
    clearError(recoveryErrorEl);
    if (recoveryMode) {
      if (recoveryInput) recoveryInput.value = '';
      resetRecoveryVisibility(false);
      recoveryInput && recoveryInput.focus();
    } else {
      userInput && userInput.focus();
    }
  }

  function resetLoginButton() {
    loginAnimating = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-success');
    }
    if (loginCard) loginCard.classList.remove('is-success-pulse');
    gate.classList.remove('is-exiting');
  }

  function shakeLoginCard() {
    if (!loginCard || prefersReducedMotion()) return;
    loginCard.classList.remove('is-shake');
    void loginCard.offsetWidth;
    loginCard.classList.add('is-shake');
    loginCard.addEventListener('animationend', function onShake(ev) {
      if (ev.animationName !== 'adminLoginShake') return;
      loginCard.classList.remove('is-shake');
      loginCard.removeEventListener('animationend', onShake);
    });
  }

  function playLoginSuccessTransition(done) {
    if (prefersReducedMotion()) {
      done();
      return;
    }
    if (loginCard) loginCard.classList.add('is-success-pulse');
    if (submitBtn) {
      submitBtn.classList.add('is-success');
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الدخول…';
    }
    gate.classList.add('is-exiting');
    window.setTimeout(done, 720);
  }

  function grantAccess(animated) {
    if (loginAnimating) return;
    sessionStorage.setItem(AUTH_KEY, '1');
    if (!animated || prefersReducedMotion()) {
      showApp(false);
      resetLoginButton();
      if (submitBtn) submitBtn.textContent = 'دخول';
      return;
    }
    loginAnimating = true;
    playLoginSuccessTransition(function () {
      showApp(true);
      resetLoginButton();
      if (submitBtn) submitBtn.textContent = 'دخول';
    });
  }

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    showApp(false);
  } else {
    showLogin();
    setRecoveryMode(false);
    userInput && userInput.focus();
  }

  btnForgotPass && btnForgotPass.addEventListener('click', function () {
    setRecoveryMode(true);
  });

  btnBackToLogin && btnBackToLogin.addEventListener('click', function () {
    setRecoveryMode(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (recoveryMode) {
      clearError(recoveryErrorEl);
      const code = (recoveryInput && recoveryInput.value || '').trim();
      if (code === RECOVERY_CODE) {
        grantAccess(true);
        return;
      }
      shakeLoginCard();
      showError(recoveryErrorEl, 'رمز الاستيراد غير صحيح');
      if (recoveryInput) {
        recoveryInput.value = '';
        resetRecoveryVisibility(false);
        recoveryInput.focus();
      }
      return;
    }

    clearError(errorEl);
    const user = (userInput && userInput.value || '').trim();
    const pass = passInput && passInput.value || '';

    if (!user || !pass) {
      shakeLoginCard();
      showError(errorEl, 'يرجى إدخال اسم المستخدم ورمز الدخول');
      return;
    }

    if (loginAnimating) return;
    loginAnimating = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري التحقق…';
    }

    function failLogin(msg) {
      loginAnimating = false;
      resetLoginButton();
      if (submitBtn) submitBtn.textContent = 'دخول';
      shakeLoginCard();
      showError(errorEl, msg || 'اسم المستخدم أو رمز الدخول غير صحيح');
      if (passInput) {
        passInput.value = '';
        resetPassVisibility(false);
        passInput.focus();
      }
    }

    var loginApi = window.api && window.api.admin && window.api.admin.login;
    if (typeof loginApi !== 'function') {
      failLogin('تعذر الاتصال بالخادم');
      return;
    }

    loginApi(user, pass)
      .then(function (res) {
        if (res && res.ok) {
          loginAnimating = false;
          grantAccess(true);
          return;
        }
        failLogin('اسم المستخدم أو رمز الدخول غير صحيح');
      })
      .catch(function () {
        failLogin('اسم المستخدم أو رمز الدخول غير صحيح');
      });
  });
})();
