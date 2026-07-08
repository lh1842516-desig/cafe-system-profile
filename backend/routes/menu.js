/**
 * Menu API routes (CRUD) + توفر المنتجات + بث لحظي
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getMenu, getMenuItem, saveMenu } = require('../data/store');
const {
  coerceIsAvailable,
  withMenuAvailability,
  normalizeMenuList,
} = require('../services/menuAvailability');
const { emitMenuUpdated } = require('../services/menuRealtime');

/** @returns {{ title: string, type: 'single'|'multi', values: string[] }[]} */
function normalizeMenuOptions(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => {
      const title = g && g.title != null ? String(g.title).trim() : '';
      const vals = g && Array.isArray(g.values) ? g.values : [];
      const values = vals
        .map((v) => String(v == null ? '' : v).trim())
        .filter(Boolean);
      const type = g && g.type === 'multi' ? 'multi' : 'single';
      return { title, type, values };
    })
    .filter((g) => g.title && g.values.length > 0);
}

function readAvailabilityFromBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  if (body.isAvailable !== undefined) return coerceIsAvailable(body.isAvailable);
  if (body.is_available !== undefined) return coerceIsAvailable(body.is_available);
  return undefined;
}

function broadcastMenuChange(io, reason, item) {
  emitMenuUpdated(io, {
    reason: reason || 'updated',
    id: item && item.id ? item.id : null,
    isAvailable: item ? item.isAvailable : undefined,
    item: item ? withMenuAvailability(item) : null,
  });
}

function createMenuRouter(io) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      res.json(normalizeMenuList(getMenu()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    const item = getMenuItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(withMenuAvailability(item));
  });

  router.post('/', (req, res) => {
    try {
      const menu = getMenu();
      const { name, price, category, imageUrl, ingredients, options } = req.body || {};
      if (!name || price == null) {
        return res.status(400).json({ error: 'Name and price required' });
      }
      const availability = readAvailabilityFromBody(req.body);
      const newItem = withMenuAvailability({
        id: uuidv4(),
        name: String(name).trim(),
        price: Number(price),
        category: category ? String(category).trim() : '',
        imageUrl: imageUrl || '',
        ingredients: ingredients || '',
        options: normalizeMenuOptions(options),
        createdAt: new Date().toISOString(),
        isAvailable: availability !== undefined ? availability : true,
      });
      menu.push(newItem);
      saveMenu(menu);
      broadcastMenuChange(io, 'created', newItem);
      res.status(201).json(newItem);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/availability', (req, res) => {
    try {
      const menu = getMenu();
      const idx = menu.findIndex((i) => i.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const availability = readAvailabilityFromBody(req.body);
      if (availability === undefined) {
        return res.status(400).json({ error: 'isAvailable مطلوب (true أو false)' });
      }

      menu[idx].isAvailable = availability;
      delete menu[idx].is_available;
      saveMenu(menu);

      const item = withMenuAvailability(menu[idx]);
      broadcastMenuChange(io, 'availability', item);
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const menu = getMenu();
      const idx = menu.findIndex((i) => i.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const { name, price, category, imageUrl, ingredients, options } = req.body || {};
      if (name !== undefined) menu[idx].name = String(name).trim();
      if (price !== undefined) menu[idx].price = Number(price);
      if (category !== undefined) menu[idx].category = String(category).trim();
      if (imageUrl !== undefined) menu[idx].imageUrl = imageUrl;
      if (ingredients !== undefined) menu[idx].ingredients = ingredients;
      if (options !== undefined) menu[idx].options = normalizeMenuOptions(options);

      const availability = readAvailabilityFromBody(req.body);
      if (availability !== undefined) {
        menu[idx].isAvailable = availability;
        delete menu[idx].is_available;
      }

      saveMenu(menu);
      const item = withMenuAvailability(menu[idx]);
      broadcastMenuChange(io, 'updated', item);
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const menu = getMenu();
      const removed = menu.find((i) => i.id === req.params.id);
      const filtered = menu.filter((i) => i.id !== req.params.id);
      if (filtered.length === menu.length) {
        return res.status(404).json({ error: 'Not found' });
      }
      saveMenu(filtered);
      if (removed) {
        emitMenuUpdated(io, { reason: 'deleted', id: removed.id, item: null });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createMenuRouter;
