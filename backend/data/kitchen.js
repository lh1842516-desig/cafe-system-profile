/**
 * تخزين حالة الطلبات في المطبخ فقط
 * هذا الملف لا يغيّر هيكل الطلبات الأساسية، بل يخزن حالة المطبخ (new / preparing / completed) منفصلة.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const KITCHEN_FILE = path.join(DATA_DIR, 'kitchen.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readKitchenState() {
  ensureDir(path.dirname(KITCHEN_FILE));
  if (!fs.existsSync(KITCHEN_FILE)) return {};
  try {
    const data = fs.readFileSync(KITCHEN_FILE, 'utf8');
    const obj = JSON.parse(data);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveKitchenState(state) {
  ensureDir(path.dirname(KITCHEN_FILE));
  fs.writeFileSync(KITCHEN_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** تصفير حالة المطبخ بعد إغلاق قاصة (جلسة عمل جديدة). */
function resetKitchenState() {
  saveKitchenState({});
}

/**
 * الحصول على حالة طلب معين في المطبخ
 */
function getKitchenStatus(orderId) {
  const state = readKitchenState();
  return state[orderId] || null;
}

/**
 * تحديث حالة طلب في المطبخ
 * status: 'held' | 'new' | 'preparing' | 'completed' (مع دعم قراءة القيم القديمة في routes)
 */
function setKitchenStatus(orderId, status) {
  const state = readKitchenState();
  const now = new Date().toISOString();
  const prev = state[orderId] || {};
  state[orderId] = {
    status,
    updatedAt: now,
    createdAt: prev.createdAt || now,
  };
  saveKitchenState(state);
  return state[orderId];
}

/** إزالة سجل المطبخ للطلب (إلغاء من الزبون قبل التجهيز، إلخ) */
function removeKitchenEntry(orderId) {
  const id = orderId != null ? String(orderId).trim() : '';
  if (!id) return false;
  const state = readKitchenState();
  if (!state[id]) return false;
  delete state[id];
  saveKitchenState(state);
  return true;
}

/** يطابق منطق routes/kitchen.js — للقراءة فقط */
function normalizeKitchenStatusRead(raw) {
  if (!raw || raw === 'pending') return 'new';
  if (raw === 'editing') return 'editing';
  if (raw === 'prepared') return 'preparing';
  if (raw === 'closed') return 'completed';
  if (raw === 'held') return 'held';
  if (raw === 'new' || raw === 'preparing' || raw === 'completed') return String(raw).toLowerCase();
  return 'new';
}

/** طلب «مكتمل في المطبخ» لا يمنع الزبون من إرسال طلب جديد (قد يبقى غير مغلق في القاصة حتى الدفع). */
function isOrderKitchenCompleted(orderId) {
  const ks = getKitchenStatus(orderId);
  return normalizeKitchenStatusRead(ks && ks.status) === 'completed';
}

module.exports = {
  readKitchenState,
  getKitchenState: readKitchenState,
  saveKitchenState,
  resetKitchenState,
  getKitchenStatus,
  setKitchenStatus,
  removeKitchenEntry,
  normalizeKitchenStatusRead,
  isOrderKitchenCompleted,
};

