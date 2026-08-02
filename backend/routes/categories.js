/**
 * API التصنيفات — قائمة تصنيفات المنيو (مشتركة بين الأدمن والكابتن والزبون)
 * Supabase Single Source of Truth
 */
const express = require('express');
const { optionalToken } = require('./authMiddleware');
const menuRepo = require('../repository/menuRepository');
const categoryRepo = require('../repository/categoryRepository');

const router = express.Router();

function categoryName(c) {
  if (c == null) return '';
  if (typeof c === 'object' && !Array.isArray(c)) {
    return String(c.name != null ? c.name : '').trim();
  }
  return String(c).trim();
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
    await categoryRepo.saveCategories(list, cafeId);
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
    await categoryRepo.saveCategories(list, cafeId);
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
    await categoryRepo.saveCategories(list, cafeId);
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
      await categoryRepo.saveCategories(list, cafeId);
      if (io) emitMenuUpdated(io, { reason: 'category-image-updated', name }, cafeId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  r.get('/', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const list = await categoryRepo.getCategories(cafeId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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
      await categoryRepo.saveCategories(list, cafeId);
      if (io) emitMenuUpdated(io, { reason: 'category-added', name }, cafeId);
      res.status(201).json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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
