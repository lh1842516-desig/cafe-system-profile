/**
 * تطبيق إدارة الكافيه - إعدادات عامة
 * يعمل على الشبكة المحلية (LAN) للوصول من أجهزة متعددة
 */
const path = require('path');

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
};
