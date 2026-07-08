/**
 * API القاصة — عرض وتحديث وإغلاق جلسة القاصة.
 * الجلسة تعتمد على openedAt / closedAt، ويمكن أن تمتد عبر أكثر من يوم.
 * يُمرَّر io لإطلاق stats-updated حتى تُحدَّث لوحة الأدمن تلقائياً (مثل المبيعات والطلبات).
 */
const express = require('express');
const till = require('../data/till');
const { addTillClosing, purgeOrdersForTillSession } = require('../data/store');
const { resetKitchenState } = require('../data/kitchen');

function createTillRouter(io) {
  const router = express.Router();

/** حساب صافي القاصة من القاصة + المبيعات */
function computeNet(tillData, sales) {
  const opening = Number(tillData.openingBalance) || 0;
  const totalSales = (Number(sales.salesCash) || 0) + (Number(sales.salesCard) || 0);
  const expensesList = Array.isArray(tillData.expenses) ? tillData.expenses : [];
  const withdrawalsList = Array.isArray(tillData.withdrawals) ? tillData.withdrawals : [];
  const totalExpenses = expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWithdrawals = withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return opening + totalSales - totalExpenses - totalWithdrawals;
}

/** GET /api/till/current — قاصة اليوم الحالية + المبيعات + الصافي */
router.get('/current', (req, res) => {
  try {
    till.ensureTillForToday();
    const tillData = till.readCurrentTill();
    const sales = till.getSalesToday();
    const net = computeNet(tillData, sales);
    res.json({
      till: tillData,
      sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/till/current — تحديث رصيد بداية / إضافة مصروف / إضافة سحب / ملاحظة */
router.patch('/current', (req, res) => {
  try {
    till.ensureTillForToday();
    const body = req.body || {};
    if (body.openingBalance !== undefined) {
      till.setOpeningBalance(Number(body.openingBalance) || 0);
    }
    if (body.expenseUpdate && typeof body.expenseUpdate === 'object') {
      const { id, name, amount, note } = body.expenseUpdate;
      if (!id) return res.status(400).json({ error: 'معرّف المصروف مطلوب' });
      try {
        till.updateExpense(String(id), String(name || ''), Number(amount) || 0, String(note || ''));
      } catch (err) {
        if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
        throw err;
      }
    } else if (body.expense && typeof body.expense === 'object') {
      const { name, amount, note } = body.expense;
      till.addExpense(String(name || ''), Number(amount) || 0, String(note || ''));
    }
    if (body.withdrawalUpdate && typeof body.withdrawalUpdate === 'object') {
      const { id, amount, note } = body.withdrawalUpdate;
      if (!id) return res.status(400).json({ error: 'معرّف السحب مطلوب' });
      try {
        till.updateWithdrawal(String(id), Number(amount) || 0, String(note || ''));
      } catch (err) {
        if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
        throw err;
      }
    } else if (body.withdrawal && typeof body.withdrawal === 'object') {
      const { amount, note } = body.withdrawal;
      till.addWithdrawal(Number(amount) || 0, String(note || ''));
    }
    if (body.note !== undefined) {
      till.setNote(String(body.note));
    }
    const tillData = till.readCurrentTill();
    const sales = till.getSalesToday();
    const net = computeNet(tillData, sales);
    if (io) io.emit('stats-updated');
    res.json({
      till: tillData,
      sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/till/expense/:id — حذف مصروف */
router.delete('/expense/:id', (req, res) => {
  try {
    till.ensureTillForToday();
    till.removeExpense(req.params.id);
    const tillData = till.readCurrentTill();
    const sales = till.getSalesToday();
    const net = computeNet(tillData, sales);
    if (io) io.emit('stats-updated');
    res.json({
      till: tillData,
      sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/till/withdrawal/:id — حذف سحب */
router.delete('/withdrawal/:id', (req, res) => {
  try {
    till.ensureTillForToday();
    till.removeWithdrawal(req.params.id);
    const tillData = till.readCurrentTill();
    const sales = till.getSalesToday();
    const net = computeNet(tillData, sales);
    if (io) io.emit('stats-updated');
    res.json({
      till: tillData,
      sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/till/close — إغلاق القاصة (أرشفة، تصفير طلبات ذلك اليوم، ثم إشعار التحديث) */
router.post('/close', (req, res) => {
  try {
    const closedBy = String((req.body && req.body.closedBy) || '').trim();
    if (!closedBy) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم الذي يغلق القاصة.' });
    }
    const sales = till.getSalesToday();
    till.closeTill(closedBy);
    const closedTill = till.readCurrentTill();
    addTillClosing(closedTill, sales.salesCash, sales.salesCard);
    purgeOrdersForTillSession(closedTill);
    resetKitchenState();
    const net = computeNet(closedTill, sales);
    if (io) {
      io.emit('stats-updated');
      io.emit('orders-updated', { tillSessionClosed: true });
      io.emit('kitchen-updated', { reason: 'till-session-closed' });
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

/** POST /api/till/open — بدء جلسة قاصة جديدة (مرة واحدة فقط لكل يوم تقويمي حسب تاريخ الفتح). يقبل openingBalance في الجسم. */
router.post('/open', (req, res) => {
  try {
    const current = till.readCurrentTill();
    if (current && current.status === 'open' && !current.closedAt) {
      return res.status(400).json({ error: 'توجد قاصة مفتوحة حالياً. أغلق القاصة أولاً.' });
    }
    const today = till.getTodayDateStr();
    if (till.hasTillOpenedOnDate(today)) {
      return res.status(400).json({
        error: 'لا يمكن فتح قاصة جديدة لنفس اليوم. لقد تم فتح قاصة مسبقاً في هذا التاريخ.',
      });
    }
    const openedBy = String((req.body && req.body.openedBy) || '').trim();
    if (!openedBy) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم الذي يفتح القاصة.' });
    }
    const openingBalance = req.body && req.body.openingBalance !== undefined ? Number(req.body.openingBalance) || 0 : 0;
    const newTill = till.resetTillForNewDay(openingBalance, openedBy);
    const sales = till.getSalesToday();
    const net = computeNet(newTill, sales);
    if (io) io.emit('stats-updated');
    res.json({
      till: newTill,
      sales: { salesCash: sales.salesCash, salesCard: sales.salesCard, total: sales.total },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  return router;
}

module.exports = createTillRouter;
