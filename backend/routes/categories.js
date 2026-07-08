/**
 * API التصنيفات — قائمة تصنيفات المنيو (مشتركة بين الأدمن والكابتن والزبون)
 * كل تصنيف: { name, imageUrl } (مع ترحيل تلقائي من مصفوفة نصوص قديمة)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { getMenu, saveMenu } = require('../data/store');

const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function categoryName(c) {
  if (c == null) return '';
  if (typeof c === 'object' && !Array.isArray(c)) {
    return String(c.name != null ? c.name : '').trim();
  }
  return String(c).trim();
}

function normalizeCategoryEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const name = String(entry.name != null ? entry.name : '').trim();
    if (!name) return null;
    const raw = entry.imageUrl;
    const imageUrl = raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
    return { name, imageUrl };
  }
  const name = String(entry).trim();
  if (!name) return null;
  return { name, imageUrl: null };
}

function normalizeCategoryList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach((raw) => {
    const n = normalizeCategoryEntry(raw);
    if (n) out.push(n);
  });
  return out;
}

function readCategories() {
  ensureDir(path.dirname(CATEGORIES_FILE));
  if (!fs.existsSync(CATEGORIES_FILE)) return [];
  try {
    const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const arr = JSON.parse(data);
    if (!Array.isArray(arr)) return [];
    const needsMigrate = arr.some((x) => typeof x === 'string');
    const list = normalizeCategoryList(arr);
    if (needsMigrate) saveCategories(list);
    return list;
  } catch {
    return [];
  }
}

function saveCategories(arr) {
  ensureDir(path.dirname(CATEGORIES_FILE));
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

const router = express.Router();

function doDeleteCategory(name) {
  const list = readCategories();
  const isUncategorized = name === '';
  if (isUncategorized) {
    const menu = getMenu();
    const filtered = menu.filter((item) => {
      const cat = item.category != null ? String(item.category).trim() : '';
      return cat !== '';
    });
    if (filtered.length !== menu.length) saveMenu(filtered);
    return { list };
  }
  const normalized = name.toLowerCase();
  const idx = list.findIndex((c) => categoryName(c).toLowerCase() === normalized);
  if (idx === -1) return { error: 'التصنيف غير موجود', status: 404 };
  list.splice(idx, 1);
  saveCategories(list);
  const menu = getMenu();
  const filtered = menu.filter((item) => {
    const cat = item.category != null ? String(item.category).trim() : '';
    return cat.toLowerCase() !== normalized;
  });
  if (filtered.length !== menu.length) saveMenu(filtered);
  return { list };
}

function applyCategoryRename(oldName, newName) {
  const newNorm = newName.toLowerCase();
  const oldNorm = oldName.toLowerCase();
  if (!newName) return { error: 'الاسم الجديد مطلوب', status: 400 };
  if (oldNorm === newNorm) return { error: 'الاسم الجديد مطابق للقديم', status: 400 };
  const list = readCategories();
  if (list.some((c) => categoryName(c).toLowerCase() === newNorm)) {
    return { error: 'اسم تصنيف بهذا الاسم موجود مسبقاً', status: 400 };
  }
  const menu = getMenu();
  if (oldName === '') {
    list.push({ name: newName, imageUrl: null });
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    saveCategories(list);
  } else {
    const idx = list.findIndex((c) => categoryName(c).toLowerCase() === oldNorm);
    if (idx === -1) return { error: 'التصنيف غير موجود', status: 404 };
    const prev = list[idx];
    const prevImage = typeof prev === 'object' && prev && prev.imageUrl ? prev.imageUrl : null;
    list[idx] = { name: newName, imageUrl: prevImage };
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    saveCategories(list);
  }
  let changed = false;
  menu.forEach((item) => {
    const cat = item.category != null ? String(item.category).trim() : '';
    if ((oldName === '' && cat === '') || (oldName !== '' && cat.toLowerCase() === oldNorm)) {
      item.category = newName;
      changed = true;
    }
  });
  if (changed) saveMenu(menu);
  return { list: readCategories() };
}

// مسار الحذف أولاً (قبل '/' لئلا يُفسَّر "delete" كجزء من مسار آخر). name فارغ = حذف منتجات «بدون تصنيف» فقط
router.post('/delete', (req, res) => {
  try {
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    const result = doDeleteCategory(name);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/categories/rename — تغيير اسم تصنيف (oldName → newName) في القائمة وفي كل المنتجات */
router.post('/rename', (req, res) => {
  try {
    const oldName = req.body && req.body.oldName != null ? String(req.body.oldName).trim() : '';
    const newName = req.body && req.body.newName != null ? String(req.body.newName).trim() : '';
    const result = applyCategoryRename(oldName, newName);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/categories/image — تعيين أو إزالة صورة التصنيف */
function setCategoryImageHandler(req, res) {
  try {
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    const rawUrl = req.body && Object.prototype.hasOwnProperty.call(req.body, 'imageUrl') ? req.body.imageUrl : undefined;
    if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
    const list = readCategories();
    const idx = list.findIndex((c) => categoryName(c).toLowerCase() === name.toLowerCase());
    if (idx === -1) return res.status(404).json({ error: 'التصنيف غير موجود' });
    const imageUrl =
      rawUrl === null || rawUrl === undefined || rawUrl === ''
        ? null
        : String(rawUrl).trim() || null;
    list[idx] = { name: categoryName(list[idx]), imageUrl };
    saveCategories(list);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
router.post('/image', setCategoryImageHandler);

/** GET /api/categories — قائمة التصنيفات */
router.get('/', (req, res) => {
  try {
    const list = readCategories();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/categories — إضافة تصنيف جديد (بدون تكرار) */
router.post('/', (req, res) => {
  try {
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
    const list = readCategories();
    const normalized = name.toLowerCase();
    if (list.some((c) => categoryName(c).toLowerCase() === normalized)) {
      return res.status(400).json({ error: 'هذا التصنيف موجود مسبقاً' });
    }
    list.push({ name, imageUrl: null });
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    saveCategories(list);
    res.status(201).json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/categories?name=... — حذف تصنيف وجميع منتجاته */
router.delete('/', (req, res) => {
  try {
    const name = (req.query.name != null ? String(req.query.name) : (req.body && req.body.name != null ? String(req.body.name) : '')).trim();
    if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
    const result = doDeleteCategory(name);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** معالج حذف التصنيف — للتسجيل المباشر في server.js وتفادي 404 */
function deleteCategoryHandler(req, res) {
  try {
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    const result = doDeleteCategory(name);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** معالج تغيير اسم التصنيف — للتسجيل المباشر في server.js وتفادي 404 */
function renameCategoryHandler(req, res) {
  try {
    const oldName = req.body && req.body.oldName != null ? String(req.body.oldName).trim() : '';
    const newName = req.body && req.body.newName != null ? String(req.body.newName).trim() : '';
    const result = applyCategoryRename(oldName, newName);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = router;
module.exports.deleteCategoryHandler = deleteCategoryHandler;
module.exports.renameCategoryHandler = renameCategoryHandler;
module.exports.setCategoryImageHandler = setCategoryImageHandler;
