/**
 * API القاصة — عرض وتحديث وإغلاق جلسة القاصة.
 */
const express = require('express');
const { authenticateToken } = require('./authMiddleware');
const tillRepo = require('../repository/tillRepository');
const closingRepo = require('../repository/closingRepository');
const kitchenRepo = require('../repository/kitchenRepository');

function createTillRouter(io) {
  const router = express.Router();
  router.use(authenticateToken);

  function computeNet(tillData, sales) {
    const opening = Number(tillData.openingBalance) || 0;
    const totalSales = (Number(sales.salesCash) || 0) + (Number(sales.salesCard) || 0);
    const expensesList = Array.isArray(tillData.expenses) ? tillData.expenses : [];
    const withdrawalsList = Array.isArray(tillData.withdrawals) ? tillData.withdrawals : [];
    const totalExpenses = expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalWithdrawals = withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
    return opening + totalSales - totalExpenses - totalWithdrawals;
  }

  router.get('/current', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      await tillRepo.ensureTillForToday(cafeId);
      const tillData = await tillRepo.readCurrentTill(cafeId);
      const sales = await tillRepo.getSalesToday(cafeId);
      const net = computeNet(tillData, sales);
      res.json({ till: tillData, sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total }, net });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/current', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      await tillRepo.ensureTillForToday(cafeId);
      const body = req.body || {};
      if (body.openingBalance !== undefined) {
        await tillRepo.setOpeningBalance(cafeId, Number(body.openingBalance) || 0);
      }
      if (body.expenseUpdate && typeof body.expenseUpdate === 'object') {
        const { id, name, amount, note } = body.expenseUpdate;
        if (!id) return res.status(400).json({ error: 'معرّف المصروف مطلوب' });
        try {
          await tillRepo.updateExpense(cafeId, String(id), String(name || ''), Number(amount) || 0, String(note || ''));
        } catch (err) {
          if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
          throw err;
        }
      } else if (body.expense && typeof body.expense === 'object') {
        const { name, amount, note } = body.expense;
        await tillRepo.addExpense(cafeId, String(name || ''), Number(amount) || 0, String(note || ''));
      }
      if (body.withdrawalUpdate && typeof body.withdrawalUpdate === 'object') {
        const { id, amount, note } = body.withdrawalUpdate;
        if (!id) return res.status(400).json({ error: 'معرّف السحب مطلوب' });
        try {
          await tillRepo.updateWithdrawal(cafeId, String(id), Number(amount) || 0, String(note || ''));
        } catch (err) {
          if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
          throw err;
        }
      } else if (body.withdrawal && typeof body.withdrawal === 'object') {
        const { amount, note } = body.withdrawal;
        await tillRepo.addWithdrawal(cafeId, Number(amount) || 0, String(note || ''));
      }
      if (body.note !== undefined) {
        await tillRepo.setNote(cafeId, String(body.note));
      }
      const tillData = await tillRepo.readCurrentTill(cafeId);
      const sales = await tillRepo.getSalesToday(cafeId);
      const net = computeNet(tillData, sales);
      if (io) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
      res.json({ till: tillData, sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total }, net });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/expense/:id', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      await tillRepo.ensureTillForToday(cafeId);
      await tillRepo.removeExpense(cafeId, req.params.id);
      const tillData = await tillRepo.readCurrentTill(cafeId);
      const sales = await tillRepo.getSalesToday(cafeId);
      const net = computeNet(tillData, sales);
      if (io) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
      res.json({ till: tillData, sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total }, net });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/withdrawal/:id', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      await tillRepo.ensureTillForToday(cafeId);
      await tillRepo.removeWithdrawal(cafeId, req.params.id);
      const tillData = await tillRepo.readCurrentTill(cafeId);
      const sales = await tillRepo.getSalesToday(cafeId);
      const net = computeNet(tillData, sales);
      if (io) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
      res.json({ till: tillData, sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total }, net });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/close', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const closedBy = String((req.body && req.body.closedBy) || '').trim();
      if (!closedBy) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم الذي يغلق القاصة.' });

      const sales = await tillRepo.getSalesToday(cafeId);
      await tillRepo.closeTill(cafeId, closedBy);
      const closedTill = await tillRepo.readCurrentTill(cafeId);
      await closingRepo.addTillClosing(cafeId, closedTill, sales.salesCash, sales.salesCard);
      await closingRepo.purgeOrdersForTillSession(cafeId, closedTill);
      await kitchenRepo.clearKitchenState(cafeId);

      const net = computeNet(closedTill, sales);
      if (io) {
        io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
        io.to('cafe-' + cafeId + '-staff').emit('orders-updated', { tillSessionClosed: true });
        io.to('cafe-' + cafeId + '-staff').emit('kitchen-updated', { reason: 'till-session-closed' });
      }
      res.json({
        closed: true,
        record: {
          date: closedTill.date,
          closedAt: closedTill.closedAt,
          closedBy: closedTill.closedBy,
          openedBy: closedTill.openedBy || null,
          openingBalance: closedTill.openingBalance,
          salesCash: sales.salesCash,
          salesCard: sales.salesCard,
          totalSales: sales.total,
          net,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/open', async (req, res) => {
    try {
      const cafeId = req.cafeId;
      const current = await tillRepo.readCurrentTill(cafeId);
      if (current && current.status === 'open' && !current.closedAt) {
        return res.status(400).json({ error: 'توجد قاصة مفتوحة حالياً. أغلق القاصة أولاً.' });
      }
      const today = tillRepo.getTodayDateStr(cafeId);
      if (await tillRepo.hasTillOpenedOnDate(cafeId, today)) {
        return res.status(400).json({ error: 'لا يمكن فتح قاصة جديدة لنفس اليوم. لقد تم فتح قاصة مسبقاً في هذا التاريخ.' });
      }
      const openedBy = String((req.body && req.body.openedBy) || '').trim();
      if (!openedBy) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم الذي يفتح القاصة.' });
      const openingBalance = req.body && req.body.openingBalance !== undefined ? Number(req.body.openingBalance) || 0 : 0;
      const newTill = await tillRepo.resetTillForNewDay(cafeId, openingBalance, openedBy);
      const sales = await tillRepo.getSalesToday(cafeId);
      const net = computeNet(newTill, sales);
      if (io) io.to('cafe-' + cafeId + '-staff').emit('stats-updated');
      res.json({ till: newTill, sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total }, net });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTillRouter;
