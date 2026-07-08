/**
 * دمج تذاكر المطبخ لنفس دفعة الإرسال (kitchenBatchId) — مصدر واحد للـ API والواجهة.
 */

function kitchenStatusRank(st) {
  const s = String(st || 'new').toLowerCase();
  if (s === 'editing') return 4;
  if (s === 'preparing') return 3;
  if (s === 'new') return 2;
  return 1;
}

/**
 * @param {object[]} tickets
 * @returns {object[]}
 */
function mergeKitchenBatchTickets(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return [];
  const byBatch = Object.create(null);
  const singles = [];

  tickets.forEach((t) => {
    const bid = t.kitchenBatchId != null ? String(t.kitchenBatchId).trim() : '';
    if (!bid) {
      singles.push(t);
      return;
    }
    if (!byBatch[bid]) byBatch[bid] = [];
    byBatch[bid].push(t);
  });

  const merged = [];
  Object.keys(byBatch).forEach((bid) => {
    const group = byBatch[bid];
    if (group.length < 2) {
      singles.push(group[0]);
      return;
    }
    const primary = group[0];
    const orderIds = [];
    const names = [];
    const items = [];
    let bestStatus = 'new';
    let bestRank = 0;
    let earliestStart = primary.kitchenCreatedAt || primary.createdAt || '';

    group.forEach((t) => {
      orderIds.push(t.id);
      if (t.customerName && names.indexOf(t.customerName) === -1) names.push(t.customerName);
      const r = kitchenStatusRank(t.status);
      if (r > bestRank) {
        bestRank = r;
        bestStatus = t.status || 'new';
      }
      const st = Date.parse(t.kitchenCreatedAt || t.createdAt || '') || 0;
      const cur = Date.parse(earliestStart) || 0;
      if (st && (cur === 0 || st < cur)) earliestStart = t.kitchenCreatedAt || t.createdAt;
      (t.items || []).forEach((it) => {
        items.push(
          Object.assign({}, it, {
            orderedByName:
              it.orderedByName != null && String(it.orderedByName).trim()
                ? String(it.orderedByName).trim()
                : t.customerName || '',
          })
        );
      });
    });

    merged.push({
      id: primary.id,
      orderIds,
      isKitchenBatch: true,
      kitchenBatchId: bid,
      tableId: primary.tableId,
      tableLabel: primary.tableLabel,
      orderType: primary.orderType,
      orderTypeLabel: primary.orderTypeLabel,
      serviceMeta: undefined,
      customerName:
        primary.orderType === 'TAKEAWAY' || primary.orderType === 'DELIVERY'
          ? undefined
          : Array.isArray(primary.bundledCustomerNames) && primary.bundledCustomerNames.length > 1
            ? String(primary.bundledCustomerNames[0] || '').trim() || primary.customerName
            : names.length
              ? names.join(' · ')
              : primary.customerName,
      bundledCustomerNames: primary.bundledCustomerNames,
      items,
      total: items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0),
      status: bestStatus,
      createdAt: earliestStart || primary.createdAt,
      kitchenCreatedAt: earliestStart || primary.kitchenCreatedAt,
      updatedAt: primary.updatedAt,
    });
  });

  return singles.concat(merged);
}

module.exports = { mergeKitchenBatchTickets };
