/**
 * تنسيق حالات الزبائن على الطاولة: choosing | ready | ordered
 * — مصدر واحد لقواعد «بعد الإرسال» و«بعد تعديل السلة».
 */
const tableCustomerSessions = require('./tableCustomerSessions');

const STATUS = tableCustomerSessions.STATUS;

function countCartLines(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(function (it) {
    return it && Math.max(0, Math.floor(Number(it.quantity) || 0)) > 0;
  }).length;
}

/**
 * هل تعديل السلة يستدعي إعادة التنسيق (انتظار → اختيار)؟
 * @param {object[]} mutations
 * @param {object[]} [itemsBefore]
 * @param {object[]} [itemsAfter]
 */
function cartMutationsAffectCoordination(mutations, itemsBefore, itemsAfter) {
  const beforeN = countCartLines(itemsBefore);
  const afterN = countCartLines(itemsAfter);

  /* سلة أصبحت فارغة (مثلاً حذف آخر منتج بعد «انتظر») */
  if (afterN === 0 && beforeN > 0) return true;

  if (!Array.isArray(mutations) || !mutations.length) return false;

  return mutations.some(function (op) {
    const k = String((op && op.op) || '')
      .trim()
      .toLowerCase();
    if (k === 'set' || k === 'remove' || k === 'clearall') return true;
    if (k === 'replaceall') {
      return afterN !== beforeN;
    }
    return false;
  });
}

/**
 * بعد إرسال المطبخ: «انتظار تجهيز طلب» في قائمة المتصلين.
 */
function afterKitchenSend(tableId, sessionId) {
  const tid = String(tableId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!tid || !sid) return false;
  const r = tableCustomerSessions.setUserStatus(tid, sid, STATUS.AWAITING_PREP, { internal: true });
  return !!(r && r.ok);
}

/**
 * عند تعديل سلة زبون: يُعاد فقط مُعدِل السلة إلى choosing إن كان جاهزاً.
 * لا يتأثر باقي المتصلين (مثلاً جاهز ينتظر ولا يتغيّر حالته عند إضافة رفيق لسلته).
 * @param {string} tableId
 * @param {string} editorSessionId
 * @param {object[]} mutations
 * @param {{ itemsBefore?: object[], itemsAfter?: object[] }} [ctx]
 * @returns {{ changed: boolean }}
 */
function applyCartEditCoordination(tableId, editorSessionId, mutations, ctx) {
  const tid = String(tableId || '').trim();
  const editor = String(editorSessionId || '').trim();
  if (!tid || !editor) return { changed: false };

  const itemsBefore = ctx && ctx.itemsBefore;
  const itemsAfter = ctx && ctx.itemsAfter;

  if (!cartMutationsAffectCoordination(mutations, itemsBefore, itemsAfter)) {
    return { changed: false };
  }

  const editorUser = tableCustomerSessions.findUser(tid, editor);
  if (!editorUser) return { changed: false };

  const est = String(editorUser.status || '').toLowerCase();
  if (est !== STATUS.READY && est !== STATUS.ORDERED) {
    return { changed: false };
  }

  const r = tableCustomerSessions.setUserStatus(tid, editor, STATUS.CHOOSING);
  return { changed: !!(r && r.ok) };
}

module.exports = {
  STATUS,
  countCartLines,
  cartMutationsAffectCoordination,
  afterKitchenSend,
  applyCartEditCoordination,
};
