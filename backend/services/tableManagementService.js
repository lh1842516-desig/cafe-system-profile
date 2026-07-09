/**
 * إدارة الطاولات من لوحة الإعدادات — إضافة، حذف، QR.
 */
const {
  getTables,
  saveTables,
  getNextTableId,
  getOrdersBlockingTableClaim,
} = require('../data/store');
const tableCustomerSessions = require('./tableCustomerSessions');
const browseTableSessions = require('./tableSessions');
const tableQrService = require('./tableQrService');

function listTablesWithQrStatus() {
  return getTables().map(function (t) {
    const id = String(t.id || '').trim();
    return {
      id,
      label: String(t.label != null ? t.label : id).trim() || id,
      qrGenerated: tableQrService.qrExists(id),
      qrPath: tableQrService.qrPublicPath(id),
    };
  });
}

async function addTable(req) {
  const tables = getTables();
  const newId = getNextTableId();
  const entry = { id: newId, label: newId };
  const next = tables.concat([entry]);
  await saveTables(next);
  const qr = await tableQrService.generateTableQr(newId, req);
  return {
    table: entry,
    qr,
    tables: listTablesWithQrStatus(),
  };
}

async function deleteTable(tableId, req) {
  const tid = String(tableId || '').trim();
  if (!tid) {
    const err = new Error('invalid_table_id');
    err.status = 400;
    throw err;
  }
  const tables = getTables();
  const exists = tables.some(function (t) {
    return String(t.id) === tid;
  });
  if (!exists) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  const blocking = getOrdersBlockingTableClaim(tid);
  if (Array.isArray(blocking) && blocking.length > 0) {
    const err = new Error('table_has_open_orders');
    err.status = 409;
    throw err;
  }
  try {
    tableCustomerSessions.clearTableUsers(tid);
  } catch (_) {}
  try {
    browseTableSessions.removeSessionsForTable(tid);
  } catch (_) {}
  tableQrService.deleteTableQr(tid);
  const next = tables.filter(function (t) {
    return String(t.id) !== tid;
  });
  if (next.length === tables.length) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  await saveTables(next);
  return {
    deletedId: tid,
    tables: listTablesWithQrStatus(),
  };
}

async function regenerateTableQr(tableId, req) {
  const tid = String(tableId || '').trim();
  const tables = getTables();
  if (!tables.some(function (t) {
    return String(t.id) === tid;
  })) {
    const err = new Error('table_not_found');
    err.status = 404;
    throw err;
  }
  const qr = await tableQrService.generateTableQr(tid, req);
  return { tableId: tid, qr, tables: listTablesWithQrStatus() };
}

module.exports = {
  listTablesWithQrStatus,
  addTable,
  deleteTable,
  regenerateTableQr,
};
