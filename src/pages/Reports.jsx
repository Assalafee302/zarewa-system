import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ChevronDown, Factory, FileSpreadsheet, Landmark, Printer, Receipt, Scale, Table2 } from 'lucide-react';
import { PageHeader, PageShell, MainPanel } from '../components/layout';
import { ReportPrintModal } from '../components/reports/ReportPrintModal';
import { formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import {
  accruedApprovedPayablesRows,
  coilInventoryValuationRows,
  cogsMovementRows,
  customerLedgerActivityRows,
  deliveryPerformanceSummary,
  filterAccessoryUsageInRange,
  filterBankReconciliationInRange,
  filterExpensesInRange,
  filterPurchaseOrdersInRange,
  filterQuotationsInRange,
  filterRefundsInRange,
  filterStockMovementsInRange,
  filterTreasuryMovementsInRange,
  grnCoilRegisterRows,
  liveReceivablesNgn,
  productionAttributedRevenueNgn,
  productionOutputDateISO,
  purchaseOrderAccrualBridgeRows,
  quotationPaidNgnReceiptDiscrepancies,
  receiptAdvanceTreasuryReconciliationRows,
  receivablesAgingBuckets,
  salesPeriodCashBridgeExportRows,
  salesPeriodCashBridgeSummary,
  supplierPerformanceSummary,
  topCustomersByProductionAttributedSales,
} from '../lib/liveAnalytics';
import { procurementKindFromPo } from '../lib/procurementPoKind';

const PACK_PERIOD_COSTS_INVENTORY = 'Period costs & inventory (pack)';
const PACK_CASH_BANK_AR = 'Cash, bank & AR reconciliation (pack)';
const PACK_GL_AUDIT = 'General ledger audit (period)';
const PACK_SALES_CUSTOMER = 'Sales & customer activity (period)';
const PACK_OPS_PROCUREMENT = 'Operations & procurement (pack)';
const PACK_PRODUCTION_TRANSACTION = 'Production transaction register';

function rowsPeriodCostsInventoryPack(expenses, paymentRequests, coilLots, movements, startDate, endDate) {
  const rows = [];
  filterExpensesInRange(expenses, startDate, endDate).forEach((e) => {
    rows.push({
      packSection: 'Expenses',
      expenseID: e.expenseID,
      date: e.date,
      category: e.category,
      expenseType: e.expenseType,
      amountNgn: e.amountNgn,
      paymentMethod: e.paymentMethod,
      reference: e.reference,
      branchId: e.branchId,
    });
  });
  accruedApprovedPayablesRows(paymentRequests, startDate, endDate).forEach((r) => {
    rows.push({ packSection: 'Accruals', ...r });
  });
  coilInventoryValuationRows(coilLots).forEach((r) => {
    rows.push({ packSection: 'Valuation', ...r });
  });
  cogsMovementRows(movements, startDate, endDate).forEach((r) => {
    rows.push({ packSection: 'COGS_movement', ...r });
  });
  return rows;
}

function rowsCashBankArPack(
  bankReconciliation,
  ledgerEntries,
  treasuryMovements,
  quotations,
  receipts,
  startDate,
  endDate
) {
  const rows = [];
  filterBankReconciliationInRange(bankReconciliation, startDate, endDate).forEach((r) => {
    rows.push({
      packSection: 'Bank_recon',
      bankDateISO: r.bankDateISO,
      id: r.id,
      description: r.description,
      amountNgn: r.amountNgn,
      systemMatch: r.systemMatch,
      status: r.status,
      branchId: r.branchId,
    });
  });
  receiptAdvanceTreasuryReconciliationRows(ledgerEntries, treasuryMovements, startDate, endDate).forEach((r) => {
    rows.push({
      packSection: 'Receipt_treasury_exceptions',
      section: r.section,
      ledgerEntryId: r.ledgerEntryId || '',
      atISO: r.atISO || r.postedAtISO || '',
      customerName: r.customerName || '',
      quotationRef: r.quotationRef || '',
      ledgerAmountNgn: r.ledgerAmountNgn,
      treasuryNetNgn: r.treasuryNetNgn,
      deltaNgn: r.deltaNgn,
      issue: r.issue || '',
    });
  });
  quotationPaidNgnReceiptDiscrepancies(quotations, receipts, ledgerEntries).forEach((r) => {
    rows.push({
      packSection: 'AR_paid_vs_receipts',
      quotationID: r.quotationID,
      dateISO: r.dateISO,
      customer: r.customer,
      totalNgn: r.totalNgn,
      paidNgnOnQuote: r.paidNgnOnQuote,
      receiptPaidNgn: r.receiptPaidNgn,
      advanceAppliedNgn: r.advanceAppliedNgn,
      expectedPaidNgn: r.expectedPaidNgn,
      deltaNgn: r.deltaNgn,
    });
  });
  filterTreasuryMovementsInRange(treasuryMovements, startDate, endDate).forEach((m) => {
    rows.push({
      packSection: 'Treasury_movements',
      postedAtISO: m.postedAtISO,
      type: m.type,
      accountType: m.accountType,
      accountName: m.accountName,
      amountNgn: m.amountNgn,
      sourceKind: m.sourceKind,
      sourceId: m.sourceId,
      reference: m.reference,
    });
  });
  return rows;
}

function rowsSalesCustomerPack(ledgerEntries, productionJobs, quotations, refunds, startDate, endDate) {
  const rows = [];
  filterQuotationsInRange(quotations, startDate, endDate).forEach((q) => {
    rows.push({
      packSection: 'Quotations',
      quotationID: q.id,
      dateISO: q.dateISO,
      customer: q.customer,
      totalNgn: q.totalNgn,
      status: q.status,
    });
  });
  customerLedgerActivityRows(ledgerEntries, quotations, startDate, endDate).forEach((r) => {
    rows.push({
      packSection: 'Customer_ledger',
      atISO: r.atISO,
      type: r.type,
      customerID: r.customerID,
      customerName: r.customerName,
      quotationRef: r.quotationRef,
      amountNgn: r.amountNgn,
      paymentMethod: r.paymentMethod,
      bankReference: r.bankReference,
      purpose: r.purpose,
      branchId: r.branchId,
    });
  });
  salesPeriodCashBridgeExportRows(ledgerEntries, productionJobs, quotations, refunds, startDate, endDate).forEach(
    (r) => {
      rows.push({
        packSection: `Cash_AR_bridge:${r.reportSection}`,
        category: r.category,
        ledgerType: r.ledgerType,
        dateISO: r.dateISO,
        recordId: r.recordId,
        customer: r.customer,
        quotationRef: r.quotationRef,
        amountNgn: r.amountNgn,
        metresProduced: r.metresProduced,
        remarks: r.remarks,
      });
    }
  );
  return rows;
}

function rowsOpsProcurementPack(liveProducts, purchaseOrders, coilLots, accessoryUsage, startDate, endDate) {
  const rows = [];
  liveProducts.forEach((p) => {
    rows.push({
      packSection: 'Inventory_SKUs',
      productID: p.productID,
      name: p.name,
      stockLevel: p.stockLevel,
      unit: p.unit,
      lowStockThreshold: p.lowStockThreshold,
    });
  });
  purchaseOrders.forEach((p) => {
    rows.push({
      packSection: 'Purchase_orders',
      poID: p.poID,
      procurementKind: procurementKindFromPo(p),
      supplierName: p.supplierName,
      orderDateISO: p.orderDateISO,
      status: p.status,
      lineCount: p.lines?.length || 0,
      supplierPaidNgn: p.supplierPaidNgn || 0,
    });
  });
  grnCoilRegisterRows(coilLots, startDate, endDate).forEach((r) => {
    rows.push({ packSection: 'GRN_register', ...r });
  });
  purchaseOrderAccrualBridgeRows(purchaseOrders).forEach((r) => {
    rows.push({ packSection: 'PO_accrual_bridge', ...r });
  });
  filterAccessoryUsageInRange(accessoryUsage, startDate, endDate).forEach((u) => {
    rows.push({
      packSection: 'Production_accessory_usage',
      jobID: u.jobID,
      quotationRef: u.quotationRef,
      quoteLineId: u.quoteLineId,
      name: u.name,
      orderedQty: u.orderedQty,
      suppliedQty: u.suppliedQty,
      inventoryProductId: u.inventoryProductId || '',
      postedAtISO: u.postedAtISO,
    });
  });
  return rows;
}

/** Three finance packs + GL; two operational packs under “More”. */
const PRIMARY_REPORT_GROUPS = [
  {
    id: 'accounting-pl',
    title: 'Costs, accruals & inventory',
    subtitle:
      'Single export: expenses in range, unpaid approved accruals, inventory-lot valuation (coil & stone GRNs), and COGS movements (Excel = one sheet per section).',
    reports: [
      {
        id: 'period-costs-inventory',
        title: PACK_PERIOD_COSTS_INVENTORY,
        desc: 'Management accounts inputs — was: expenses, accrued payables, valuation & COGS.',
        icon: Receipt,
        formats: ['Excel', 'CSV'],
      },
    ],
  },
  {
    id: 'reconciliation',
    title: 'Bank, treasury & AR',
    subtitle:
      'Single export: bank statement lines, receipt/advance vs treasury exceptions, AR control list, and treasury movements in the period.',
    reports: [
      {
        id: 'cash-bank-ar',
        title: PACK_CASH_BANK_AR,
        desc: 'Was: bank recon, receipt vs treasury, AR check, financial (treasury) listing.',
        icon: Landmark,
        formats: ['Excel', 'CSV'],
      },
    ],
  },
  {
    id: 'audit-gl',
    title: 'General ledger',
    subtitle:
      'Trial balance, journal register, and full line detail in one Excel file. Print preview is trial balance only.',
    reports: [
      {
        id: 'gl-audit-pack',
        title: PACK_GL_AUDIT,
        desc: 'Was: TB, journal register, and line-level GL activity.',
        icon: Scale,
        formats: ['Excel', 'CSV'],
        requiresFinanceView: true,
      },
    ],
  },
];

const MORE_OPERATIONAL_REPORTS = [
  {
    id: 'sales-customer-pack',
    title: PACK_SALES_CUSTOMER,
    desc: 'Quotations in range, customer ledger lines, cash/AR/production bridge (includes refunds).',
    icon: Table2,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'ops-procurement-pack',
    title: PACK_OPS_PROCUREMENT,
    desc: 'SKU stock, purchase orders (with procurement kind), GRN/lot register, PO accrual bridge, production accessory postings in period.',
    icon: Factory,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'production-transaction-register',
    title: PACK_PRODUCTION_TRANSACTION,
    desc: 'Completed jobs in period: qt, production date, customer, coil colour/gauge, weights, metres, conversion, paid/refund (quote), material cost.',
    icon: Table2,
    formats: ['Excel', 'CSV'],
  },
];

function productionTransactionExportRows(raw) {
  return (raw || []).map((r) => {
    const { jobId, ...x } = r;
    void jobId;
    return {
      qtNo: x.qtNo,
      prodDate: x.prodDate,
      customer: x.customer,
      color: x.color,
      gauge: x.gauge,
      coilNo: x.coilNo,
      beforeKg: x.beforeKg,
      afterKg: x.afterKg,
      kgUsed: x.kgUsed,
      meters: x.meters,
      conversionKgM: x.conversionKgM ?? '',
      design: x.design,
      offcutKg: x.offcutKg ?? '',
      paidNgn: x.paidNgn ?? '',
      refundPaidNgn: x.refundPaidNgn ?? '',
      materialCostNgn: x.materialCostNgn,
    };
  });
}

function buildProductionTransactionPrintPayload(raw) {
  const fmtK = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const rows = (raw || []).map((r) => ({
    qtNo: r.qtNo,
    prodDate: r.prodDate,
    customer: r.customer,
    color: r.color,
    gauge: r.gauge,
    coilNo: r.coilNo,
    beforeKg: fmtK(r.beforeKg),
    afterKg: fmtK(r.afterKg),
    kgUsed: fmtK(r.kgUsed),
    meters: Number(r.meters).toLocaleString('en-NG', { maximumFractionDigits: 2 }),
    conversionKgM: r.conversionKgM != null ? Number(r.conversionKgM).toFixed(3) : '—',
    design: r.design,
    offcutKg: r.offcutKg != null ? fmtK(r.offcutKg) : '—',
    paid: r.paidNgn != null ? formatNgn(r.paidNgn) : '—',
    refund: r.refundPaidNgn != null ? formatNgn(r.refundPaidNgn) : '—',
    cost: formatNgn(r.materialCostNgn),
  }));
  return {
    title: PACK_PRODUCTION_TRANSACTION,
    columns: [
      { key: 'qtNo', label: 'Qt no' },
      { key: 'prodDate', label: 'Prod. date' },
      { key: 'customer', label: 'Customer' },
      { key: 'color', label: 'Color' },
      { key: 'gauge', label: 'Gauge' },
      { key: 'coilNo', label: 'Coil' },
      { key: 'beforeKg', label: 'Before kg' },
      { key: 'afterKg', label: 'After kg' },
      { key: 'kgUsed', label: 'Kg used' },
      { key: 'meters', label: 'Metres' },
      { key: 'conversionKgM', label: 'kg/m' },
      { key: 'design', label: 'Design' },
      { key: 'offcutKg', label: 'Offcut kg' },
      { key: 'paid', label: 'Paid' },
      { key: 'refund', label: 'Refund' },
      { key: 'cost', label: 'Cost' },
    ],
    rows,
    summaryLines: [
      { label: 'Rows (coil lines)', value: String(rows.length) },
      {
        label: 'Paid / refund',
        value: 'Shown once per job (first coil row) to avoid double-count.',
      },
      {
        label: 'Offcut kg',
        value: 'Non-zero opening − used − closing only (trace check).',
      },
      {
        label: 'Cost',
        value: 'Consumed kg × coil unit ₦/kg when GRN cost exists.',
      },
    ],
  };
}

const LIST_ROW =
  'z-list-row flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-sm font-semibold text-slate-800';
const PANEL = 'z-panel-section';
const SUBHDR = 'z-section-title mb-4';

function downloadRows(name, rows, fmt) {
  const safe = name.toLowerCase().replace(/\s+/g, '-');
  if (!rows.length) return;

  if (fmt === 'Excel') {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Report');
    XLSX.writeFile(wb, `${safe}.xlsx`);
    return;
  }

  const sep = ',';
  const header = Object.keys(rows[0] || {});
  const lines = [header.join(sep)];
  rows.forEach((row) => {
    lines.push(
      header
        .map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`)
        .join(sep)
    );
  });
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const Reports = () => {
  const { show: showToast } = useToast();
  const { movements, products: liveProducts } = useInventory();
  const ws = useWorkspace();
  const [aggregateSummary, setAggregateSummary] = useState(null);
  const [summaryErr, setSummaryErr] = useState(null);

  const countOnlyOverview =
    ws.hasPermission('reports.view') &&
    !ws.canAccessModule('sales') &&
    !ws.canAccessModule('procurement') &&
    !ws.canAccessModule('operations') &&
    !ws.canAccessModule('finance');

  useEffect(() => {
    if (!countOnlyOverview || !ws.hasWorkspaceData) return undefined;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/reports/summary');
      if (cancelled) return;
      if (!ok || !data?.ok) {
        setSummaryErr(data?.error || 'Could not load summary');
        setAggregateSummary(null);
        return;
      }
      setAggregateSummary(data.counts);
      setSummaryErr(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [countOnlyOverview, ws.hasWorkspaceData, ws.refreshEpoch]);

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState('2026-03-01');
  const [endDate, setEndDate] = useState(today);
  const snapshot = ws?.snapshot ?? {};
  const quotations = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.quotations) ? snapshot.quotations : []),
    [snapshot.quotations, ws.hasWorkspaceData]
  );
  const receipts = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.receipts) ? snapshot.receipts : []),
    [snapshot.receipts, ws.hasWorkspaceData]
  );
  const expenses = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.expenses) ? snapshot.expenses : []),
    [snapshot.expenses, ws.hasWorkspaceData]
  );
  const purchaseOrders = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.purchaseOrders) ? snapshot.purchaseOrders : []),
    [snapshot.purchaseOrders, ws.hasWorkspaceData]
  );
  const deliveries = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.deliveries) ? snapshot.deliveries : []),
    [snapshot.deliveries, ws.hasWorkspaceData]
  );
  const treasuryMovements = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.treasuryMovements) ? snapshot.treasuryMovements : []),
    [snapshot.treasuryMovements, ws.hasWorkspaceData]
  );
  const ledgerEntries = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : []),
    [snapshot.ledgerEntries, ws.hasWorkspaceData]
  );
  const productionJobs = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.productionJobs) ? snapshot.productionJobs : []),
    [snapshot.productionJobs, ws.hasWorkspaceData]
  );
  const refunds = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.refunds) ? snapshot.refunds : []),
    [snapshot.refunds, ws.hasWorkspaceData]
  );
  const bankReconciliation = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(snapshot.bankReconciliation) ? snapshot.bankReconciliation : [],
    [snapshot.bankReconciliation, ws.hasWorkspaceData]
  );
  const coilLots = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.coilLots) ? snapshot.coilLots : []),
    [snapshot.coilLots, ws.hasWorkspaceData]
  );
  const paymentRequests = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(snapshot.paymentRequests) ? snapshot.paymentRequests : [],
    [snapshot.paymentRequests, ws.hasWorkspaceData]
  );
  const accessoryUsage = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(snapshot.productionJobAccessoryUsage)
        ? snapshot.productionJobAccessoryUsage
        : [],
    [snapshot.productionJobAccessoryUsage, ws.hasWorkspaceData]
  );

  const procurementMixInPeriod = useMemo(() => {
    const inRange = filterPurchaseOrdersInRange(purchaseOrders, startDate, endDate);
    const mix = { coil: 0, stone: 0, accessory: 0 };
    for (const po of inRange) {
      const k = procurementKindFromPo(po);
      if (k in mix) mix[k] += 1;
    }
    return { ...mix, total: inRange.length };
  }, [endDate, purchaseOrders, startDate]);

  const accessoryUsageInPeriod = useMemo(
    () => filterAccessoryUsageInRange(accessoryUsage, startDate, endDate),
    [accessoryUsage, endDate, startDate]
  );

  const treasuryMovementsInPeriod = useMemo(
    () => filterTreasuryMovementsInRange(treasuryMovements, startDate, endDate),
    [endDate, startDate, treasuryMovements]
  );

  const salesKpis = useMemo(() => {
    const quotes = filterQuotationsInRange(quotations, startDate, endDate);
    const quotationPipelineNgn = quotes.reduce((s, q) => s + (q.totalNgn ?? 0), 0);
    const producedSalesNgn = productionAttributedRevenueNgn(quotations, productionJobs, startDate, endDate);
    const totalPaid = receipts
      .filter((r) => r.dateISO >= startDate && r.dateISO <= endDate)
      .reduce((s, q) => s + (q.amountNgn ?? 0), 0);
    const outstanding = liveReceivablesNgn(quotations, ledgerEntries);
    const productionJobsCompletedInRange = productionJobs.filter((j) => {
      if (String(j.status || '').trim() !== 'Completed') return false;
      const iso = productionOutputDateISO(j);
      if (!iso) return false;
      return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
    }).length;
    return {
      quotationPipelineNgn,
      producedSalesNgn,
      totalPaid,
      outstanding,
      rowCount: quotes.length,
      productionJobsCompletedInRange,
    };
  }, [endDate, ledgerEntries, productionJobs, quotations, receipts, startDate]);

  const expensesInPeriodNgn = useMemo(
    () =>
      filterExpensesInRange(expenses, startDate, endDate).reduce((s, e) => s + (Number(e.amountNgn) || 0), 0),
    [endDate, expenses, startDate]
  );

  const refundsInPeriod = useMemo(
    () => filterRefundsInRange(refunds, startDate, endDate),
    [endDate, refunds, startDate]
  );

  const inventoryPreview = useMemo(() => {
    return liveProducts.map((p) => ({
      name: p.name,
      stockLevel: p.stockLevel,
      low: p.stockLevel < p.lowStockThreshold,
      unit: p.unit,
    }));
  }, [liveProducts]);

  const movementPreview = useMemo(
    () => filterStockMovementsInRange(movements, startDate, endDate).slice(0, 12),
    [endDate, movements, startDate]
  );

  const topCustomers = topCustomersByProductionAttributedSales(quotations, productionJobs, startDate, endDate, 5);
  const arAging = useMemo(
    () => receivablesAgingBuckets(quotations, ledgerEntries, endDate),
    [endDate, ledgerEntries, quotations]
  );
  const supplierPerformance = useMemo(() => supplierPerformanceSummary(purchaseOrders, 5), [purchaseOrders]);
  const deliveryPerformance = useMemo(() => deliveryPerformanceSummary(deliveries), [deliveries]);

  const periodLabel = useMemo(() => `Period ${startDate} → ${endDate}`, [endDate, startDate]);

  const [printOpen, setPrintOpen] = useState(false);
  const [printPayload, setPrintPayload] = useState(null);

  const getExportRows = useCallback(
    (name) => {
      if (name === PACK_PERIOD_COSTS_INVENTORY) {
        return rowsPeriodCostsInventoryPack(expenses, paymentRequests, coilLots, movements, startDate, endDate);
      }
      if (name === PACK_CASH_BANK_AR) {
        return rowsCashBankArPack(
          bankReconciliation,
          ledgerEntries,
          treasuryMovements,
          quotations,
          receipts,
          startDate,
          endDate
        );
      }
      if (name === PACK_SALES_CUSTOMER) {
        return rowsSalesCustomerPack(ledgerEntries, productionJobs, quotations, refunds, startDate, endDate);
      }
      if (name === PACK_OPS_PROCUREMENT) {
        return rowsOpsProcurementPack(liveProducts, purchaseOrders, coilLots, accessoryUsage, startDate, endDate);
      }
      return [];
    },
    [
      bankReconciliation,
      coilLots,
      endDate,
      expenses,
      ledgerEntries,
      liveProducts,
      movements,
      paymentRequests,
      productionJobs,
      purchaseOrders,
      quotations,
      receipts,
      refunds,
      startDate,
      treasuryMovements,
      accessoryUsage,
    ]
  );

  const getPrintConfig = useCallback(
    (name) => {
      if (name === PACK_PERIOD_COSTS_INVENTORY) {
        const exRows = filterExpensesInRange(expenses, startDate, endDate);
        const acRows = accruedApprovedPayablesRows(paymentRequests, startDate, endDate);
        const val = coilInventoryValuationRows(coilLots);
        const cogs = cogsMovementRows(movements, startDate, endDate);
        const rows = exRows.map((e) => ({
          expenseID: e.expenseID,
          date: e.date,
          category: e.category || '—',
          type: e.expenseType || '—',
          amount: formatNgn(e.amountNgn),
          reference: e.reference || '—',
        }));
        return {
          title: PACK_PERIOD_COSTS_INVENTORY,
          columns: [
            { key: 'expenseID', label: 'Expense' },
            { key: 'date', label: 'Date' },
            { key: 'category', label: 'Category' },
            { key: 'type', label: 'Type' },
            { key: 'amount', label: 'Amount' },
            { key: 'reference', label: 'Reference' },
          ],
          rows,
          summaryLines: [
            { label: 'Print shows expenses only', value: String(exRows.length) },
            { label: 'Expenses total', value: formatNgn(exRows.reduce((s, e) => s + (Number(e.amountNgn) || 0), 0)) },
            { label: 'Unpaid accrual rows', value: String(acRows.length) },
            {
              label: 'Accrual unpaid ₦',
              value: formatNgn(acRows.reduce((s, r) => s + (Number(r.accruedUnpaidNgn) || 0), 0)),
            },
            { label: 'Coil valuation lines', value: String(val.length) },
            { label: 'COGS movement lines', value: String(cogs.length) },
            { label: 'Excel', value: 'Sheets: Expenses, Accruals, Valuation, COGS.' },
          ],
        };
      }
      if (name === PACK_CASH_BANK_AR) {
        const br = filterBankReconciliationInRange(bankReconciliation, startDate, endDate);
        const rtExc = receiptAdvanceTreasuryReconciliationRows(
          ledgerEntries,
          treasuryMovements,
          startDate,
          endDate
        );
        const arDisc = quotationPaidNgnReceiptDiscrepancies(quotations, receipts, ledgerEntries);
        const tm = filterTreasuryMovementsInRange(treasuryMovements, startDate, endDate);
        const rows = br.map((r) => ({
          bankDate: r.bankDateISO,
          description: r.description || '—',
          amount: formatNgn(r.amountNgn),
          status: r.status,
          match: r.systemMatch || '—',
        }));
        return {
          title: PACK_CASH_BANK_AR,
          columns: [
            { key: 'bankDate', label: 'Bank date' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'match', label: 'System match' },
          ],
          rows,
          summaryLines: [
            { label: 'Print shows bank lines only', value: String(br.length) },
            {
              label: 'In Review (bank)',
              value: String(br.filter((x) => x.status === 'Review').length),
            },
            { label: 'Receipt/treasury exception rows', value: String(rtExc.length) },
            { label: 'AR mismatch rows', value: String(arDisc.length) },
            { label: 'Treasury movements in period', value: String(tm.length) },
            { label: 'Note', value: '0 receipt exceptions = no ±₦1 mismatches in range.' },
          ],
        };
      }
      if (name === PACK_SALES_CUSTOMER) {
        const raw = salesPeriodCashBridgeExportRows(
          ledgerEntries,
          productionJobs,
          quotations,
          refunds,
          startDate,
          endDate
        );
        const s = salesPeriodCashBridgeSummary(
          ledgerEntries,
          productionJobs,
          quotations,
          refunds,
          startDate,
          endDate
        );
        const rows = raw.map((r) => ({
          section: r.reportSection,
          category: r.category,
          ledgerType: r.ledgerType,
          dateISO: r.dateISO || '—',
          recordId: r.recordId || '—',
          customer: r.customer || '—',
          quotation: r.quotationRef || '—',
          amount:
            r.reportSection === 'Production completed (period)' ? '—' : formatNgn(r.amountNgn),
          metres: r.metresProduced === '' ? '—' : String(r.metresProduced),
          remarks: r.remarks || '—',
        }));
        const qInRange = filterQuotationsInRange(quotations, startDate, endDate).length;
        const ledCount = customerLedgerActivityRows(ledgerEntries, quotations, startDate, endDate).length;
        return {
          title: PACK_SALES_CUSTOMER,
          columns: [
            { key: 'section', label: 'Section' },
            { key: 'category', label: 'Category' },
            { key: 'ledgerType', label: 'Type' },
            { key: 'dateISO', label: 'Date' },
            { key: 'recordId', label: 'Record' },
            { key: 'customer', label: 'Customer' },
            { key: 'quotation', label: 'Quotation' },
            { key: 'amount', label: 'Amount' },
            { key: 'metres', label: 'Metres' },
            { key: 'remarks', label: 'Remarks' },
          ],
          rows,
          summaryLines: [
            { label: 'Print: cash/AR/production bridge', value: `${s.rowCount} rows` },
            { label: 'Quotations in range (Excel)', value: String(qInRange) },
            { label: 'Customer ledger lines in period (Excel)', value: String(ledCount) },
            {
              label: 'Receipts on quote — produced by period end',
              value: formatNgn(s.cashInReceiptProducedNgn),
            },
            {
              label: 'Receipts on quote — not produced by period end',
              value: formatNgn(s.cashInReceiptNotProducedNgn),
            },
            { label: 'Refund payouts in period', value: formatNgn(s.refundPayoutsNgn) },
            { label: 'Open receivables (live)', value: formatNgn(s.receivablesOpenNgn) },
            { label: 'Production jobs completed in period', value: String(s.productionJobsCompleted) },
          ],
        };
      }
      if (name === PACK_OPS_PROCUREMENT) {
        const rows = liveProducts.map((p) => ({
          productID: p.productID,
          name: p.name,
          onHand: `${p.stockLevel.toLocaleString()} ${p.unit}`,
          reorderAt: `${Number(p.lowStockThreshold ?? 0).toLocaleString()} ${p.unit}`,
          flag: p.stockLevel < p.lowStockThreshold ? 'Below minimum' : 'OK',
        }));
        const grn = grnCoilRegisterRows(coilLots, startDate, endDate);
        const poBr = purchaseOrderAccrualBridgeRows(purchaseOrders);
        const accN = filterAccessoryUsageInRange(accessoryUsage, startDate, endDate).length;
        return {
          title: PACK_OPS_PROCUREMENT,
          columns: [
            { key: 'productID', label: 'SKU' },
            { key: 'name', label: 'Description' },
            { key: 'onHand', label: 'On hand' },
            { key: 'reorderAt', label: 'Reorder at' },
            { key: 'flag', label: 'Stock flag' },
          ],
          rows,
          summaryLines: [
            { label: 'Print shows SKU listing only', value: String(rows.length) },
            {
              label: 'Below reorder',
              value: String(liveProducts.filter((p) => p.stockLevel < p.lowStockThreshold).length),
            },
            { label: 'Purchase orders (Excel)', value: String(purchaseOrders.length) },
            { label: 'GRN / inventory lots in period (Excel)', value: String(grn.length) },
            { label: 'PO accrual rows (Excel)', value: String(poBr.length) },
            { label: 'Accessory usage lines in period (Excel)', value: String(accN) },
          ],
        };
      }
      return {
        title: name,
        columns: [{ key: 'info', label: 'Message' }],
        rows: [{ info: 'No A4 layout for this selection.' }],
        summaryLines: [],
      };
    },
    [
      accessoryUsage,
      bankReconciliation,
      coilLots,
      endDate,
      expenses,
      ledgerEntries,
      liveProducts,
      movements,
      paymentRequests,
      productionJobs,
      purchaseOrders,
      quotations,
      receipts,
      refunds,
      startDate,
      treasuryMovements,
    ]
  );

  const downloadReport = async (name, fmt) => {
    const packSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '');

    if (name === PACK_GL_AUDIT) {
      if (!ws.hasPermission('finance.view')) {
        showToast('General ledger pack requires finance.view.', { variant: 'info' });
        return;
      }
      const q = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const [tbRes, jRes, aRes] = await Promise.all([
        apiFetch(`/api/gl/trial-balance?${q}`),
        apiFetch(`/api/gl/journals?${q}`),
        apiFetch(`/api/gl/activity?${q}`),
      ]);
      if (!tbRes.ok || !tbRes.data?.ok) {
        showToast(tbRes.data?.error || 'Could not load trial balance.', { variant: 'error' });
        return;
      }
      if (!jRes.ok || !jRes.data?.ok) {
        showToast(jRes.data?.error || 'Could not load GL journals.', { variant: 'error' });
        return;
      }
      if (!aRes.ok || !aRes.data?.ok) {
        showToast(aRes.data?.error || 'Could not load GL activity.', { variant: 'error' });
        return;
      }
      const tb = tbRes.data;
      const jn = jRes.data;
      const act = aRes.data;
      if (fmt === 'Excel') {
        const wb = XLSX.utils.book_new();
        const tbRows = (tb.rows || []).map((r) => ({
          accountCode: r.accountCode,
          accountName: r.accountName,
          accountType: r.accountType,
          debitNgn: r.debitNgn,
          creditNgn: r.creditNgn,
          netNgn: r.netNgn,
        }));
        const jRows = (jn.journals || []).map((j) => ({
          journalId: j.journalId,
          entryDateISO: j.entryDateISO,
          periodKey: j.periodKey,
          memo: j.memo,
          sourceKind: j.sourceKind,
          sourceId: j.sourceId,
          totalDebitNgn: j.totalDebitNgn,
          totalCreditNgn: j.totalCreditNgn,
        }));
        const aRows = (act.lines || []).map((l) => ({
          entryDateISO: l.entryDateISO,
          journalId: l.journalId,
          accountCode: l.accountCode,
          accountName: l.accountName,
          debitNgn: l.debitNgn,
          creditNgn: l.creditNgn,
          lineMemo: l.lineMemo,
          journalMemo: l.journalMemo,
          sourceKind: l.sourceKind,
          sourceId: l.sourceId,
        }));
        if (tbRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tbRows), 'Trial_balance');
        if (jRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jRows), 'Journals');
        if (aRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aRows), 'Activity');
        XLSX.writeFile(wb, `${packSlug}.xlsx`);
        showToast(`${name} exported as Excel (3 sheets).`);
        return;
      }
      const flat = [
        ...(tb.rows || []).map((r) => ({
          packSection: 'Trial_balance',
          accountCode: r.accountCode,
          accountName: r.accountName,
          debitNgn: r.debitNgn,
          creditNgn: r.creditNgn,
          netNgn: r.netNgn,
        })),
        ...(jn.journals || []).map((j) => ({
          packSection: 'Journals',
          journalId: j.journalId,
          entryDateISO: j.entryDateISO,
          memo: j.memo,
          totalDebitNgn: j.totalDebitNgn,
          totalCreditNgn: j.totalCreditNgn,
        })),
        ...(act.lines || []).map((l) => ({
          packSection: 'Activity',
          entryDateISO: l.entryDateISO,
          accountCode: l.accountCode,
          debitNgn: l.debitNgn,
          creditNgn: l.creditNgn,
          lineMemo: l.lineMemo,
        })),
      ];
      if (!flat.length) {
        showToast('No GL data in the selected period.', { variant: 'info' });
        return;
      }
      downloadRows(name, flat, fmt);
      showToast(`${name} exported as ${fmt}.`);
      return;
    }

    if (name === PACK_PERIOD_COSTS_INVENTORY && fmt === 'Excel') {
      const ex = filterExpensesInRange(expenses, startDate, endDate);
      const ac = accruedApprovedPayablesRows(paymentRequests, startDate, endDate);
      const val = coilInventoryValuationRows(coilLots);
      const cogs = cogsMovementRows(movements, startDate, endDate);
      if (!ex.length && !ac.length && !val.length && !cogs.length) {
        showToast('No rows for this pack in the selected range.', { variant: 'info' });
        return;
      }
      const wb = XLSX.utils.book_new();
      if (ex.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ex), 'Expenses');
      if (ac.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ac), 'Accruals');
      if (val.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(val), 'Valuation');
      if (cogs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cogs), 'COGS');
      XLSX.writeFile(wb, `${packSlug}.xlsx`);
      showToast(`${name} exported as Excel (multi-sheet).`);
      return;
    }

    if (name === PACK_CASH_BANK_AR && fmt === 'Excel') {
      const bank = filterBankReconciliationInRange(bankReconciliation, startDate, endDate);
      const rt = receiptAdvanceTreasuryReconciliationRows(ledgerEntries, treasuryMovements, startDate, endDate);
      const ar = quotationPaidNgnReceiptDiscrepancies(quotations, receipts, ledgerEntries);
      const tm = filterTreasuryMovementsInRange(treasuryMovements, startDate, endDate);
      if (!bank.length && !rt.length && !ar.length && !tm.length) {
        showToast('No rows for this pack in the selected range.', { variant: 'info' });
        return;
      }
      const wb = XLSX.utils.book_new();
      if (bank.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bank), 'Bank_recon');
      if (rt.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rt), 'Receipt_treasury');
      if (ar.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ar), 'AR_check');
      if (tm.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tm), 'Treasury');
      XLSX.writeFile(wb, `${packSlug}.xlsx`);
      showToast(`${name} exported as Excel (multi-sheet).`);
      return;
    }

    if (name === PACK_SALES_CUSTOMER && fmt === 'Excel') {
      const qFlat = filterQuotationsInRange(quotations, startDate, endDate).map((q) => ({
        quotationID: q.id,
        dateISO: q.dateISO,
        customer: q.customer,
        totalNgn: q.totalNgn,
        status: q.status,
      }));
      const led = customerLedgerActivityRows(ledgerEntries, quotations, startDate, endDate);
      const bridge = salesPeriodCashBridgeExportRows(
        ledgerEntries,
        productionJobs,
        quotations,
        refunds,
        startDate,
        endDate
      );
      if (!qFlat.length && !led.length && !bridge.length) {
        showToast('No rows for this pack in the selected range.', { variant: 'info' });
        return;
      }
      const wb = XLSX.utils.book_new();
      if (qFlat.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qFlat), 'Quotations');
      if (led.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(led), 'Ledger');
      if (bridge.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bridge), 'Cash_AR_bridge');
      XLSX.writeFile(wb, `${packSlug}.xlsx`);
      showToast(`${name} exported as Excel (multi-sheet).`);
      return;
    }

    if (name === PACK_OPS_PROCUREMENT && fmt === 'Excel') {
      const grn = grnCoilRegisterRows(coilLots, startDate, endDate);
      const poBr = purchaseOrderAccrualBridgeRows(purchaseOrders);
      const invFlat = liveProducts.map((p) => ({
        productID: p.productID,
        name: p.name,
        stockLevel: p.stockLevel,
        unit: p.unit,
        lowStockThreshold: p.lowStockThreshold,
      }));
      const poFlat = purchaseOrders.map((p) => ({
        poID: p.poID,
        procurementKind: procurementKindFromPo(p),
        supplierName: p.supplierName,
        orderDateISO: p.orderDateISO,
        status: p.status,
        lineCount: p.lines?.length || 0,
        supplierPaidNgn: p.supplierPaidNgn || 0,
      }));
      const accUsage = filterAccessoryUsageInRange(accessoryUsage, startDate, endDate).map((u) => ({
        jobID: u.jobID,
        quotationRef: u.quotationRef,
        quoteLineId: u.quoteLineId,
        name: u.name,
        orderedQty: u.orderedQty,
        suppliedQty: u.suppliedQty,
        inventoryProductId: u.inventoryProductId || '',
        postedAtISO: u.postedAtISO,
      }));
      if (!invFlat.length && !poFlat.length && !grn.length && !poBr.length && !accUsage.length) {
        showToast('No rows for this pack.', { variant: 'info' });
        return;
      }
      const wb = XLSX.utils.book_new();
      if (invFlat.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invFlat), 'Inventory');
      if (poFlat.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(poFlat), 'POs');
      if (grn.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grn), 'GRN_lots');
      if (poBr.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(poBr), 'PO_accrual');
      if (accUsage.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accUsage), 'Acc_usage');
      XLSX.writeFile(wb, `${packSlug}.xlsx`);
      showToast(`${name} exported as Excel (multi-sheet).`);
      return;
    }

    if (name === PACK_PRODUCTION_TRANSACTION) {
      const q = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const { ok, data } = await apiFetch(`/api/reports/production-transaction?${q}`);
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load production transaction report.', { variant: 'error' });
        return;
      }
      const flat = productionTransactionExportRows(data.rows || []);
      if (!flat.length) {
        showToast('No completed production rows in the selected range.', { variant: 'info' });
        return;
      }
      if (fmt === 'Excel') {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'Production_txn');
        XLSX.writeFile(wb, `${packSlug}.xlsx`);
        showToast(`${name} exported as Excel.`);
        return;
      }
      downloadRows(name, flat, fmt);
      showToast(`${name} exported as ${fmt}.`);
      return;
    }

    const rows = getExportRows(name);
    if (!rows.length) {
      showToast(`No rows for ${name.toLowerCase()} in the selected range.`, { variant: 'info' });
      return;
    }
    downloadRows(name, rows, fmt);
    showToast(`${name} exported as ${fmt}.`);
  };

  const openPrintSheet = async (name) => {
    if (name === PACK_GL_AUDIT) {
      if (!ws.hasPermission('finance.view')) {
        showToast('General ledger pack requires finance.view.', { variant: 'info' });
        return;
      }
      const { ok, data } = await apiFetch(
        `/api/gl/trial-balance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load trial balance.', { variant: 'error' });
        return;
      }
      const rows = (data.rows || []).map((r) => ({
        account: `${r.accountCode} — ${r.accountName}`,
        debit: formatNgn(r.debitNgn),
        credit: formatNgn(r.creditNgn),
        net: formatNgn(r.netNgn),
      }));
      setPrintPayload({
        title: PACK_GL_AUDIT,
        columns: [
          { key: 'account', label: 'Account' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'net', label: 'Net' },
        ],
        rows,
        summaryLines: [
          { label: 'Print', value: 'Trial balance only (compact)' },
          { label: 'Period', value: `${data.startDate} → ${data.endDate}` },
          { label: 'Total debit', value: formatNgn(data.totals?.debitNgn ?? 0) },
          { label: 'Total credit', value: formatNgn(data.totals?.creditNgn ?? 0) },
          { label: 'Excel pack', value: 'Includes journal register + full line detail.' },
        ],
      });
      setPrintOpen(true);
      return;
    }
    if (name === PACK_PRODUCTION_TRANSACTION) {
      const q = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const { ok, data } = await apiFetch(`/api/reports/production-transaction?${q}`);
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load production transaction report.', { variant: 'error' });
        return;
      }
      const raw = data.rows || [];
      if (!raw.length) {
        showToast('No completed production rows in the selected range.', { variant: 'info' });
        return;
      }
      setPrintPayload(buildProductionTransactionPrintPayload(raw));
      setPrintOpen(true);
      return;
    }
    const cfg = getPrintConfig(name);
    setPrintPayload(cfg);
    setPrintOpen(true);
  };

  return (
    <PageShell>
      <ReportPrintModal
        isOpen={printOpen && !!printPayload}
        onClose={() => {
          setPrintOpen(false);
          setPrintPayload(null);
        }}
        title={printPayload?.title ?? 'Report'}
        periodLabel={periodLabel}
        columns={printPayload?.columns ?? []}
        rows={printPayload?.rows ?? []}
        summaryLines={printPayload?.summaryLines ?? []}
      />

      <PageHeader
        title="Reports"
        subtitle="Period dashboards plus consolidated export packs (costs, cash/AR, GL, sales, operations with coil/stone/accessory context). Expand “More” for sales/ops packs and the production transaction register."
      />
      {ws.hasPermission('exec.dashboard.view') ? (
        <p className="text-sm font-medium text-slate-600 -mt-4 mb-6 sm:-mt-6 sm:mb-8 max-w-2xl leading-relaxed">
          <Link to="/exec" className="font-bold text-teal-800 underline-offset-2 hover:underline">
            Executive overview
          </Link>{' '}
          — org-wide counts and approval queues (refunds, payment requests, payroll sign-off, bank reconciliation).
        </p>
      ) : null}

      <MainPanel className="!p-0 overflow-hidden sm:!p-0">
        <div className="p-6 sm:p-8 space-y-10">
        {countOnlyOverview && (
          <div className={`${PANEL} border-teal-100/80 bg-teal-50/30`}>
            <h3 className={SUBHDR}>Count-only overview</h3>
            <p className="text-sm font-medium text-slate-600 mb-4">
              Branch-scoped totals for your role. Detailed exports need Sales, Procurement, Operations, or Finance
              access.
            </p>
            {summaryErr && <p className="text-sm font-semibold text-red-600 mb-3">{summaryErr}</p>}
            {!aggregateSummary && !summaryErr && (
              <p className="text-sm font-medium text-slate-500">Loading summary…</p>
            )}
            {aggregateSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  ['Customers', aggregateSummary.customersTotal],
                  ['Quotations', aggregateSummary.quotationsTotal],
                  ['Receipts', aggregateSummary.receiptsTotal],
                  ['Purchase orders', aggregateSummary.purchaseOrdersTotal],
                  ['Deliveries', aggregateSummary.deliveriesTotal],
                  ['Cutting lists', aggregateSummary.cuttingListsTotal],
                  ['Ledger lines', aggregateSummary.ledgerEntriesTotal],
                  ['Refunds', aggregateSummary.refundsTotal],
                  ['Expenses', aggregateSummary.expensesTotal],
                  ['Products (SKUs)', aggregateSummary.productsTotal],
                  ['Suppliers', aggregateSummary.suppliersTotal],
                  ['Treasury movements', aggregateSummary.treasuryMovementsTotal],
                ].map(([label, n]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-2.5 shadow-sm"
                  >
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                    <p className="text-lg font-black text-[#134e4a] tabular-nums mt-0.5">{Number(n) || 0}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!countOnlyOverview && (
        <>
        <div className="z-page-hero grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 !mb-0">
          <div>
            <h3 className={SUBHDR}>Report period</h3>
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rep-start" className="z-field-label">
                    Start date
                  </label>
                  <input
                    id="rep-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="z-input"
                  />
                </div>
                <div>
                  <label htmlFor="rep-end" className="z-field-label">
                    End date
                  </label>
                  <input
                    id="rep-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="z-input"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed -mt-2">
                Most exports below filter by these dates (see each description).{' '}
                <span className="font-semibold text-slate-700">Quotation totals</span> are pipeline only — not revenue or
                sales. <span className="font-semibold text-slate-700">Sales</span> here means quotation value attributed
                when cutting lists are dated in the period (metre share). Cash receipts are period cash, not the same as
                sales.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Quotation pipeline (quote date)
                  </p>
                  <p className="text-xl font-black text-[#134e4a] tabular-nums">
                    {formatNgn(salesKpis.quotationPipelineNgn)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{salesKpis.rowCount} quotations · not sales</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Sales (produced)
                  </p>
                  <p className="text-xl font-black text-teal-800 tabular-nums">
                    {formatNgn(salesKpis.producedSalesNgn)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    {salesKpis.productionJobsCompletedInRange} job(s) completed in range
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Receipts (cash in period)
                  </p>
                  <p className="text-xl font-black text-emerald-700 tabular-nums">{formatNgn(salesKpis.totalPaid)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Receivables outstanding
                  </p>
                  <p className="text-xl font-black text-amber-700 tabular-nums">{formatNgn(salesKpis.outstanding)}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">All open quotes · not period-only</p>
                </div>
              </div>
            </form>
          </div>
          <div>
            <h3 className={SUBHDR}>Inventory snapshot</h3>
            <p className="text-sm font-medium text-slate-600 mb-4 leading-relaxed">
              Live stock against reorder threshold — matches the inventory export.
            </p>
            <div className="space-y-2 max-h-[min(280px,40vh)] overflow-y-auto pr-1 custom-scrollbar">
              {inventoryPreview.map((row) => (
                <div
                  key={row.name}
                  className={`${LIST_ROW} ${
                    row.low ? 'border-amber-200/80 bg-amber-50/40' : ''
                  }`}
                >
                  <span className="text-slate-800 truncate min-w-0">{row.name}</span>
                  <span className={`tabular-nums shrink-0 ${row.low ? 'text-amber-900' : 'text-[#134e4a]'}`}>
                    {row.stockLevel.toLocaleString()} {row.unit}
                    {row.low ? ' · Low' : ''}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-slate-500 mt-4">
              Low-stock SKUs: {liveProducts.filter((p) => p.stockLevel < p.lowStockThreshold).length} · Receivables
              open: {formatNgn(liveReceivablesNgn(quotations, ledgerEntries))}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className={PANEL}>
            <h3 className={SUBHDR}>Top customers (sales from production)</h3>
            <p className="text-xs text-slate-500 mb-3 -mt-2">
              Ranked by attributed quotation value on cutting lists dated in this period.
            </p>
            <div className="space-y-2">
              {topCustomers.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">No produced sales in range</p>
              ) : (
                topCustomers.map((row) => (
                  <div key={row.customer} className={LIST_ROW}>
                    <div className="min-w-0">
                      <p className="text-[#134e4a] truncate font-bold">{row.customer}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">
                        {row.completedJobs} production job(s) completed
                      </p>
                    </div>
                    <span className="font-bold text-[#134e4a] tabular-nums shrink-0">{formatNgn(row.amountNgn)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className={PANEL}>
            <h3 className={SUBHDR}>Financial snapshot</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Receivables open</p>
                <p className="text-sm font-black text-amber-700 tabular-nums mt-1">
                  {formatNgn(liveReceivablesNgn(quotations, ledgerEntries))}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Expenses (period)</p>
                <p className="text-sm font-black text-[#134e4a] tabular-nums mt-1">
                  {formatNgn(expensesInPeriodNgn)}
                </p>
                <p className="text-[9px] text-slate-400 mt-1">By expense date in range</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Refunds (period)</p>
                <p className="text-sm font-black text-rose-800 tabular-nums mt-1">{refundsInPeriod.length} requests</p>
                <p className="text-[9px] text-slate-400 mt-1">By request date in range</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Treasury movements</p>
                <p className="text-sm font-black text-[#134e4a] mt-1">{treasuryMovementsInPeriod.length}</p>
                <p className="text-[9px] text-slate-400 mt-1">By posted date in range</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Delivered shipments</p>
                <p className="text-sm font-black text-emerald-700 mt-1">
                  {deliveryPerformance.delivered} / {deliveryPerformance.total}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className={PANEL}>
            <h3 className={SUBHDR}>Procurement mix (POs in period)</h3>
            <p className="text-xs text-slate-500 mb-3 -mt-2">
              Purchase orders with an order date in the selected range, grouped by procurement kind (coil kg, stone
              metres, accessories).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Coil', procurementMixInPeriod.coil],
                ['Stone', procurementMixInPeriod.stone],
                ['Accessory', procurementMixInPeriod.accessory],
                ['Total POs', procurementMixInPeriod.total],
              ].map(([label, n]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="text-lg font-black text-[#134e4a] tabular-nums mt-0.5">{Number(n) || 0}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={PANEL}>
            <h3 className={SUBHDR}>Production accessories (posted in period)</h3>
            <p className="text-xs text-slate-500 mb-3 -mt-2">
              Lines recorded when accessories were supplied to jobs (posting date in range).
            </p>
            <div className="flex flex-wrap gap-3 mb-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Lines</p>
                <p className="text-lg font-black text-[#134e4a] tabular-nums mt-0.5">
                  {accessoryUsageInPeriod.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Qty supplied (sum)</p>
                <p className="text-lg font-black text-[#134e4a] tabular-nums mt-0.5">
                  {accessoryUsageInPeriod
                    .reduce((s, u) => s + (Number(u.suppliedQty) || 0), 0)
                    .toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {accessoryUsageInPeriod.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">No accessory postings in range</p>
              ) : (
                accessoryUsageInPeriod.slice(0, 8).map((u) => (
                  <div key={u.id} className={LIST_ROW}>
                    <div className="min-w-0">
                      <p className="text-[#134e4a] font-bold truncate">{u.name}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
                        {u.quotationRef || '—'} · job {u.jobID}
                      </p>
                    </div>
                    <span className="tabular-nums font-bold text-slate-800 shrink-0">
                      {Number(u.suppliedQty).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className={PANEL}>
            <h3 className={SUBHDR}>Receivables aging</h3>
            <div className="space-y-2">
              {[
                ['Current', arAging.current],
                ['1-30 days', arAging.days1to30],
                ['31-60 days', arAging.days31to60],
                ['61-90 days', arAging.days61to90],
                ['90+ days', arAging.days90plus],
              ].map(([label, value]) => (
                <div key={label} className={LIST_ROW}>
                  <span className="text-slate-600 font-semibold">{label}</span>
                  <span className="font-bold text-[#134e4a] tabular-nums">{formatNgn(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={PANEL}>
            <h3 className={SUBHDR}>Supplier performance</h3>
            <div className="space-y-2">
              {supplierPerformance.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">No supplier rows</p>
              ) : (
                supplierPerformance.map((row) => (
                  <div key={row.supplierName} className={`${LIST_ROW} !flex-col !items-stretch gap-2`}>
                    <p className="text-[#134e4a] font-bold">{row.supplierName}</p>
                    <p className="text-sm font-medium text-slate-600">
                      {row.poCount} PO(s) · Receive rate {row.receiveRatePct}%
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      Spend {formatNgn(row.orderValueNgn)} · Outstanding {formatNgn(row.outstandingNgn)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={PANEL}>
            <h3 className={SUBHDR}>Delivery performance</h3>
            <div className="space-y-2">
              <div className={LIST_ROW}>
                <span className="text-slate-600 font-semibold">Delivered</span>
                <span className="font-bold text-emerald-700 tabular-nums">{deliveryPerformance.delivered}</span>
              </div>
              <div className={LIST_ROW}>
                <span className="text-slate-600 font-semibold">In transit</span>
                <span className="font-bold text-sky-700 tabular-nums">{deliveryPerformance.inTransit}</span>
              </div>
              <div className={LIST_ROW}>
                <span className="text-slate-600 font-semibold">Exceptions</span>
                <span className="font-bold text-rose-700 tabular-nums">{deliveryPerformance.exceptions}</span>
              </div>
              <div className={LIST_ROW}>
                <span className="text-slate-600 font-semibold">Total dispatch lines</span>
                <span className="font-bold text-[#134e4a] tabular-nums">{deliveryPerformance.totalLines}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={PANEL}>
          <h3 className={SUBHDR}>Stock movement log</h3>
          <p className="text-sm font-medium text-slate-600 mb-4 leading-relaxed">
            Latest stock movements in the selected period (GRNs, transfers, adjustments, finished-goods postings —
            coil, stone, and SKU lines).
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {movementPreview.length === 0 ? (
              <p className="text-sm font-semibold text-slate-400">No movements in this period</p>
            ) : (
              movementPreview.map((m) => (
                <div key={m.id} className={`${LIST_ROW} flex-col items-stretch`}>
                  <div className="flex flex-wrap justify-between gap-2 w-full">
                    <span className="font-bold text-[#134e4a]">{m.type}</span>
                    <span className="text-sm font-medium text-slate-500 tabular-nums">
                      {m.atISO?.replace('T', ' ')}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-full">
                    {m.ref ? `${m.ref} · ` : ''}
                    {m.productID ? `${m.productID} ` : ''}
                    {m.qty != null ? `qty ${m.qty} ` : ''}
                    {m.detail || ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-0">
          <h3 className="z-section-title mb-2">Exports &amp; print</h3>
          <p className="text-sm font-medium text-slate-600 mb-8 max-w-2xl leading-relaxed">
            Consolidated packs: each Excel file uses multiple sheets where needed. The operations pack includes
            procurement kind on POs, GRN/inventory lots (coil and stone), and accessory usage lines for the period.
            Print shows a focused table plus counts for the rest (full detail stays in Excel/CSV).
          </p>

          {PRIMARY_REPORT_GROUPS.map((grp, gi) => (
            <section
              key={grp.id}
              className={`space-y-5 ${gi > 0 ? 'pt-10 mt-10 border-t border-slate-200/90' : ''}`}
            >
              <header className="max-w-3xl">
                <h4 className="text-lg font-black text-[#134e4a] tracking-tight">{grp.title}</h4>
                <p className="text-sm font-medium text-slate-600 mt-1.5 leading-relaxed">{grp.subtitle}</p>
              </header>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {grp.reports.map((r) => {
                  const Icon = r.icon;
                  const financeLocked = r.requiresFinanceView && !ws.hasPermission('finance.view');
                  const runPrint = () => {
                    if (financeLocked) {
                      showToast('This report needs the finance.view permission.', { variant: 'info' });
                      return;
                    }
                    openPrintSheet(r.title);
                  };
                  const runDownload = (fmt) => {
                    if (financeLocked) {
                      showToast('This export needs the finance.view permission.', { variant: 'info' });
                      return;
                    }
                    downloadReport(r.title, fmt);
                  };
                  return (
                    <div
                      key={r.id}
                      className={`z-soft-panel p-6 sm:p-7 transition-all hover:border-teal-100/80 ${
                        financeLocked ? 'opacity-[0.88]' : ''
                      }`}
                    >
                      {financeLocked && (
                        <p className="text-xs font-bold text-amber-800 mb-3 rounded-lg bg-amber-50 border border-amber-100/80 px-3 py-2">
                          Requires finance.view to export or print
                        </p>
                      )}
                      <div className="flex items-start gap-4 mb-5">
                        <div className="p-3 rounded-2xl bg-white text-[#134e4a] border border-slate-100 shadow-sm shrink-0">
                          <Icon size={22} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-black text-[#134e4a] tracking-tight">{r.title}</h3>
                          <p className="text-sm font-medium text-slate-600 mt-1.5 leading-relaxed">{r.desc}</p>
                        </div>
                      </div>
                      <div className="z-form-actions !mt-0 !pt-0 !border-0 flex-wrap">
                        <button
                          type="button"
                          onClick={runPrint}
                          className="z-btn-secondary flex-1 min-w-[140px] justify-center"
                          title={`A4 print preview — ${r.title}`}
                        >
                          <Printer size={16} />
                          Print sheet
                        </button>
                        {r.formats.map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => runDownload(fmt)}
                            className="z-btn-primary flex-1 min-w-[120px] justify-center"
                            title={`Generate ${fmt} for ${r.title}`}
                          >
                            <FileSpreadsheet size={14} />
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <details className="group mt-12 rounded-2xl border border-slate-200/90 bg-slate-50/40 overflow-hidden open:bg-white open:shadow-sm open:border-slate-200">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-4 sm:px-6 font-black text-[#134e4a] text-sm sm:text-base hover:bg-slate-100/60 transition-colors [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">More operational exports</span>
                <span className="text-xs font-semibold text-slate-500 shrink-0 hidden sm:inline">
                  Sales &amp; customer · Operations &amp; procurement
                </span>
              </span>
              <ChevronDown
                className="shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                size={22}
                strokeWidth={2}
              />
            </summary>
            <div className="px-5 pb-6 sm:px-6 pt-0 border-t border-slate-100 bg-white/80">
              <p className="text-sm text-slate-600 py-4 leading-relaxed">
                Day-to-day operations and supporting registers. Same date range as above unless the report notes
                otherwise.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {MORE_OPERATIONAL_REPORTS.map((r) => {
                  const Icon = r.icon;
                  return (
                    <div
                      key={r.id}
                      className="z-soft-panel p-6 sm:p-7 transition-all hover:border-teal-100/80 bg-white"
                    >
                      <div className="flex items-start gap-4 mb-5">
                        <div className="p-3 rounded-2xl bg-white text-[#134e4a] border border-slate-100 shadow-sm shrink-0">
                          <Icon size={22} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-black text-[#134e4a] tracking-tight">{r.title}</h3>
                          <p className="text-sm font-medium text-slate-600 mt-1.5 leading-relaxed">{r.desc}</p>
                        </div>
                      </div>
                      <div className="z-form-actions !mt-0 !pt-0 !border-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openPrintSheet(r.title)}
                          className="z-btn-secondary flex-1 min-w-[140px] justify-center"
                          title={`A4 print preview — ${r.title}`}
                        >
                          <Printer size={16} />
                          Print sheet
                        </button>
                        {r.formats.map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => downloadReport(r.title, fmt)}
                            className="z-btn-primary flex-1 min-w-[120px] justify-center"
                            title={`Generate ${fmt} for ${r.title}`}
                          >
                            <FileSpreadsheet size={14} />
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        </div>
        </>
        )}
        </div>
      </MainPanel>
    </PageShell>
  );
};

export default Reports;
