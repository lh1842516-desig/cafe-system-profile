'use strict';

/**
 * superadmin.js
 * Platform Super Admin routes for Cafe CRUD and User CRUD.
 */

const express = require('express');
const { authenticateToken } = require('./authMiddleware');
const cafeRepository = require('../repository/cafeRepository');
const userRepository = require('../repository/userRepository');
const saasAuthService = require('../services/saasAuthService');
const config = require('../config');

// Run database migrations for foreign key constraints if in SaaS mode
if (config.SAAS_AUTH_ENABLED) {
  (async () => {
    try {
      const { Client } = require('pg');
      const connectionString = process.env.SUPABASE_DB_URL;
      if (!connectionString) return;
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      await client.query(`
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_till_session_uuid_fkey;
        ALTER TABLE closings DROP CONSTRAINT IF EXISTS closings_till_session_id_fkey;
        ALTER TABLE today_session_history DROP CONSTRAINT IF EXISTS today_session_history_till_session_id_fkey;

        ALTER TABLE orders 
          ADD CONSTRAINT orders_till_session_uuid_fkey 
          FOREIGN KEY (till_session_uuid) 
          REFERENCES till_sessions(id) 
          ON DELETE SET NULL;

        ALTER TABLE closings 
          ADD CONSTRAINT closings_till_session_id_fkey 
          FOREIGN KEY (till_session_id) 
          REFERENCES till_sessions(id) 
          ON DELETE SET NULL;

        ALTER TABLE today_session_history 
          ADD CONSTRAINT today_session_history_till_session_id_fkey 
          FOREIGN KEY (till_session_id) 
          REFERENCES till_sessions(id) 
          ON DELETE SET NULL;
      `);
      await client.end();
      console.log('[Migration] Database foreign key constraints updated successfully.');
    } catch (err) {
      console.error('[Migration] Database foreign key constraints update failed:', err.message);
    }
  })();
}

const router = express.Router();

// Middleware: Enforce Super Admin only in SaaS Mode
router.use(authenticateToken);
router.use((req, res, next) => {
  if (config.SAAS_AUTH_ENABLED) {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'غير مصرح للوصول: تتطلب صلاحية مسؤول المنصة' });
    }
  }
  next();
});

// --- CAFES CRUD ---

// Get all cafes
router.get('/cafes', async (req, res) => {
  try {
    const list = await cafeRepository.getCafes();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a cafe
router.post('/cafes', async (req, res) => {
  try {
    const { name, address, phone, subscriptionStatus } = req.body || {};
    if (!name) return res.status(400).json({ error: 'اسم الكافيه مطلوب' });
    const cafe = await cafeRepository.createCafe({
      name,
      address,
      phone,
      subscriptionStatus,
    });
    res.status(201).json(cafe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a cafe
router.put('/cafes/:id', async (req, res) => {
  try {
    const { name, address, phone, subscriptionStatus } = req.body || {};
    const cafe = await cafeRepository.updateCafe(req.params.id, {
      name,
      address,
      phone,
      subscriptionStatus,
    });
    if (!cafe) return res.status(404).json({ error: 'الكافيه غير موجود' });
    res.json(cafe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a cafe
router.delete('/cafes/:id', async (req, res) => {
  try {
    const success = await cafeRepository.deleteCafe(req.params.id);
    if (!success) return res.status(404).json({ error: 'الكافيه غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USERS CRUD ---

// Get all users
router.get('/users', async (req, res) => {
  try {
    const list = await userRepository.getAllUsers();
    // Exclude password hashes and plain passwords for security
    const sanitized = list.map(u => {
      const { passwordHash, plainPassword, ...rest } = u;
      return rest;
    });
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a user
router.post('/users', async (req, res) => {
  try {
    const { fullName, email, password, role, status, cafeId } = req.body || {};
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'البيانات المرسلة غير كاملة' });
    }
    const normEmail = String(email).trim().toLowerCase();
    const existing = await userRepository.getUserByEmail(null, normEmail);
    if (existing) {
      return res.status(409).json({ error: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر' });
    }

    const targetRole = String(role || '').toUpperCase();
    let finalCafeId = cafeId;
    if (targetRole === 'SUPER_ADMIN') {
      finalCafeId = null;
    } else {
      if (!finalCafeId) {
        return res.status(400).json({ error: 'مطلوب تحديد الكافيه لهذا الدور الوظيفي' });
      }
    }

    const passwordHash = saasAuthService.hashPassword(password);
    const user = await userRepository.createUser(finalCafeId, {
      fullName,
      email: normEmail,
      passwordHash,
      plainPassword: password,
      role: targetRole,
      status: status || 'active',
    });
    
    const { passwordHash: _, ...sanitized } = user;
    res.status(201).json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a user
router.put('/users/:id', async (req, res) => {
  try {
    const { fullName, email, role, status, cafeId } = req.body || {};
    const existing = await userRepository.getUserById(null, req.params.id);
    if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const targetRole = String(role || '').toUpperCase();
    let finalCafeId = cafeId;
    if (targetRole === 'SUPER_ADMIN') {
      finalCafeId = null;
    } else {
      if (!finalCafeId) {
        return res.status(400).json({ error: 'مطلوب تحديد الكافيه لهذا الدور الوظيفي' });
      }
    }

    const user = await userRepository.updateUser(req.params.id, {
      fullName,
      email,
      role: targetRole,
      status,
      cafeId: finalCafeId,
    });
    
    const { passwordHash: _, ...sanitized } = user;
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    const success = await userRepository.deleteUser(req.params.id);
    if (!success) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset user password
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
    const existing = await userRepository.getUserById(null, req.params.id);
    if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const passwordHash = saasAuthService.hashPassword(password);
    await userRepository.updateUser(req.params.id, { passwordHash, plainPassword: password });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
