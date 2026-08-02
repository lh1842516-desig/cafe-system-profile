/**
 * API إعدادات الأدمن — الكافيه والطاولات.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cafeSettingsStore = require('../services/cafeSettingsStore');
const kitchenCashierApproval = require('../services/kitchenCashierApproval');
const tableManagementService = require('../services/tableManagementService');
const tableQrService = require('../services/tableQrService');
const { authenticateToken, optionalToken } = require('./authMiddleware');
const tableRepo = require('../repository/tableRepository');
const { CAFE_LOGO_DIR, UPLOADS_DIR } = require('../config');

const ALLOWED_LOGO_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logoStorageFilename(cafeId, originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const safeExt = ALLOWED_LOGO_EXT.has(ext) ? ext : '.png';
  const prefix = cafeId ? String(cafeId).replace(/[^a-zA-Z0-9_-]/g, '') : 'logo';
  return 'logo-' + prefix + safeExt;
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureDir(CAFE_LOGO_DIR);
      cb(null, CAFE_LOGO_DIR);
    },
    filename: function (req, file, cb) {
      cb(null, logoStorageFilename(req.cafeId, file.originalname));
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (ALLOWED_LOGO_EXT.has(ext) && ALLOWED_LOGO_MIME.has(mime)) {
      cb(null, true);
      return;
    }
    cb(new Error('invalid_logo_type'));
  },
});

function removeExistingLogoFiles(cafeId) {
  ensureDir(CAFE_LOGO_DIR);
  const prefix = cafeId ? String(cafeId).replace(/[^a-zA-Z0-9_-]/g, '') : 'logo';
  const pattern = new RegExp('^logo-' + prefix + '\\.(png|jpe?g|webp)$', 'i');
  try {
    fs.readdirSync(CAFE_LOGO_DIR).forEach(function (name) {
      if (pattern.test(name)) {
        try {
          fs.unlinkSync(path.join(CAFE_LOGO_DIR, name));
        } catch (_) {}
      }
    });
  } catch (_) {}
}

function emitSettingsUpdated(io, payload) {
  if (!io) return;
  try {
    io.emit('cafe-settings-updated', payload || {});
  } catch (_) {}
}

function emitTablesUpdated(io, payload) {
  if (!io) return;
  try {
    io.emit('tables-updated', payload || {});
  } catch (_) {}
}

function createSettingsRouter(io) {
  const router = express.Router();

  router.get('/cafe', optionalToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const settings = await cafeSettingsStore.getCafeSettings(cafeId);
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل تحميل الإعدادات' });
    }
  });

  async function handleKitchenApprovalUpdate(req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (body.requireCashierKitchenApproval === undefined) {
        return res.status(400).json({ error: 'requireCashierKitchenApproval مطلوب' });
      }
      const cafeId = req.cafeId;
      const saved = await cafeSettingsStore.saveCafeSettings(cafeId, {
        requireCashierKitchenApproval: !!body.requireCashierKitchenApproval,
      });
      let approvedOrderIds = [];
      if (!saved.requireCashierKitchenApproval) {
        approvedOrderIds = await kitchenCashierApproval.approveAllHeldOrdersForCashier(cafeId, io);
      }
      emitSettingsUpdated(io, saved);
      res.json({
        settings: saved,
        approvedOrderIds: approvedOrderIds,
        autoApprovalEnabled: !saved.requireCashierKitchenApproval,
      });
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل حفظ الإعداد' });
    }
  }

  router.post('/cafe/kitchen-approval', authenticateToken, handleKitchenApprovalUpdate);
  router.patch('/cafe/kitchen-approval', authenticateToken, handleKitchenApprovalUpdate);

  router.put('/cafe', authenticateToken, async function (req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const name = String(body.cafeName != null ? body.cafeName : '').trim();
      if (!name) {
        return res.status(400).json({ error: 'اسم الكافيه مطلوب' });
      }
      if (name.length > 80) {
        return res.status(400).json({ error: 'اسم الكافيه طويل جداً' });
      }
      const cafeId = req.cafeId;
      const previousSettings = await cafeSettingsStore.getCafeSettings(cafeId);
      const previousName = String(previousSettings.cafeName || '').trim();
      const saved = await cafeSettingsStore.saveCafeSettings(cafeId, { cafeName: name });
      let tableQrsRegenerated = 0;
      if (previousName !== name) {
        try {
          const qrResults = await tableQrService.regenerateAllTableQrs(cafeId, await tableRepo.getTables(cafeId), req);
          tableQrsRegenerated = Array.isArray(qrResults) ? qrResults.length : 0;
        } catch (qrErr) {
          console.warn(
            '[QR] تعذّر تحديث بطاقات الطاولات بعد تغيير اسم الكافيه:',
            qrErr && qrErr.message ? qrErr.message : qrErr
          );
        }
      }
      emitSettingsUpdated(io, saved);
      res.json(Object.assign({}, saved, { tableQrsRegenerated: tableQrsRegenerated }));
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل حفظ الإعدادات' });
    }
  });

  router.post('/cafe/logo', authenticateToken, function (req, res) {
    const cafeId = req.cafeId;
    removeExistingLogoFiles(cafeId);
    logoUpload.single('logo')(req, res, async function (err) {
      if (err) {
        const msg =
          err.message === 'invalid_logo_type'
            ? 'نوع الصورة غير مدعوم. استخدم png أو jpg أو webp'
            : err.message || 'فشل رفع الشعار';
        return res.status(400).json({ error: msg });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'لم يتم رفع ملف' });
      }
      try {
        let logoUrl = '/uploads/cafe-logo/' + req.file.filename;
        try {
          const { getClient } = require('../lib/supabase');
          const supabase = getClient();
          const fileBuffer = fs.readFileSync(req.file.path);
          const storagePath = `cafe-logo/${req.file.filename}`;
          const { error: upErr } = await supabase.storage.from('uploads').upload(storagePath, fileBuffer, {
            contentType: req.file.mimetype || 'image/png',
            upsert: true
          });
          if (!upErr) {
            const { data: pubUrlData } = supabase.storage.from('uploads').getPublicUrl(storagePath);
            if (pubUrlData && pubUrlData.publicUrl) logoUrl = pubUrlData.publicUrl;
          }
        } catch (_) {}

        const saved = await cafeSettingsStore.saveCafeSettings(cafeId, { logoUrl });
        emitSettingsUpdated(io, saved);
        res.json(saved);
      } catch (e2) {
        res.status(500).json({ error: e2.message || 'فشل حفظ الشعار' });
      }
    });
  });

  async function handleDeleteCafeLogo(req, res) {
    try {
      const cafeId = req.cafeId;
      removeExistingLogoFiles(cafeId);
      const saved = await cafeSettingsStore.clearLogoUrl(cafeId);
      emitSettingsUpdated(io, saved);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل حذف الشعار' });
    }
  }

  router.post('/cafe/logo/delete', authenticateToken, handleDeleteCafeLogo);
  router.delete('/cafe/logo', authenticateToken, handleDeleteCafeLogo);

  router.get('/tables', authenticateToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const tables = await tableManagementService.listTablesWithQrStatus(cafeId);
      res.json({ count: tables.length, tables });
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل تحميل الطاولات' });
    }
  });

  router.post('/tables', authenticateToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const result = await tableManagementService.addTable(cafeId, req);
      emitTablesUpdated(io, { reason: 'table-added', tableId: result.table.id });
      res.status(201).json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'فشل إضافة الطاولة' });
    }
  });

  router.delete('/tables/:tableId', authenticateToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const result = await tableManagementService.deleteTable(cafeId, req.params.tableId, req);
      emitTablesUpdated(io, { reason: 'table-deleted', tableId: result.deletedId });
      res.json(result);
    } catch (err) {
      const code = err.status || 500;
      const messages = {
        table_has_open_orders: 'لا يمكن حذف الطاولة — يوجد طلب مفتوح عليها',
        table_not_found: 'الطاولة غير موجودة',
        invalid_table_id: 'معرف الطاولة غير صالح',
      };
      res.status(code).json({
        error: messages[err.message] || err.message || 'فشل حذف الطاولة',
      });
    }
  });

  router.post('/tables/:tableId/regenerate-qr', authenticateToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const result = await tableManagementService.regenerateTableQr(cafeId, req.params.tableId, req);
      emitTablesUpdated(io, { reason: 'qr-regenerated', tableId: result.tableId });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'فشل توليد QR' });
    }
  });

  router.get('/tables/:tableId/download-qr', authenticateToken, async function (req, res) {
    try {
      const cafeId = req.cafeId;
      const tid = String(req.params.tableId || '').trim();
      const tables = await tableRepo.getTables(cafeId);
      const exists = tables.some(function (t) {
        return String(t.id) === tid;
      });
      if (!exists) {
        return res.status(403).json({ error: 'غير مصرح لك للوصول لهذه الطاولة' });
      }
      const cardPng = await tableQrService.renderTableQrCardPng(cafeId, tid, req);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'attachment; filename="table_' + tid + '_qr.png"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(cardPng);
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل توليد بطاقة QR' });
    }
  });

  return router;
}

module.exports = createSettingsRouter;
