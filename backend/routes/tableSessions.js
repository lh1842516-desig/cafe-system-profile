/**
 * API جلسات الطاولة (للكاشير والأدمن)
 */
const express = require('express');
const { optionalToken } = require('./authMiddleware');
const tableRepo = require('../repository/tableRepository');
const { resolveTableStatus } = require('../services/tableStatusResolve');

function createTableSessionsRouter(io) {
  const router = express.Router();
  router.use(optionalToken);

  // Cashier compatibility: lists tables requesting bill (now always empty since customer module is removed)
  router.get('/bill-requested-tables', (req, res) => {
    try {
      res.json({ tableIds: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Table status check endpoint
  router.get('/status', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const tables = await tableRepo.getTables(cafeId);
      const list = await Promise.all(tables.map(async function (t) {
        const id = String(t.id != null ? t.id : '');
        const label = String(t.label != null ? t.label : id);
        const r = await resolveTableStatus(cafeId, id, '', '');
        return {
          id,
          label,
          status: r.status,
          sessionId: null,
          isMine: false,
          statusLabel: null,
        };
      }));
      res.json({ tables: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTableSessionsRouter;


