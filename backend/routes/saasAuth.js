'use strict';

/**
 * saasAuth.js
 * SaaS Authentication router.
 */

const express = require('express');
const userRepository = require('../repository/userRepository');
const saasAuthService = require('../services/saasAuthService');
const { getDefaultCafeId } = require('../lib/cafeContext');

const config = require('../config');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ enabled: !!config.SAAS_AUTH_ENABLED });
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normEmail = String(email || '').trim().toLowerCase();
    const pass = String(password || '');

    if (!normEmail || !pass) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    const cafeId = getDefaultCafeId();

    const user = await userRepository.getUserByEmail(cafeId, normEmail);

    if (!user) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'هذا الحساب معطل حالياً' });
    }

    const isMatch = saasAuthService.comparePassword(pass, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const token = saasAuthService.generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        cafeId: user.cafeId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

module.exports = router;
