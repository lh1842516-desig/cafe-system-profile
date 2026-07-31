'use strict';

/**
 * saas-auth.js
 * Client-side authentication utilities.
 */

(function (global) {
  const TOKEN_KEY = 'cafezip_saas_token';
  const USER_KEY = 'cafezip_saas_user';

  let saasStatusCache = null;

  function decodeJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const jsonStr = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  const SaasAuth = {
    async checkStatus() {
      if (saasStatusCache !== null) {
        return saasStatusCache;
      }
      try {
        const res = await fetch('/api/auth/saas/status');
        if (!res.ok) throw new Error('Status check failed');
        const data = await res.json();
        saasStatusCache = !!data.enabled;
      } catch (err) {
        console.error('[SaasAuth] Error checking SaaS status:', err);
        saasStatusCache = false;
      }
      return saasStatusCache;
    },

    getToken() {
      return sessionStorage.getItem(TOKEN_KEY);
    },

    getUser() {
      try {
        const userStr = sessionStorage.getItem(USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
      } catch (e) {
        return null;
      }
    },

    isTokenValid(token) {
      if (!token) return false;
      const payload = decodeJwt(token);
      if (!payload) return false;
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return false;
      }
      return true;
    },

    logout() {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      window.location.href = '/login';
    },

    async confirmLogout(message, options) {
      const msg = message || 'هل أنت متاكد من الخروج من الصفحة؟';
      const opts = Object.assign({
        title: 'تأكيد الخروج',
        type: 'warning',
        okText: 'نعم',
        cancelText: 'لا'
      }, options || {});

      let ok = false;
      if (window.CafeDialog && typeof window.CafeDialog.confirm === 'function') {
        ok = await window.CafeDialog.confirm(msg, opts);
      } else {
        ok = window.confirm(msg);
      }
      if (ok) {
        this.logout();
      }
      return ok;
    },

    async login(email, password) {
      const response = await fetch('/api/auth/saas/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
      if (data.token && data.user) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
      return data;
    },

    async requireAuth(allowedRoles = []) {
      const enabled = await this.checkStatus();
      if (!enabled) {
        return true;
      }

      const token = this.getToken();
      const user = this.getUser();

      if (!token || !user || !this.isTokenValid(token)) {
        this.logout();
        return false;
      }

      const userRole = String(user.role || '').toUpperCase();
      const upperAllowed = allowedRoles.map(r => r.toUpperCase());

      if (upperAllowed.length > 0 && !upperAllowed.includes(userRole)) {
        document.documentElement.innerHTML = `
          <!DOCTYPE html>
          <html lang="ar" dir="rtl">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>غير مصرح بالوصول</title>
              <style>
                body {
                  background: #1a1d23;
                  color: #e8eaed;
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                  padding: 20px;
                }
                .card {
                  background: #252930;
                  padding: 30px;
                  border-radius: 12px;
                  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                  max-width: 400px;
                  width: 100%;
                }
                h1 {
                  color: #f28b82;
                  font-size: 24px;
                  margin-bottom: 15px;
                }
                p {
                  color: #9aa0a6;
                  margin-bottom: 25px;
                  line-height: 1.6;
                }
                button {
                  background: #8ab4f8;
                  color: #1a1d23;
                  border: none;
                  padding: 12px 24px;
                  border-radius: 8px;
                  font-size: 16px;
                  font-weight: bold;
                  cursor: pointer;
                  transition: background 0.2s;
                }
                button:hover {
                  background: #aecbfa;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>غير مصرح بالوصول 🛑</h1>
                <p>عذراً، لا تملك الصلاحية الكافية للوصول إلى هذه الصفحة. يرجى تسجيل الدخول بحساب مناسب.</p>
                <button id="unauthorizedLogoutBtn">تسجيل الخروج والعودة</button>
              </div>
            </body>
          </html>
        `;
        document.getElementById('unauthorizedLogoutBtn').addEventListener('click', function () {
          SaasAuth.confirmLogout();
        });
        return false;
      }

      return true;
    }
  };

  global.SaasAuth = SaasAuth;
})(typeof window !== 'undefined' ? window : global);
