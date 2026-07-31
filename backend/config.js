/**
 * تطبيق إدارة الكافيه - إعدادات عامة
 * يعمل على الشبكة المحلية (LAN) للوصول من أجهزة متعددة
 */
const path = require('path');
require('./lib/env');

module.exports = {
  PORT: process.env.PORT || 3000,
  /** ضبط CAFE_DEBUG_SOCKET=1 لطباعة أحداث Socket.io في الطرفية (مؤقت للتشخيص) */
  DEBUG_SOCKET: process.env.CAFE_DEBUG_SOCKET === '1' || process.env.CAFE_DEBUG_SOCKET === 'true',
  /** الاستماع على كل واجهات الشبكة (0.0.0.0) للوصول عبر IP الجهاز من أجهزة أخرى */
  HOST: process.env.HOST || '0.0.0.0',
  DATA_DIR: path.join(__dirname, 'data'),
  UPLOADS_DIR: path.join(__dirname, 'uploads'),
  CAFE_LOGO_DIR: path.join(__dirname, 'uploads', 'cafe-logo'),
  TABLE_QRS_DIR: path.join(__dirname, '..', 'table-qrs'),
  CAFE_SETTINGS_FILE: path.join(__dirname, 'data', 'cafe-settings.json'),
  ADMIN_AUTH_FILE: path.join(__dirname, 'data', 'admin-auth.json'),
  MAX_TABLES: 20,
  SAAS_AUTH_ENABLED: process.env.SAAS_AUTH_ENABLED === 'true',
  SAAS_JWT_SECRET: process.env.SAAS_JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => {
    console.warn('[config] WARNING: SAAS_JWT_SECRET is not set in production! Using fallback secret.');
    return 'cafezip-production-fallback-secret-key-2026';
  })() : 'cafezip-fallback-secret-2026'),
};
