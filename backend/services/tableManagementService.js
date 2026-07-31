/**
 * إدارة الطاولات من لوحة الإعدادات — إضافة، حذف، QR عند الطلب.
 */
const tableRepo = require('../repository/tableRepository');
const orderRepo = require('../repository/orderRepository');
const browseTableSessions = require('./tableSessions');

async function listTablesWithQrStatus(cafeId) {
  const tables = await tableRepo.getTables(cafeId);
  return tables.map(function (t) {
    const id = String(t.id || '').trim();
    return {
      id,
      label: String(t.label != null ? t.label : id).trim() || id,
      qrGenerated: true,
    };
  });
}

async function addTable(cafeId, req) {
  const tables = await tableRepo.getTables(cafeId);
  const newId = await tableRepo.getNextTableId(cafeId);
  const entry = { id: newId, label: newId };
  const next = tables.concat([entry]);
  await tableRepo.saveTables(cafeId, next);
  return {
    table: entry,
    tables: await listTablesWithQrStatus(cafeId),
  };
}

async function deleteTable(cafeId, tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) {
    const err = new Error('invalid_table_id');
    err.status = 400;
    throw err;
  }
  const tables = await tableRepo.getTables(cafeId);
  const exists = tables.some(function (t) {
    return String(t.id) === tid;
  });
  if (!exists) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  const blocking = await orderRepo.getOrdersBlockingTableClaim(cafeId, tid);
  if (Array.isArray(blocking) && blocking.length > 0) {
    const err = new Error('table_has_open_orders');
    err.status = 409;
    throw err;
  }

  try {
    browseTableSessions.removeSessionsForTable(tid);
  } catch (_) {}
  const next = tables.filter(function (t) {
    return String(t.id) !== tid;
  });
  if (next.length === tables.length) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  await tableRepo.saveTables(cafeId, next);
  return {
    deletedId: tid,
    tables: await listTablesWithQrStatus(cafeId),
  };
}

async function regenerateTableQr(cafeId, tableId, req) {
  const tid = String(tableId || '').trim();
  const tables = await tableRepo.getTables(cafeId);
  if (!tables.some(function (t) {
    return String(t.id) === tid;
  })) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  return { tableId: tid, tables: await listTablesWithQrStatus(cafeId) };
}

module.exports = {
  listTablesWithQrStatus,
  addTable,
  deleteTable,
  regenerateTableQr,
};
