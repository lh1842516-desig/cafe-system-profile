/**
 * تحويل صفوف السلة/الطلب إلى عناصر مطبخ — مصدر واحد للإنشاء والإرسال الجماعي.
 */
const { getMenuItem } = require('../data/store');

function sanitizeSelectedOptions(menuItem, row) {
  const raw = row && row.selectedOptions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const groups = menuItem && Array.isArray(menuItem.options) ? menuItem.options : [];
  if (!groups.length) return {};
  const out = {};
  groups.forEach((g) => {
    const title = g && g.title != null ? String(g.title).trim() : '';
    if (!title) return;
    if (!Object.prototype.hasOwnProperty.call(raw, title)) return;
    const allowed = (g.values || []).map((v) => String(v == null ? '' : v).trim());
    const isMulti = g.type === 'multi';
    if (isMulti) {
      let arr = Array.isArray(raw[title])
        ? raw[title]
        : String(raw[title] || '')
            .split(/[,،]+/g)
            .map((s) => String(s || '').trim())
            .filter(Boolean);
      arr = arr.filter((x) => allowed.includes(String(x).trim()));
      if (arr.length) out[title] = arr;
    } else {
      const want = String(raw[title] != null ? raw[title] : '').trim();
      if (want && allowed.includes(want)) out[title] = want;
    }
  });
  return out;
}

function buildOrderItemsFromRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }
  return rows.map((row) => {
    const menuItem = getMenuItem(row.menuId);
    if (!menuItem) throw new Error('عنصر منيو غير موجود: ' + row.menuId);
    return {
      menuId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: Number(row.quantity) || 1,
      note: row.note ? String(row.note).trim() : '',
      selectedOptions: sanitizeSelectedOptions(menuItem, row),
    };
  });
}

module.exports = {
  buildOrderItemsFromRows,
  sanitizeSelectedOptions,
};
