'use strict';

/**
 * saas-login.js
 * Controls the SaaS Login form, validation, minimalist password digit counter, and role-based routing.
 */

(function() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const passwordToggleBtn = document.getElementById('passwordToggleBtn');
  const passwordToggleIcon = document.getElementById('passwordToggleIcon');
  const charCountNum = document.getElementById('charCountNum');
  const digitCountPill = document.getElementById('digitCountPill');
  const submitBtn = document.getElementById('submitBtn');
  const errorBox = document.getElementById('errorBox');

  const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  // Verify SaasAuth is available
  if (typeof SaasAuth === 'undefined') {
    console.error('[saas-login] SaasAuth script was not loaded correctly.');
    return;
  }

  // Check if SaaS Auth is enabled on mount
  SaasAuth.checkStatus().then((enabled) => {
    if (!enabled) {
      // Local Mode is active: redirect to cashier page
      window.location.replace('/cashier');
    }
  });

  // Minimalist Password Digit Counter
  function updatePasswordCounter() {
    if (!passwordInput || !charCountNum) return;
    const len = passwordInput.value.length;
    charCountNum.textContent = len;

    if (digitCountPill) {
      if (len > 0) {
        digitCountPill.classList.add('has-value');
      } else {
        digitCountPill.classList.remove('has-value');
      }
    }
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', updatePasswordCounter);
    updatePasswordCounter();
  }

  // Password visibility toggle helper
  let isPasswordVisible = false;
  if (passwordToggleBtn) {
    passwordToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isPasswordVisible = !isPasswordVisible;
      passwordInput.setAttribute('type', isPasswordVisible ? 'text' : 'password');
      
      if (passwordToggleIcon) {
        passwordToggleIcon.innerHTML = isPasswordVisible ? eyeOffIconSvg : eyeIconSvg;
      }
      passwordToggleBtn.setAttribute('aria-label', isPasswordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
    
    // Trigger shake animation
    errorBox.style.animation = 'none';
    void errorBox.offsetWidth; // trigger reflow
    errorBox.style.animation = 'shake 0.4s ease-in-out';
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.style.display = 'none';
  }

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> <span>جاري التحقق...</span>';

      const data = await SaasAuth.login(email, password);
      
      // Successfully authenticated
      const user = data.user;
      const role = String(user.role || '').toUpperCase();

      // Route By Role
      if (role === 'SUPER_ADMIN') {
        window.location.replace('/superadmin');
      } else if (role === 'OWNER' || role === 'ADMIN') {
        window.location.replace('/admin');
      } else if (role === 'CASHIER') {
        window.location.replace('/cashier');
      } else if (role === 'KITCHEN') {
        window.location.replace('/kitchen');
      } else if (role === 'CAPTAIN') {
        window.location.replace('/captain');
      } else {
        showError('خطأ: الدور الوظيفي غير مدعوم أو غير مصرح له بالدخول');
        SaasAuth.logout();
      }

    } catch (err) {
      showError(err.message || 'فشل الاتصال بالخادم. يرجى المحاولة لاحقاً');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span id="submitBtnText">تسجيل الدخول</span>';
    }
  });
})();


