import { amountDueOnQuotationFromEntries } from './customerLedgerCore';
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

