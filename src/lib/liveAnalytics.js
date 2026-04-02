import { amountDueOnQuotationFromEntries, sumForQuotationInEntries } from './customerLedgerCore';
import { refundOutstandingAmount } from './refundsStore';

function toIsoDate(value) {
  return String(value || '').slice(0, 10);
}

function monthKey(iso) {
  const d = toIsoDate(iso);
  return d ? d.slice(0, 7) : '';
}

function monthLabel(key) {
  const [y, m] = String(key).split('-');
  const idx = Number(m) - 1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return y && idx >= 0 && idx < 12 ? `${names[idx]} ${y}` : key;
}

function parseMeters(totalLabel) {
  const m = String(totalLabel ?? '').match(/([\d,.]+)\s*m/i);
  return m ? Number(String(m[1]).replace(/,/g, '')) || 0 : 0;
}

function cuttingMeters(row) {
  return Number(row?.totalMeters) || parseMeters(row?.total);
}

function weekStart(iso) {
  const d = new Date(`${toIsoDate(iso)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function lastMonthKeys(count = 6, baseDate = new Date()) {
  const keys = [];
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(x.toISOString().slice(0, 7));
  }
  return keys;
}

function lastWeekKeys(count = 8, baseDate = new Date()) {
  const keys = [];
  const base = weekStart(baseDate.toISOString().slice(0, 10));
  const d = new Date(`${base}T00:00:00`);
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d);
    x.setDate(x.getDate() - i * 7);
    keys.push(x.toISOString().slice(0, 10));
  }
  return keys;
}

export function liveSalesSeriesByMonth(quotations = [], count = 6) {
  const keys = lastMonthKeys(count);
  const sums = new Map(keys.map((k) => [k, 0]));
  quotations.forEach((q) => {
    const key = monthKey(q.dateISO);
    if (sums.has(key)) sums.set(key, (sums.get(key) || 0) + (Number(q.totalNgn) || 0));
  });
  return keys.map((key) => ({ key, period: monthLabel(key), amountNgn: sums.get(key) || 0 }));
}

export function liveSalesSeriesByWeek(quotations = [], count = 8) {
  const keys = lastWeekKeys(count);
  const sums = new Map(keys.map((k) => [k, 0]));
  quotations.forEach((q) => {
    const key = weekStart(q.dateISO);
    if (sums.has(key)) sums.set(key, (sums.get(key) || 0) + (Number(q.totalNgn) || 0));
  });
  return keys.map((key) => ({ key, period: key.slice(5), amountNgn: sums.get(key) || 0 }));
}

export function liveMetersSeries(cuttingLists = [], count = 6) {
  const keys = lastMonthKeys(count);
  const sums = new Map(keys.map((k) => [k, 0]));
  cuttingLists.forEach((row) => {
    const key = monthKey(row.dateISO);
    if (sums.has(key)) sums.set(key, (sums.get(key) || 0) + cuttingMeters(row));
  });
  return keys.map((key) => ({ key, label: monthLabel(key), meters: sums.get(key) || 0 }));
}

export function liveLiquidityBreakdown(accounts = []) {
  return accounts.map((a) => ({
    label: `${a.type} — ${a.name}`,
    amountNgn: Number(a.balance) || 0,
  }));
}

export function totalLiquidityNgn(accounts = []) {
  return accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
}

export function liveStockMix(products = []) {
  const byType = new Map();
  products.forEach((p) => {
    const key = p.dashboardAttrs?.materialType || p.name || 'Other';
    byType.set(key, (byType.get(key) || 0) + (Number(p.stockLevel) || 0));
  });
  return [...byType.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function liveCashflowMonthly(receipts = [], expenses = [], count = 6, treasuryMovements = []) {
  const keys = lastMonthKeys(count);
  const income = new Map(keys.map((k) => [k, 0]));
  const expense = new Map(keys.map((k) => [k, 0]));
  if (Array.isArray(treasuryMovements) && treasuryMovements.length > 0) {
    treasuryMovements.forEach((m) => {
      if (['INTERNAL_TRANSFER_IN', 'INTERNAL_TRANSFER_OUT'].includes(m.type)) return;
      const key = monthKey(m.postedAtISO);
      if (!income.has(key)) return;
      const amount = Number(m.amountNgn) || 0;
      if (amount > 0) income.set(key, (income.get(key) || 0) + amount);
      else expense.set(key, (expense.get(key) || 0) + Math.abs(amount));
    });
    return keys.map((key) => ({
      month: key.slice(5),
      income: Math.round(((income.get(key) || 0) / 1e6) * 10) / 10,
      expense: Math.round(((expense.get(key) || 0) / 1e6) * 10) / 10,
    }));
  }
  receipts.forEach((r) => {
    const key = monthKey(r.dateISO);
    if (income.has(key)) income.set(key, (income.get(key) || 0) + (Number(r.amountNgn) || 0));
  });
  expenses.forEach((e) => {
    const key = monthKey(e.date);
    if (expense.has(key)) expense.set(key, (expense.get(key) || 0) + (Number(e.amountNgn) || 0));
  });
  return keys.map((key) => ({
    month: key.slice(5),
    income: Math.round((income.get(key) || 0) / 1e6 * 10) / 10,
    expense: Math.round((expense.get(key) || 0) / 1e6 * 10) / 10,
  }));
}

/** Align with sales-side rough yield (kg ↔ m) — planning estimate, not dispatch truth. */
function roughKgFromMeters(meters, gaugeMmNum) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return 0;
  const g = Number(gaugeMmNum) > 0 ? Number(gaugeMmNum) : 0.26;
  const kgPerM = g <= 0.22 ? 2.35 : g <= 0.26 ? 2.65 : g <= 0.3 ? 2.9 : g <= 0.45 ? 3.4 : 3.8;
  return Math.round(m * kgPerM);
}

function materialSpecFromQuotation(q) {
  if (!q) return { colour: '—', gauge: '—', profile: '—' };
  const colour = String(q.materialColor ?? q.material_color ?? q.color ?? '').trim();
  const gauge = String(q.materialGauge ?? q.material_gauge ?? q.gauge ?? '').trim();
  const profile = String(q.materialDesign ?? q.material_design ?? q.profile ?? '').trim();
  return {
    colour: colour || '—',
    gauge: gauge || '—',
    profile: profile || '—',
  };
}

function monthToDateRangeISO(base = new Date()) {
  const end = base instanceof Date && !Number.isNaN(base.getTime()) ? base : new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { startIso: start.toISOString().slice(0, 10), endIso: end.toISOString().slice(0, 10) };
}

/**
 * Top material combinations (colour × gauge × profile) by sales in a date range.
 * Meters from cutting lists; revenue = sum of quotation totalNgn for distinct quotes
 * linked to those lists (each quote counted once per bucket).
 */
export function liveTopSalesPerformersByMaterial(cuttingLists = [], quotations = [], opts = {}) {
  const { limit = 5 } = opts;
  const { startIso, endIso } = opts.startIso && opts.endIso ? opts : monthToDateRangeISO();

  const quoteById = new Map();
  (quotations || []).forEach((q) => {
    if (q?.id) quoteById.set(q.id, q);
  });

  const buckets = new Map();
  for (const cl of cuttingLists || []) {
    const d = toIsoDate(cl.dateISO);
    if (!d || d < startIso || d > endIso) continue;
    const m = cuttingMeters(cl);
    if (m <= 0) continue;
    const q = quoteById.get(cl.quotationRef);
    const spec = materialSpecFromQuotation(q);
    const key = `${spec.colour}\0${spec.gauge}\0${spec.profile}`;
    let row = buckets.get(key);
    if (!row) {
      const gaugeMm = Number(String(spec.gauge || '').match(/(\d+(?:\.\d+)?)/)?.[1]) || 0;
      row = {
        colour: spec.colour,
        gaugeRaw: spec.gauge,
        gaugeMm,
        materialType: spec.profile,
        metersSold: 0,
        quoteIds: new Set(),
      };
      buckets.set(key, row);
    }
    row.metersSold += m;
    if (q?.id) row.quoteIds.add(q.id);
  }

  const rows = [...buckets.values()].map((row) => {
    let revenueNgn = 0;
    for (const id of row.quoteIds) {
      const q = quoteById.get(id);
      revenueNgn += Number(q?.totalNgn) || 0;
    }
    const weightKg = roughKgFromMeters(row.metersSold, row.gaugeMm);
    return {
      colour: row.colour,
      gaugeRaw: row.gaugeRaw,
      gaugeMm: row.gaugeMm,
      materialType: row.materialType,
      metersSold: row.metersSold,
      weightKg,
      revenueNgn,
    };
  });

  rows.sort((a, b) => (b.revenueNgn - a.revenueNgn) || (b.metersSold - a.metersSold));
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

export function liveProductionPulse(cuttingLists = [], movements = [], wipByProduct = {}, coilRequests = []) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

  const metersSold7d = cuttingLists
    .filter((row) => toIsoDate(row.dateISO) >= cutoff)
    .reduce((s, row) => s + cuttingMeters(row), 0);

  const millOutput7d = movements
    .filter((m) => m.type === 'FINISHED_GOODS' && toIsoDate(m.dateISO || m.atISO) >= cutoff)
    .reduce((s, m) => s + (Number(m.qty) || 0), 0);

  const activeWip = Object.values(wipByProduct || {}).filter((qty) => Number(qty) > 0).length;
  const pendingCoil = (coilRequests || []).filter((r) => String(r.status).toLowerCase() === 'pending').length;
  const activeJobs = activeWip + pendingCoil;

  return { metersSold7d, millOutput7d, activeJobs };
}

export function liveReceivablesNgn(quotations = [], ledgerEntries = []) {
  return quotations.reduce(
    (s, q) => s + amountDueOnQuotationFromEntries(ledgerEntries, q),
    0
  );
}

export function filterQuotationsInRange(quotations = [], startDate, endDate) {
  return quotations.filter((q) => {
    const iso = toIsoDate(q.dateISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

/** Expenses in period by `date` on the expense row (accrual-style expense recognition date in app). */
export function filterExpensesInRange(expenses = [], startDate, endDate) {
  return expenses.filter((ex) => {
    const iso = toIsoDate(ex.date);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

/** Refunds with request date in range (`requestedAtISO`). */
export function filterRefundsInRange(refunds = [], startDate, endDate) {
  return refunds.filter((r) => {
    const iso = toIsoDate(r.requestedAtISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

/**
 * Revenue attributed to production in the period (not cash): for each cutting list dated in range,
 * allocate quotation total by meter share across all cutting lists for that quotation (all time).
 * Missing quotations are skipped. This is an operational proxy for “sales value of work released” in the month.
 */
export function productionAttributedRevenueNgn(quotations = [], cuttingLists = [], startDate, endDate) {
  const qById = new Map(quotations.map((q) => [String(q.id || '').trim(), q]));
  const metersAllClsByQuote = new Map();
  for (const cl of cuttingLists) {
    const ref = String(cl.quotationRef || '').trim();
    if (!ref) continue;
    metersAllClsByQuote.set(ref, (metersAllClsByQuote.get(ref) || 0) + (Number(cl.totalMeters) || 0));
  }
  let sum = 0;
  for (const cl of cuttingLists) {
    const iso = toIsoDate(cl.dateISO);
    if (startDate && iso < startDate) continue;
    if (endDate && iso > endDate) continue;
    const ref = String(cl.quotationRef || '').trim();
    if (!ref) continue;
    const q = qById.get(ref);
    if (!q) continue;
    const quoteTotal = Number(q.totalNgn) || 0;
    if (quoteTotal <= 0) continue;
    const clM = Number(cl.totalMeters) || 0;
    const denom = metersAllClsByQuote.get(ref) || clM || 1;
    sum += quoteTotal * (clM / denom);
  }
  return Math.round(sum);
}

export function topCustomersBySales(quotations = [], startDate, endDate, limit = 5) {
  const inRange = filterQuotationsInRange(quotations, startDate, endDate);
  const byCustomer = new Map();
  inRange.forEach((q) => {
    const key = q.customerID || q.customer;
    const row = byCustomer.get(key) || { customer: q.customer, amountNgn: 0, quotations: 0 };
    row.amountNgn += Number(q.totalNgn) || 0;
    row.quotations += 1;
    byCustomer.set(key, row);
  });
  return [...byCustomer.values()].sort((a, b) => b.amountNgn - a.amountNgn).slice(0, limit);
}

export function receivablesAgingBuckets(quotations = [], ledgerEntries = [], asOfISO = new Date().toISOString().slice(0, 10)) {
  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  quotations.forEach((q) => {
    const due = amountDueOnQuotationFromEntries(ledgerEntries, q);
    if (due <= 0) return;
    const basis = toIsoDate(q.dueDateISO || q.dateISO);
    const basisDate = basis ? new Date(`${basis}T00:00:00`) : null;
    const asOfDate = new Date(`${toIsoDate(asOfISO)}T00:00:00`);
    if (!basisDate || Number.isNaN(basisDate.getTime()) || Number.isNaN(asOfDate.getTime())) {
      buckets.current += due;
      return;
    }
    const diffDays = Math.floor((asOfDate.getTime() - basisDate.getTime()) / 86400000);
    if (diffDays <= 0) buckets.current += due;
    else if (diffDays <= 30) buckets.days1to30 += due;
    else if (diffDays <= 60) buckets.days31to60 += due;
    else if (diffDays <= 90) buckets.days61to90 += due;
    else buckets.days90plus += due;
  });
  return buckets;
}

export function supplierPerformanceSummary(purchaseOrders = [], limit = 5) {
  const bySupplier = new Map();
  purchaseOrders.forEach((po) => {
    const key = po.supplierID || po.supplierName || 'Unknown';
    const row = bySupplier.get(key) || {
      supplierName: po.supplierName || 'Unknown',
      poCount: 0,
      orderValueNgn: 0,
      paidNgn: 0,
      receivedCount: 0,
    };
    const orderValue = (po.lines || []).reduce(
      (sum, line) => sum + (Number(line.qtyOrdered) || 0) * (Number(line.unitPriceNgn) || 0),
      0
    );
    row.poCount += 1;
    row.orderValueNgn += orderValue;
    row.paidNgn += Number(po.supplierPaidNgn) || 0;
    if (po.status === 'Received') row.receivedCount += 1;
    bySupplier.set(key, row);
  });
  return [...bySupplier.values()]
    .map((row) => ({
      ...row,
      outstandingNgn: Math.max(0, row.orderValueNgn - row.paidNgn),
      receiveRatePct: row.poCount > 0 ? Math.round((row.receivedCount / row.poCount) * 100) : 0,
    }))
    .sort((a, b) => b.orderValueNgn - a.orderValueNgn)
    .slice(0, limit);
}

export function deliveryPerformanceSummary(deliveries = []) {
  return deliveries.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === 'Delivered') acc.delivered += 1;
      else if (row.status === 'In transit') acc.inTransit += 1;
      else if (row.status === 'Exception') acc.exceptions += 1;
      acc.totalLines += Number(row.lineCount) || 0;
      return acc;
    },
    { total: 0, delivered: 0, inTransit: 0, exceptions: 0, totalLines: 0 }
  );
}

/** Ledger lines with `atISO` date (YYYY-MM-DD or full ISO) within [startDate, endDate]. */
export function filterLedgerEntriesInRange(ledgerEntries = [], startDate, endDate) {
  return (ledgerEntries || []).filter((e) => {
    const iso = toIsoDate(e.atISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

/**
 * Rows for customer ledger / receipts report (export + print).
 * @param {Array} quotations - for customer name fallback by quotation id
 */
export function customerLedgerActivityRows(ledgerEntries = [], quotations = [], startDate, endDate) {
  const inRange = filterLedgerEntriesInRange(ledgerEntries, startDate, endDate);
  const quoteCustomer = new Map(
    (quotations || []).map((q) => [String(q.id || '').trim(), q.customer || q.customerName || ''])
  );
  return [...inRange].sort((a, b) => String(a.atISO).localeCompare(String(b.atISO))).map((e) => {
    const qref = String(e.quotationRef || '').trim();
    return {
      atISO: e.atISO,
      type: e.type,
      customerID: e.customerID,
      customerName: e.customerName || '',
      quotationRef: qref,
      quotationCustomer: qref ? quoteCustomer.get(qref) || '' : '',
      amountNgn: e.amountNgn,
      paymentMethod: e.paymentMethod || '',
      bankReference: e.bankReference || '',
      purpose: e.purpose || '',
      note: e.note || '',
      branchId: e.branchId || '',
    };
  });
}

export function filterBankReconciliationInRange(bankReconciliation = [], startDate, endDate) {
  return (bankReconciliation || []).filter((row) => {
    const iso = toIsoDate(row.bankDateISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

export function filterTreasuryMovementsInRange(treasuryMovements = [], startDate, endDate) {
  return (treasuryMovements || []).filter((m) => {
    const iso = toIsoDate(m.postedAtISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

/** Net treasury amount (₦) for movements tied to a ledger source (includes reversals). */
export function netTreasuryAmountForLedgerSource(treasuryMovements = [], sourceKind, sourceId) {
  const sid = String(sourceId || '').trim();
  const sk = String(sourceKind || '').trim();
  if (!sid || !sk) return 0;
  return Math.round(
    (treasuryMovements || [])
      .filter((m) => m.sourceKind === sk && m.sourceId === sid)
      .reduce((s, m) => s + (Number(m.amountNgn) || 0), 0)
  );
}

/**
 * RECEIPT ledger lines in period whose net treasury (LEDGER_RECEIPT) does not match amount.
 * Policy: if you post cash, treasury split should equal receipt amount (±tol).
 */
export function ledgerReceiptsTreasuryMismatches(
  ledgerEntries = [],
  treasuryMovements = [],
  startDate,
  endDate,
  tolNgn = 1
) {
  const inRange = filterLedgerEntriesInRange(ledgerEntries, startDate, endDate);
  const rows = [];
  for (const e of inRange) {
    if (e.type !== 'RECEIPT') continue;
    const expected = Math.round(Math.abs(Number(e.amountNgn) || 0));
    if (expected <= 0) continue;
    const net = netTreasuryAmountForLedgerSource(treasuryMovements, 'LEDGER_RECEIPT', e.id);
    if (Math.abs(net - expected) > tolNgn) {
      rows.push({
        section: 'receipt',
        ledgerEntryId: e.id,
        atISO: e.atISO,
        customerName: e.customerName || '',
        quotationRef: e.quotationRef || '',
        ledgerAmountNgn: expected,
        treasuryNetNgn: net,
        deltaNgn: expected - net,
        issue:
          net === 0
            ? 'No treasury movement (or net zero) for this receipt id'
            : 'Treasury net does not match receipt amount',
      });
    }
  }
  return rows;
}

/** ADVANCE_IN / OVERPAY_ADVANCE in period vs treasury source LEDGER_ADVANCE. */
export function ledgerAdvancesTreasuryMismatches(
  ledgerEntries = [],
  treasuryMovements = [],
  startDate,
  endDate,
  tolNgn = 1
) {
  const inRange = filterLedgerEntriesInRange(ledgerEntries, startDate, endDate);
  const rows = [];
  for (const e of inRange) {
    if (e.type !== 'ADVANCE_IN' && e.type !== 'OVERPAY_ADVANCE') continue;
    const expected = Math.round(Math.abs(Number(e.amountNgn) || 0));
    if (expected <= 0) continue;
    const net = netTreasuryAmountForLedgerSource(treasuryMovements, 'LEDGER_ADVANCE', e.id);
    if (Math.abs(net - expected) > tolNgn) {
      rows.push({
        section: 'advance',
        ledgerEntryId: e.id,
        atISO: e.atISO,
        type: e.type,
        customerName: e.customerName || '',
        ledgerAmountNgn: expected,
        treasuryNetNgn: net,
        deltaNgn: expected - net,
        issue:
          net === 0
            ? 'No treasury movement for this advance id'
            : 'Treasury net does not match advance amount',
      });
    }
  }
  return rows;
}

/** RECEIPT_IN lines in period referencing a ledger id that is not a RECEIPT row. */
export function treasuryReceiptInsOrphanLedger(treasuryMovements = [], ledgerEntries = [], startDate, endDate) {
  const byId = new Map((ledgerEntries || []).map((e) => [e.id, e]));
  const rows = [];
  for (const m of filterTreasuryMovementsInRange(treasuryMovements, startDate, endDate)) {
    if (m.type !== 'RECEIPT_IN' || m.sourceKind !== 'LEDGER_RECEIPT' || !m.sourceId) continue;
    const le = byId.get(m.sourceId);
    if (!le || le.type !== 'RECEIPT') {
      rows.push({
        section: 'orphan_treasury',
        treasuryMovementId: m.id,
        postedAtISO: m.postedAtISO,
        sourceId: m.sourceId,
        amountNgn: m.amountNgn,
        issue: 'No RECEIPT ledger entry with this id',
      });
    }
  }
  return rows;
}

export function receiptAdvanceTreasuryReconciliationRows(
  ledgerEntries,
  treasuryMovements,
  startDate,
  endDate
) {
  return [
    ...ledgerReceiptsTreasuryMismatches(ledgerEntries, treasuryMovements, startDate, endDate),
    ...ledgerAdvancesTreasuryMismatches(ledgerEntries, treasuryMovements, startDate, endDate),
    ...treasuryReceiptInsOrphanLedger(treasuryMovements, ledgerEntries, startDate, endDate),
  ];
}

/** Paid from ledger attributed to a quotation (applied + receipts − receipt reversals). */
export function ledgerAttributedPaidNgnForQuotation(ledgerEntries, quotationId) {
  const id = String(quotationId || '').trim();
  if (!id) return 0;
  const applied = sumForQuotationInEntries(ledgerEntries, id, 'ADVANCE_APPLIED');
  const receipts = sumForQuotationInEntries(ledgerEntries, id, 'RECEIPT');
  const receiptReversals = sumForQuotationInEntries(ledgerEntries, id, 'RECEIPT_REVERSAL');
  return Math.round(applied + receipts - receiptReversals);
}

/** Quotations where `paidNgn` differs from ledger-attributed paid total (tolerance in NGN). */
export function quotationPaidNgnLedgerDiscrepancies(quotations = [], ledgerEntries = [], toleranceNgn = 1) {
  return (quotations || [])
    .map((q) => {
      const stored = Math.round(Number(q.paidNgn) || 0);
      const ledgerPaid = ledgerAttributedPaidNgnForQuotation(ledgerEntries, q.id);
      const delta = stored - ledgerPaid;
      return {
        quotationID: q.id,
        dateISO: q.dateISO,
        customer: q.customer,
        totalNgn: q.totalNgn,
        paidNgnOnQuote: stored,
        ledgerAttributedPaidNgn: ledgerPaid,
        deltaNgn: delta,
      };
    })
    .filter((row) => Math.abs(row.deltaNgn) > toleranceNgn);
}

export function filterCoilLotsReceivedInRange(coilLots = [], startDate, endDate) {
  return (coilLots || []).filter((lot) => {
    const iso = toIsoDate(lot.receivedAtISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

export function grnCoilRegisterRows(coilLots = [], startDate, endDate) {
  return filterCoilLotsReceivedInRange(coilLots, startDate, endDate)
    .slice()
    .sort((a, b) => String(a.receivedAtISO).localeCompare(String(b.receivedAtISO)))
    .map((lot) => ({
      receivedAtISO: lot.receivedAtISO,
      coilNo: lot.coilNo,
      poID: lot.poID || '',
      supplierName: lot.supplierName || '',
      productID: lot.productID,
      lineKey: lot.lineKey || '',
      qtyReceived: lot.qtyReceived,
      weightKg: lot.weightKg ?? '',
      landedCostNgn: lot.landedCostNgn ?? '',
      unitCostNgnPerKg: lot.unitCostNgnPerKg ?? '',
      currentStatus: lot.currentStatus,
      branchId: lot.branchId || '',
    }));
}

function poLineOrderedValueNgn(line) {
  const q = Number(line.qtyOrdered) || 0;
  const up = Math.round(Number(line.unitPriceNgn) || 0);
  const upkg = Math.round(Number(line.unitPricePerKgNgn) || 0);
  if (up > 0) return Math.round(q * up);
  if (upkg > 0) return Math.round(q * upkg);
  return 0;
}

function poLineReceivedValueNgn(line) {
  const q = Number(line.qtyReceived) || 0;
  const up = Math.round(Number(line.unitPriceNgn) || 0);
  const upkg = Math.round(Number(line.unitPricePerKgNgn) || 0);
  if (up > 0) return Math.round(q * up);
  if (upkg > 0) return Math.round(q * upkg);
  return 0;
}

/** One row per PO: ordered value, received value (qty received × price), supplier paid. */
export function purchaseOrderAccrualBridgeRows(purchaseOrders = []) {
  return (purchaseOrders || []).map((po) => {
    const lines = po.lines || [];
    const orderedValueNgn = lines.reduce((s, l) => s + poLineOrderedValueNgn(l), 0);
    const receivedValueNgn = lines.reduce((s, l) => s + poLineReceivedValueNgn(l), 0);
    const paidNgn = Math.round(Number(po.supplierPaidNgn) || 0);
    return {
      poID: po.poID,
      supplierName: po.supplierName,
      orderDateISO: po.orderDateISO,
      status: po.status,
      orderedValueNgn,
      receivedValueNgn,
      supplierPaidNgn: paidNgn,
      receivedMinusPaidNgn: receivedValueNgn - paidNgn,
      branchId: po.branchId || '',
    };
  });
}

/** Coil lots still holding quantity — inventory value using stored cost fields when present. */
export function coilInventoryValuationRows(coilLots = []) {
  return (coilLots || [])
    .filter((lot) => (Number(lot.qtyRemaining) || 0) > 0.0001 || (Number(lot.currentWeightKg) || 0) > 0.0001)
    .map((lot) => {
      const kg = Number(lot.currentWeightKg) || Number(lot.qtyRemaining) || 0;
      const unit = Math.round(Number(lot.unitCostNgnPerKg) || 0);
      const valueNgn =
        unit > 0 && kg > 0
          ? Math.round(kg * unit)
          : lot.landedCostNgn != null && Number(lot.landedCostNgn) > 0
            ? Math.round(Number(lot.landedCostNgn))
            : '';
      return {
        coilNo: lot.coilNo,
        productID: lot.productID,
        poID: lot.poID || '',
        kgOnHand: kg,
        unitCostNgnPerKg: unit || '',
        extendedValueNgn: valueNgn,
        currentStatus: lot.currentStatus,
        branchId: lot.branchId || '',
      };
    });
}

/** Stock movements in period with optional COGS value (e.g. COIL_CONSUMPTION). */
export function filterStockMovementsInRange(movements = [], startDate, endDate) {
  return (movements || []).filter((m) => {
    const iso = toIsoDate(m.dateISO || m.atISO);
    return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

export function cogsMovementRows(movements = [], startDate, endDate) {
  return filterStockMovementsInRange(movements, startDate, endDate)
    .filter((m) => String(m.type || '').includes('CONSUMPTION') || Number(m.valueNgn) > 0)
    .map((m) => ({
      dateISO: toIsoDate(m.dateISO || m.atISO),
      atISO: m.atISO,
      type: m.type,
      ref: m.ref || '',
      productID: m.productID || '',
      qty: m.qty,
      unitPriceNgn: m.unitPriceNgn ?? '',
      valueNgn: m.valueNgn ?? '',
      detail: m.detail || '',
    }));
}

/** Approved payment requests with unpaid balance (accrual helper). */
export function accruedApprovedPayablesRows(paymentRequests = [], startDate, endDate) {
  return (paymentRequests || [])
    .filter((pr) => {
      if (String(pr.approvalStatus) !== 'Approved') return false;
      const requested = Math.round(Number(pr.amountRequestedNgn) || 0);
      const paid = Math.round(Number(pr.paidAmountNgn) || 0);
      if (requested - paid <= 0) return false;
      const iso = toIsoDate(pr.approvedAtISO || pr.requestDate);
      return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
    })
    .map((pr) => {
      const requested = Math.round(Number(pr.amountRequestedNgn) || 0);
      const paid = Math.round(Number(pr.paidAmountNgn) || 0);
      return {
        requestID: pr.requestID,
        approvedAtISO: pr.approvedAtISO || '',
        requestDate: pr.requestDate,
        description: pr.description || '',
        expenseID: pr.expenseID || '',
        expenseCategory: pr.expenseCategory || '',
        amountRequestedNgn: requested,
        paidAmountNgn: paid,
        accruedUnpaidNgn: requested - paid,
        branchId: pr.branchId || '',
      };
    });
}

export function openAuditQueue(bankReconciliation = [], paymentRequests = [], refunds = []) {
  const items = [];
  bankReconciliation
    .filter((x) => x.status === 'Review')
    .forEach((x) => {
      items.push({
        id: x.id,
        customer: x.description,
        amount: Math.abs(Number(x.amountNgn) || 0),
        bank: 'Bank statement',
        date: x.bankDateISO,
        desc: x.systemMatch || 'Unmatched statement line',
      });
    });
  paymentRequests
    .filter((x) => {
      const requested = Number(x.amountRequestedNgn) || 0;
      const paid = Number(x.paidAmountNgn) || 0;
      if (x.approvalStatus === 'Rejected') return false;
      if (x.approvalStatus !== 'Approved') return true;
      return paid < requested;
    })
    .forEach((x) => {
      const requested = Number(x.amountRequestedNgn) || 0;
      const paid = Number(x.paidAmountNgn) || 0;
      items.push({
        id: x.requestID,
        customer: x.description || 'Payment request',
        amount: Math.max(0, requested - paid),
        bank: x.approvalStatus === 'Approved' ? 'Treasury queue' : 'Approval queue',
        date: x.requestDate,
        desc: x.approvalStatus === 'Approved' ? x.expenseID || 'Awaiting payout' : x.expenseID || 'Awaiting approval',
      });
    });
  refunds
    .filter((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0)
    .forEach((x) => {
      items.push({
        id: x.refundID,
        customer: x.customer,
        amount: refundOutstandingAmount(x),
        bank: 'Refund queue',
        date: x.approvalDate || x.requestedAtISO?.slice(0, 10) || '',
        desc: x.reason || 'Approved refund awaiting payment',
      });
    });
  return items.slice(0, 12);
}

