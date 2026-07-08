/**
 * توافق قديم — يُفضَّل /api/customer/session/suspend|resume مع deviceId.
 */
const express = require('express');
const customerDeviceSession = require('../services/customerDeviceSession');

const router = express.Router();

function readDeviceId(req) {
  const b = req.body || {};
  return String(
    b.deviceId != null
      ? b.deviceId
      : req.query && req.query.deviceId != null
        ? req.query.deviceId
        : ''
  ).trim();
}

router.post('/suspend', (req, res) => {
  try {
    const deviceId = readDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'deviceId مطلوب' });
    }
    const r = customerDeviceSession.markSuspended(deviceId);
    if (!r.ok) return res.status(404).json({ ok: false, error: 'جلسة الجهاز غير موجودة.' });
    return res.json({ ok: true, expiresAt: r.record.expiresAt });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/resume', (req, res) => {
  try {
    const deviceId = readDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'deviceId مطلوب' });
    }
    const r = customerDeviceSession.markResumed(deviceId);
    if (!r.ok) return res.status(404).json({ ok: false, error: 'جلسة الجهاز غير موجودة.' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
