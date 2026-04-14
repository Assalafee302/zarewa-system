/**
 * Period statements for procurement counterparty views (supplier PO value vs paid; transporter haulage).
 * Dates use ISO calendar day strings (YYYY-MM-DD); PO `orderDateISO` is compared by day prefix.
 */

/** @param {string|undefined} orderIso */
export function poDateInRange(orderIso, startIso, endIso) {
  const d = String(orderIso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const s = String(startIso || '').trim().slice(0, 10);
  const e = String(endIso || '').trim().slice(0, 10);
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

export function defaultStatementRangeIso() {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { startIso: start, endIso: end };
}

/**
 * @param {object} opts
 */
export function buildSupplierStatementPrintPayload({
  purchaseOrders,
  supplierId,
  startIso,
  endIso,
  formatNgn,
  purchaseOrderOrderedValueNgn,
}) {
  const sid = String(supplierId || '').trim();
  const rows = [];
  let totalOrder = 0;
  let totalPaid = 0;
  for (const po of purchaseOrders || []) {
    if (String(po.supplierID || '').trim() !== sid) continue;
    if (!poDateInRange(po.orderDateISO, startIso, endIso)) continue;
    const ov = purchaseOrderOrderedValueNgn(po);
    const paid = Number(po.supplierPaidNgn) || 0;
    totalOrder += ov;
    totalPaid += paid;
    rows.push({
      date: po.orderDateISO || '—',
      po: po.poID,
      status: po.status || '—',
      orderValue: formatNgn(ov),
      paid: formatNgn(paid),
      balance: formatNgn(Math.max(0, ov - paid)),
    });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    title: 'Supplier statement',
    periodLabel: `${startIso} → ${endIso}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'po', label: 'PO' },
      { key: 'status', label: 'Status' },
      { key: 'orderValue', label: 'Order value', align: 'right' },
      { key: 'paid', label: 'Paid (supplier)', align: 'right' },
      { key: 'balance', label: 'Open balance', align: 'right' },
    ],
    rows,
    summaryLines: [
      { label: 'POs in period', value: String(rows.length) },
      { label: 'Total order value', value: formatNgn(totalOrder) },
      { label: 'Total paid (recorded)', value: formatNgn(totalPaid) },
    ],
  };
}

/**
 * @param {object} opts
 */
export function buildTransportStatementPrintPayload({
  purchaseOrders,
  agentId,
  startIso,
  endIso,
  formatNgn,
}) {
  const aid = String(agentId || '').trim();
  const rows = [];
  let totalFee = 0;
  let totalPaid = 0;
  for (const po of purchaseOrders || []) {
    if (String(po.transportAgentId || '').trim() !== aid) continue;
    if (!poDateInRange(po.orderDateISO, startIso, endIso)) continue;
    const fee = Number(po.transportAmountNgn) || 0;
    const adv = Number(po.transportAdvanceNgn) || 0;
    const tpaid = Number(po.transportPaidNgn) || 0;
    totalFee += fee;
    totalPaid += tpaid;
    rows.push({
      date: po.orderDateISO || '—',
      po: po.poID,
      supplier: po.supplierName || '—',
      haulage: formatNgn(fee),
      advance: formatNgn(adv),
      transportPaid: formatNgn(tpaid),
      ref: po.transportReference ? String(po.transportReference) : '—',
      status: po.status || '—',
    });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    title: 'Transport / haulage statement',
    periodLabel: `${startIso} → ${endIso}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'po', label: 'PO' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'haulage', label: 'Haulage fee', align: 'right' },
      { key: 'advance', label: 'Advance', align: 'right' },
      { key: 'transportPaid', label: 'Paid (transport)', align: 'right' },
      { key: 'ref', label: 'Ref' },
      { key: 'status', label: 'Status' },
    ],
    rows,
    summaryLines: [
      { label: 'POs in period', value: String(rows.length) },
      { label: 'Total haulage fees', value: formatNgn(totalFee) },
      { label: 'Total transport paid (file)', value: formatNgn(totalPaid) },
    ],
  };
}
