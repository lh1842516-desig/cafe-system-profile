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
const { getTables } = require('../data/store');
const { CAFE_LOGO_DIR, UPLOADS_DIR } = require('../config');

const ALLOWED_LOGO_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logoStorageFilename(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const safeExt = ALLOWED_LOGO_EXT.has(ext) ? ext : '.png';
  return 'logo' + safeExt;
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureDir(CAFE_LOGO_DIR);
      cb(null, CAFE_LOGO_DIR);
    },
    filename: function (_req, file, cb) {
      cb(null, logoStorageFilename(file.originalname));
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

function removeExistingLogoFiles() {
  ensureDir(CAFE_LOGO_DIR);
  try {
    fs.readdirSync(CAFE_LOGO_DIR).forEach(function (name) {
      if (/^logo\.(png|jpe?g|webp)$/i.test(name)) {
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

  router.get('/cafe', function (_req, res) {
    res.json(cafeSettingsStore.getCafeSettings());
  });

  function handleKitchenApprovalUpdate(req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (body.requireCashierKitchenApproval === undefined) {
        return res.status(400).json({ error: 'requireCashierKitchenApproval مطلوب' });
      }
      const saved = cafeSettingsStore.saveCafeSettings({
        requireCashierKitchenApproval: !!body.requireCashierKitchenApproval,
      });
      let approvedOrderIds = [];
      if (!saved.requireCashierKitchenApproval) {
        approvedOrderIds = kitchenCashierApproval.approveAllHeldOrdersForCashier(io);
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

  router.post('/cafe/kitchen-approval', handleKitchenApprovalUpdate);
  router.patch('/cafe/kitchen-approval', handleKitchenApprovalUpdate);

  router.put('/cafe', async function (req, res) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const name = String(body.cafeName != null ? body.cafeName : '').trim();
      if (!name) {
        return res.status(400).json({ error: 'اسم الكافيه مطلوب' });
      }
      if (name.length > 80) {
        return res.status(400).json({ error: 'اسم الكافيه طويل جداً' });
      }
      const previousName = String(cafeSettingsStore.getCafeSettings().cafeName || '').trim();
      const saved = cafeSettingsStore.saveCafeSettings({ cafeName: name });
      let tableQrsRegenerated = 0;
      if (previousName !== name) {
        try {
          const qrResults = await tableQrService.regenerateAllTableQrs(getTables(), req);
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

  router.post('/cafe/logo', function (req, res) {
    removeExistingLogoFiles();
    logoUpload.single('logo')(req, res, function (err) {
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
        const rel = '/uploads/cafe-logo/' + req.file.filename;
        const saved = cafeSettingsStore.saveCafeSettings({ logoUrl: rel });
        emitSettingsUpdated(io, saved);
        res.json(saved);
      } catch (e2) {
        res.status(500).json({ error: e2.message || 'فشل حفظ الشعار' });
      }
    });
  });

  function handleDeleteCafeLogo(_req, res) {
    try {
      removeExistingLogoFiles();
      const saved = cafeSettingsStore.clearLogoUrl();
      emitSettingsUpdated(io, saved);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل حذف الشعار' });
    }
  }

  router.post('/cafe/logo/delete', handleDeleteCafeLogo);
  router.delete('/cafe/logo', handleDeleteCafeLogo);

  router.get('/tables', function (_req, res) {
    try {
      const tables = tableManagementService.listTablesWithQrStatus();
      res.json({ count: tables.length, tables });
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل تحميل الطاولات' });
    }
  });

  router.post('/tables', async function (req, res) {
    try {
      const result = await tableManagementService.addTable(req);
      emitTablesUpdated(io, { reason: 'table-added', tableId: result.table.id });
      res.status(201).json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'فشل إضافة الطاولة' });
    }
  });

  router.delete('/tables/:tableId', async function (req, res) {
    try {
      const result = await tableManagementService.deleteTable(req.params.tableId, req);
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

  router.post('/tables/:tableId/regenerate-qr', async function (req, res) {
    try {
      const result = await tableManagementService.regenerateTableQr(req.params.tableId, req);
      emitTablesUpdated(io, { reason: 'qr-regenerated', tableId: result.tableId });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'فشل توليد QR' });
    }
  });

  return router;
}

module.exports = createSettingsRouter;
