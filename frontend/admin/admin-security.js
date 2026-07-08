/**
 * إعدادات الأمان — تغيير رمز دخول الأدمن.
 */
(function () {
  'use strict';

  var form = document.getElementById('formSecuritySettings');
  if (!form) return;

  var currentInput = document.getElementById('settingsCurrentPassword');
  var newInput = document.getElementById('settingsNewPassword');
  var confirmInput = document.getElementById('settingsConfirmPassword');
  var errorEl = document.getElementById('settingsSecurityError');
  var submitBtn = document.getElementById('btnSaveSecuritySettings');
  var btnToggleCurrent = document.getElementById('btnToggleCurrentPass');
  var btnToggleNew = document.getElementById('btnToggleNewPass');
  var btnToggleConfirm = document.getElementById('btnToggleConfirmPass');

  function toast(msg) {
    if (window.showToast && typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    try {
      alert(msg);
    } catch (_) {}
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function setInputType(input, visible) {
    if (!input) return;
    var value = input.value;
    input.setAttribute('type', visible ? 'text' : 'password');
    input.value = value;
  }

  function bindEyeToggle(input, btn, labels) {
    if (!input || !btn) return function () {};

    var visible = false;

    function apply() {
      setInputType(input, visible);
      btn.classList.toggle('is-visible', visible);
      var label = visible ? labels.hide : labels.show;
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      visible = !visible;
      apply();
      input.focus();
    });

    apply();

    return function reset(showVisible) {
      visible = !!showVisible;
      apply();
    };
  }

  var resetCurrentVisibility = bindEyeToggle(currentInput, btnToggleCurrent, {
    show: 'إظهار رمز الدخول الحالي',
    hide: 'إخفاء رمز الدخول الحالي',
  });
  var resetNewVisibility = bindEyeToggle(newInput, btnToggleNew, {
    show: 'إظهار الرمز الجديد',
    hide: 'إخفاء الرمز الجديد',
  });
  var resetConfirmVisibility = bindEyeToggle(confirmInput, btnToggleConfirm, {
    show: 'إظهار تأكيد الرمز',
    hide: 'إخفاء تأكيد الرمز',
  });

  function clearForm() {
    if (currentInput) currentInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';
    resetCurrentVisibility(false);
    resetNewVisibility(false);
    resetConfirmVisibility(false);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var current = currentInput ? currentInput.value : '';
    var next = newInput ? newInput.value : '';
    var confirm = confirmInput ? confirmInput.value : '';

    if (!current || !next || !confirm) {
      showError('يرجى تعبئة جميع الحقول');
      return;
    }

    if (!window.api || !window.api.admin || typeof window.api.admin.changePassword !== 'function') {
      showError('تعذر الاتصال بالخادم');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الحفظ…';
    }

    window.api.admin
      .changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      })
      .then(function () {
        clearForm();
        toast('تم تغيير رمز الدخول بنجاح');
      })
      .catch(function (err) {
        showError((err && err.message) || 'فشل تغيير الرمز');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'حفظ التغييرات';
        }
      });
  });
})();
