'use strict';

/**
 * saas-login.js
 * Controls the SaaS Login form, validation, and role-based routing.
 */

(function() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const passwordToggleBtn = document.getElementById('passwordToggleBtn');
  const submitBtn = document.getElementById('submitBtn');
  const errorBox = document.getElementById('errorBox');

  // Verify SaasAuth is available
  if (typeof SaasAuth === 'undefined') {
    console.error('[saas-login] SaasAuth script was not loaded correctly.');
    return;
  }

  // Check if SaaS Auth is enabled on mount
  SaasAuth.checkStatus().then((enabled) => {
    if (!enabled) {
      // Local Mode is active: redirect back to home hub immediately
      window.location.replace('/');
    }
  });

  // Password visibility toggle helper
  let isPasswordVisible = false;
  passwordToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isPasswordVisible = !isPasswordVisible;
    passwordInput.setAttribute('type', isPasswordVisible ? 'text' : 'password');
    passwordToggleBtn.textContent = isPasswordVisible ? 'إخفاء' : 'عرض';
    passwordToggleBtn.setAttribute('aria-label', isPasswordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
  });

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
      submitBtn.textContent = 'جاري التحقق...';

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
      submitBtn.textContent = 'تسجيل الدخول';
    }
  });
})();
