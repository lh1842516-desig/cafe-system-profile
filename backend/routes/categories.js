/**
 * API التصنيفات — قائمة تصنيفات المنيو (مشتركة بين الأدمن والكابتن والزبون)
 * كل تصنيف: { name, imageUrl } (مع ترحيل تلقائي من مصفوفة نصوص قديمة)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { optionalToken } = require('./authMiddleware');
const menuRepo = require('../repository/menuRepository');
const categoryRepo = require('../repository/categoryRepository');

const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const router = express.Router();

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

function getCategoriesFilePath(cafeId) {
  const cid = String(cafeId || '').trim();
  if (cid) {
    return path.join(DATA_DIR, `categories_${cid}.json`);
  }
  return path.join(DATA_DIR, 'categories.json');
}

function readCategories(cafeId) {
  const cid = String(cafeId || '').trim();
  if (!cid) {
    const defaultFile = path.join(DATA_DIR, 'categories.json');
    ensureDir(path.dirname(defaultFile));
    if (!fs.existsSync(defaultFile)) return [];
    try {
      const data = fs.readFileSync(defaultFile, 'utf8');
      return normalizeCategoryList(JSON.parse(data));
    } catch { return []; }
  }
  const filePath = path.join(DATA_DIR, `categories_${cid}.json`);
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(data);
    if (!Array.isArray(arr)) return [];
    return normalizeCategoryList(arr);
  } catch {
    return [];
  }
}

function saveCategories(arr, cafeId) {
  const filePath = getCategoriesFilePath(cafeId);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf8');
}

router.use(optionalToken);

async function doDeleteCategory(cafeId, name) {
  const list = await categoryRepo.getCategories(cafeId);
  const isUncategorized = name === '';
  if (isUncategorized) {
    const menu = await menuRepo.getMenu(cafeId);
    const filtered = menu.filter((item) => {
      const cat = item.category != null ? String(item.category).trim() : '';
      return cat !== '';
    });
    if (filtered.length !== menu.length) await menuRepo.saveMenu(cafeId, filtered);
    return { list };
  }
  const normalized = name.toLowerCase();
  const idx = list.findIndex((c) => categoryName(c).toLowerCase() === normalized);
  if (idx !== -1) {
    list.splice(idx, 1);
    saveCategories(list, cafeId);
  }
  const menu = await menuRepo.getMenu(cafeId);
  const filtered = menu.filter((item) => {
    const cat = item.category != null ? String(item.category).trim() : '';
    return cat.toLowerCase() !== normalized;
  });
  if (filtered.length !== menu.length) {
    await menuRepo.saveMenu(cafeId, filtered);
  }
  const updatedList = await categoryRepo.getCategories(cafeId);
  return { list: updatedList };
}

async function applyCategoryRename(cafeId, oldName, newName) {
  const newNorm = newName.toLowerCase();
  const oldNorm = oldName.toLowerCase();
  if (!newName) return { error: 'الاسم الجديد مطلوب', status: 400 };
  if (oldNorm === newNorm) return { error: 'الاسم الجديد مطابق للقديم', status: 400 };
  const list = await categoryRepo.getCategories(cafeId);
  if (list.some((c) => categoryName(c).toLowerCase() === newNorm)) {
    return { error: 'اسم تصنيف بهذا الاسم موجود مسبقاً', status: 400 };
  }
  const menu = await menuRepo.getMenu(cafeId);
  if (oldName === '') {
    list.push({ name: newName, imageUrl: null });
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    saveCategories(list, cafeId);
  } else {
    const idx = list.findIndex((c) => categoryName(c).toLowerCase() === oldNorm);
    if (idx === -1) {
      list.push({ name: newName, imageUrl: null });
    } else {
      const prev = list[idx];
      const prevImage = typeof prev === 'object' && prev && prev.imageUrl ? prev.imageUrl : null;
      list[idx] = { name: newName, imageUrl: prevImage };
    }
    list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
    saveCategories(list, cafeId);
  }
  let changed = false;
  menu.forEach((item) => {
    const cat = item.category != null ? String(item.category).trim() : '';
    if ((oldName === '' && cat === '') || (oldName !== '' && cat.toLowerCase() === oldNorm)) {
      item.category = newName;
      changed = true;
    }
  });
  if (changed) await menuRepo.saveMenu(cafeId, menu);
  return { list: await categoryRepo.getCategories(cafeId) };
}

const { emitMenuUpdated } = require('../services/menuRealtime');

function createCategoryRouter(io) {
  const r = express.Router();
  r.use(optionalToken);

  // مسار الحذف أولاً
  r.post('/delete', async (req, res) => {
    try {
      const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
      const result = await doDeleteCategory(req.cafeId, name);
      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      if (io) emitMenuUpdated(io, { reason: 'category-deleted', name }, req.cafeId);
      res.json(result.list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/categories/rename — تغيير اسم تصنيف (oldName → newName) في القائمة وفي كل المنتجات */
  r.post('/rename', async (req, res) => {
    try {
      const oldName = req.body && req.body.oldName != null ? String(req.body.oldName).trim() : '';
      const newName = req.body && req.body.newName != null ? String(req.body.newName).trim() : '';
      const result = await applyCategoryRename(req.cafeId, oldName, newName);
      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      if (io) emitMenuUpdated(io, { reason: 'category-renamed', oldName, newName }, req.cafeId);
      res.json(result.list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/categories/image — تعيين أو إزالة صورة التصنيف */
  r.post('/image', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
      const rawUrl = req.body && Object.prototype.hasOwnProperty.call(req.body, 'imageUrl') ? req.body.imageUrl : undefined;
      if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
      const list = await categoryRepo.getCategories(cafeId);
      const idx = list.findIndex((c) => categoryName(c).toLowerCase() === name.toLowerCase());
      if (idx === -1) return res.status(404).json({ error: 'التصنيف غير موجود' });
      const imageUrl =
        rawUrl === null || rawUrl === undefined || rawUrl === ''
          ? null
          : String(rawUrl).trim() || null;
      list[idx] = { name: categoryName(list[idx]), imageUrl };
      saveCategories(list, cafeId);
      if (io) emitMenuUpdated(io, { reason: 'category-image-updated', name }, cafeId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/categories — قائمة التصنيفات */
  r.get('/', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const list = await categoryRepo.getCategories(cafeId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/categories — إضافة تصنيف جديد (بدون تكرار) */
  r.post('/', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
      if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
      const list = await categoryRepo.getCategories(cafeId);
      const normalized = name.toLowerCase();
      if (list.some((c) => categoryName(c).toLowerCase() === normalized)) {
        return res.status(400).json({ error: 'هذا التصنيف موجود مسبقاً' });
      }
      list.push({ name, imageUrl: null });
      list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'ar'));
      saveCategories(list, cafeId);
      if (io) emitMenuUpdated(io, { reason: 'category-added', name }, cafeId);
      res.status(201).json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** DELETE /api/categories?name=... — حذف تصنيف وجميع منتجاته */
  r.delete('/', async (req, res) => {
    try {
      const name = (req.query.name != null ? String(req.query.name) : (req.body && req.body.name != null ? String(req.body.name) : '')).trim();
      if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
      const result = await doDeleteCategory(req.cafeId, name);
      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      if (io) emitMenuUpdated(io, { reason: 'category-deleted', name }, req.cafeId);
      res.json(result.list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return r;
}

module.exports = createCategoryRouter;
module.exports.createCategoryRouter = createCategoryRouter;

