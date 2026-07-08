/**
 * API دخول الأدمن وتغيير رمز الدخول.
 */
const express = require('express');
const adminAuthStore = require('../services/adminAuthStore');

function createAdminAuthRouter() {
  const router = express.Router();

  router.post('/login', function (req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const username = body.username != null ? String(body.username) : '';
      const password = body.password != null ? String(body.password) : '';
      const result = adminAuthStore.verifyLogin(username, password);
      if (!result.ok) {
        return res.status(401).json({ ok: false, error: 'اسم المستخدم أو رمز الدخول غير صحيح' });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || 'فشل تسجيل الدخول' });
    }
  });

  router.put('/password', function (req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = adminAuthStore.changePassword(
        body.currentPassword,
        body.newPassword,
        body.confirmPassword
      );
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.message || 'فشل تغيير الرمز' });
      }
      res.json({ ok: true, message: 'تم تغيير رمز الدخول بنجاح' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || 'فشل تغيير الرمز' });
    }
  });

  return router;
}

module.exports = createAdminAuthRouter;
