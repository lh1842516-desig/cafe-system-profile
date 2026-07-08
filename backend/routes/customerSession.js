/**
 * API استعادة جلسة الزبون (cold start / iOS Safari) + تعليق/استئناف جهاز iPhone.
 */
const express = require('express');
const customerSessionRestore = require('../services/customerSessionRestore');
const customerDeviceSession = require('../services/customerDeviceSession');
const customerSessionCookie = require('../services/customerSessionCookie');

const router = express.Router();

function readDeviceId(req) {
  const b = req.body || {};
  const q = req.query || {};
  return norm(
    b.deviceId != null
      ? b.deviceId
      : q.deviceId != null
        ? q.deviceId
        : ''
  );
}

function norm(v) {
  return String(v != null ? v : '').trim();
}

router.get('/restore', (req, res) => {
  try {
    const freshScan =
      req.query.freshScan === '1' ||
      req.query.freshScan === 'true' ||
      req.query.freshScan === 'yes';
    // الكوكي احتياط عند فقدان الرابط/التخزين (قتل Safari، تصفح خاص، مسح localStorage)
    const cookie = freshScan ? null : customerSessionCookie.readSessionCookie(req);
    const tableId =
      req.query.tableId != null && String(req.query.tableId).trim()
        ? String(req.query.tableId).trim()
        : cookie
          ? cookie.tableId
          : '';
    const customerId = req.query.customerId != null ? String(req.query.customerId).trim() : '';
    const peerSessionId =
      req.query.peerSessionId != null && String(req.query.peerSessionId).trim()
        ? String(req.query.peerSessionId).trim()
        : req.query.sessionId != null && String(req.query.sessionId).trim()
          ? String(req.query.sessionId).trim()
          : req.query.customerSessionId != null && String(req.query.customerSessionId).trim()
            ? String(req.query.customerSessionId).trim()
            : cookie
              ? cookie.sessionId
              : '';
    const activeOrderId =
      req.query.activeOrderId != null
        ? String(req.query.activeOrderId).trim()
        : req.query.orderId != null
          ? String(req.query.orderId).trim()
          : '';
    const iosRecoveryToken =
      req.query.iosRecoveryToken != null ? String(req.query.iosRecoveryToken).trim() : '';
    const deviceId = readDeviceId(req);

    const result = customerSessionRestore.restoreCustomerSession({
      tableId,
      customerId,
      peerSessionId,
      activeOrderId,
      iosRecoveryToken,
      deviceId,
      freshScan,
    });

    // جدّد الكوكي عند نجاح الاستعادة للمنيو
    if (result && result.ok && result.target === 'menu') {
      try {
        customerSessionCookie.setSessionCookie(res, {
          tableId: result.tableId || tableId,
          sessionId: result.peerSessionId || result.sessionId || peerSessionId,
        });
      } catch (_) {}
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, target: 'welcome', error: err.message });
  }
});

/** iOS: بدء مؤقت الساعتين عند إغلاق Safari من مبدّل التطبيقات */
router.post('/suspend', (req, res) => {
  try {
    const deviceId = readDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'deviceId مطلوب' });
    }
    const r = customerDeviceSession.markSuspended(deviceId);
    if (!r.ok) {
      return res.status(404).json({ ok: false, error: 'جلسة الجهاز غير موجودة أو منتهية.' });
    }
    return res.json({ ok: true, expiresAt: r.record.expiresAt, deviceId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** iOS: إيقاف المؤقت عند العودة لنفس التبويب */
router.post('/resume', (req, res) => {
  try {
    const deviceId = readDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'deviceId مطلوب' });
    }
    const r = customerDeviceSession.markResumed(deviceId);
    if (!r.ok) {
      return res.status(404).json({ ok: false, error: 'جلسة الجهاز غير موجودة.' });
    }
    return res.json({ ok: true, deviceId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
