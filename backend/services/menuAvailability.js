/**
 * توحيد حقل توفر المنتج في المنيو (isAvailable / is_available).
 * القيمة الافتراضية: متوفر (true) عند غياب الحقل.
 */

function readIsAvailable(item) {
  if (!item || typeof item !== 'object') return true;
  if (item.isAvailable === false || item.is_available === false) return false;
  return true;
}

function coerceIsAvailable(value) {
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  return undefined;
}

function withMenuAvailability(item) {
  if (!item || typeof item !== 'object') return item;
  return Object.assign({}, item, { isAvailable: readIsAvailable(item) });
}

function normalizeMenuList(menu) {
  return (Array.isArray(menu) ? menu : []).map(withMenuAvailability);
}

function assertMenuItemAvailable(menuItem, menuId) {
  if (!menuItem) {
    throw new Error('عنصر منيو غير موجود: ' + String(menuId || ''));
  }
  if (!readIsAvailable(menuItem)) {
    throw new Error('المنتج "' + String(menuItem.name || '') + '" غير متوفر حالياً في المطبخ');
  }
}

module.exports = {
  readIsAvailable,
  coerceIsAvailable,
  withMenuAvailability,
  normalizeMenuList,
  assertMenuItemAvailable,
};
