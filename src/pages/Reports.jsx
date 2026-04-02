import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  FileText,
  Landmark,
  Layers,
  Link2,
  List,
  Package,
  Printer,
  Receipt,
  RotateCcw,
  Scale,
  ScrollText,
  ShoppingCart,
} from 'lucide-react';
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
  filterBankReconciliationInRange,
  filterExpensesInRange,
  filterQuotationsInRange,
  filterRefundsInRange,
  grnCoilRegisterRows,
  liveReceivablesNgn,
  productionAttributedRevenueNgn,
  purchaseOrderAccrualBridgeRows,
  quotationPaidNgnLedgerDiscrepancies,
  receiptAdvanceTreasuryReconciliationRows,
  receivablesAgingBuckets,
  supplierPerformanceSummary,
  topCustomersBySales,
} from '../lib/liveAnalytics';

/** Primary exports: P&amp;L, reconciliation, and GL audit (operational reports are under “More”). */
const PRIMARY_REPORT_GROUPS = [
  {
    id: 'accounting-pl',
    title: 'Accounting & profit and loss',
    subtitle:
      'Posted spend, unpaid accruals, and inventory / COGS — the usual inputs for management accounts and P&L review.',
    reports: [
      {
        id: 'expenses',
        title: 'Expenses report',
        desc: 'Posted expenses in the period by standard category, type, and reference.',
        icon: Receipt,
        formats: ['Excel', 'CSV'],
      },
      {
        id: 'accruals',
        title: 'Accrued expenses (approved unpaid)',
        desc: 'Approved payment requests still unpaid (by approval date in range) — period cut-off and payables.',
        icon: ClipboardList,
        formats: ['Excel', 'CSV'],
      },
      {
        id: 'inventory-costing',
        title: 'Inventory valuation & COGS',
        desc: 'Open coil valuation and COGS movements dated in the period (production consumption).',
        icon: Package,
        formats: ['Excel', 'CSV'],
      },
    ],
  },
  {
    id: 'reconciliation',
    title: 'Reconciliation',
    subtitle: 'Match bank, treasury, and sub-ledgers to the books — exception-focused where noted.',
    reports: [
      {
        id: 'bank-recon',
        title: 'Bank reconciliation (period)',
        desc: 'Statement lines with bank date in range (all statuses); clear Review items in Finance.',
        icon: Landmark,
        formats: ['Excel', 'CSV'],
      },
      {
        id: 'receipt-treasury',
        title: 'Receipt & advance vs treasury',
        desc: 'Ledger receipt/advance amounts vs treasury by source; flags orphans and net mismatches (±₦1).',
        icon: Link2,
        formats: ['Excel', 'CSV'],
      },
      {
        id: 'ar-reconcile',
        title: 'AR: paid vs ledger check',
        desc: 'Quotations where paid on the quote ≠ ledger-attributed payments — AR control.',
        icon: AlertTriangle,
        formats: ['Excel', 'CSV'],
      },
      {
        id: 'financial',
        title: 'Financial report',
        desc: 'Treasury movement listing with accounts, amounts, and source references (cash trail).',
        icon: Banknote,
        formats: ['Excel', 'CSV'],
      },
    ],
  },
  {
    id: 'audit-gl',
    title: 'Audit trail — general ledger',
    subtitle: 'Posted GL for the period. Export and print require finance.view.',
    reports: [
      {
        id: 'gl-tb',
        title: 'General ledger — trial balance',
        desc: 'Debits and credits by account for journals in the date range.',
        icon: Scale,
        formats: ['Excel', 'CSV'],
        requiresFinanceView: true,
      },
      {
        id: 'gl-journals',
        title: 'GL — journal register',
        desc: 'One row per journal with totals, memo, and system source link.',
        icon: ScrollText,
        formats: ['Excel', 'CSV'],
        requiresFinanceView: true,
      },
      {
        id: 'gl-activity',
        title: 'GL — line detail (all accounts)',
        desc: 'Every posted line by date and account — full audit trail.',
        icon: List,
        formats: ['Excel', 'CSV'],
        requiresFinanceView: true,
      },
    ],
  },
];

const MORE_OPERATIONAL_REPORTS = [
  {
    id: 'sales',
    title: 'Sales report',
    desc: 'Quotations in the period by date; use dashboard KPIs above for revenue mix.',
    icon: ShoppingCart,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'customer-ledger',
    title: 'Customer ledger activity',
    desc: 'All customer ledger lines in the period: receipts, advances, applications.',
    icon: BookOpen,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'refunds',
    title: 'Refunds report',
    desc: 'Refund requests in the period with status and payout amounts.',
    icon: RotateCcw,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'inventory',
    title: 'Inventory report',
    desc: 'SKU on-hand, units, and reorder thresholds (stock listing).',
    icon: Package,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'purchase',
    title: 'Purchase report',
    desc: 'Purchase orders, status, line counts, and supplier paid-to-date.',
    icon: FileText,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'grn-register',
    title: 'GRN / coil receipt register',
    desc: 'Coils received in the period with PO, supplier, quantities, landed cost.',
    icon: Factory,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'po-accrual',
    title: 'PO accrual bridge',
    desc: 'Per PO: ordered vs received value vs supplier paid — procurement bridge.',
    icon: Layers,
    formats: ['Excel', 'CSV'],
  },
];

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
  const cuttingLists = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.cuttingLists) ? snapshot.cuttingLists : []),
    [snapshot.cuttingLists, ws.hasWorkspaceData]
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

  const salesKpis = useMemo(() => {
    const quotes = filterQuotationsInRange(quotations, startDate, endDate);
    const totalSales = quotes.reduce((s, q) => s + (q.totalNgn ?? 0), 0);
    const productionRevenueNgn = productionAttributedRevenueNgn(quotations, cuttingLists, startDate, endDate);
    const totalPaid = receipts
      .filter((r) => r.dateISO >= startDate && r.dateISO <= endDate)
      .reduce((s, q) => s + (q.amountNgn ?? 0), 0);
    const outstanding = liveReceivablesNgn(quotations, ledgerEntries);
    const cuttingListsInRange = cuttingLists.filter((cl) => {
      const iso = String(cl.dateISO || '').slice(0, 10);
      return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
    }).length;
    return {
      totalSales,
      productionRevenueNgn,
      totalPaid,
      outstanding,
      rowCount: quotes.length,
      cuttingListsInRange,
    };
  }, [cuttingLists, endDate, ledgerEntries, quotations, receipts, startDate]);

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

  const movementPreview = useMemo(() => movements.slice(0, 12), [movements]);

  const topCustomers = topCustomersBySales(quotations, startDate, endDate, 5);
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
      if (name === 'Sales report') {
        return filterQuotationsInRange(quotations, startDate, endDate).map((q) => ({
          quotationID: q.id,
          dateISO: q.dateISO,
          customer: q.customer,
          totalNgn: q.totalNgn,
          status: q.status,
        }));
      }
      if (name === 'Inventory report') {
        return liveProducts.map((p) => ({
          productID: p.productID,
          name: p.name,
          stockLevel: p.stockLevel,
          unit: p.unit,
          lowStockThreshold: p.lowStockThreshold,
        }));
      }
      if (name === 'Purchase report') {
        return purchaseOrders.map((p) => ({
          poID: p.poID,
          supplierName: p.supplierName,
          orderDateISO: p.orderDateISO,
          status: p.status,
          lineCount: p.lines?.length || 0,
          supplierPaidNgn: p.supplierPaidNgn || 0,
        }));
      }
      if (name === 'Expenses report') {
        return filterExpensesInRange(expenses, startDate, endDate).map((e) => ({
          expenseID: e.expenseID,
          date: e.date,
          category: e.category,
          expenseType: e.expenseType,
          amountNgn: e.amountNgn,
          paymentMethod: e.paymentMethod,
          reference: e.reference,
          branchId: e.branchId,
        }));
      }
      if (name === 'Refunds report') {
        return filterRefundsInRange(refunds, startDate, endDate).map((r) => ({
          refundID: r.refundID,
          requestedAtISO: r.requestedAtISO,
          customer: r.customer,
          quotationRef: r.quotationRef,
          status: r.status,
          amountNgn: r.amountNgn,
          approvedAmountNgn: r.approvedAmountNgn,
          paidAmountNgn: r.paidAmountNgn,
          reasonCategory: r.reasonCategory,
        }));
      }
      if (name === 'Customer ledger activity') {
        return customerLedgerActivityRows(ledgerEntries, quotations, startDate, endDate).map((r) => ({
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
        }));
      }
      if (name === 'Bank reconciliation (period)') {
        return filterBankReconciliationInRange(bankReconciliation, startDate, endDate).map((r) => ({
          bankDateISO: r.bankDateISO,
          id: r.id,
          description: r.description,
          amountNgn: r.amountNgn,
          systemMatch: r.systemMatch,
          status: r.status,
          branchId: r.branchId,
        }));
      }
      if (name === 'Receipt & advance vs treasury') {
        return receiptAdvanceTreasuryReconciliationRows(
          ledgerEntries,
          treasuryMovements,
          startDate,
          endDate
        );
      }
      if (name === 'AR: paid vs ledger check') {
        return quotationPaidNgnLedgerDiscrepancies(quotations, ledgerEntries).map((r) => ({
          quotationID: r.quotationID,
          dateISO: r.dateISO,
          customer: r.customer,
          totalNgn: r.totalNgn,
          paidNgnOnQuote: r.paidNgnOnQuote,
          ledgerAttributedPaidNgn: r.ledgerAttributedPaidNgn,
          deltaNgn: r.deltaNgn,
        }));
      }
      if (name === 'GRN / coil receipt register') {
        return grnCoilRegisterRows(coilLots, startDate, endDate);
      }
      if (name === 'PO accrual bridge') {
        return purchaseOrderAccrualBridgeRows(purchaseOrders);
      }
      if (name === 'Inventory valuation & COGS') {
        return [
          ...coilInventoryValuationRows(coilLots).map((r) => ({ section: 'valuation', ...r })),
          ...cogsMovementRows(movements, startDate, endDate).map((r) => ({ section: 'cogs_movement', ...r })),
        ];
      }
      if (name === 'Accrued expenses (approved unpaid)') {
        return accruedApprovedPayablesRows(paymentRequests, startDate, endDate);
      }
      if (name === 'Financial report') {
        return treasuryMovements.map((m) => ({
          postedAtISO: m.postedAtISO,
          type: m.type,
          account: `${m.accountType} — ${m.accountName}`,
          amountNgn: m.amountNgn,
          sourceKind: m.sourceKind,
          sourceId: m.sourceId,
          reference: m.reference,
        }));
      }
      return treasuryMovements.map((m) => ({
        postedAtISO: m.postedAtISO,
        type: m.type,
        account: `${m.accountType} — ${m.accountName}`,
        amountNgn: m.amountNgn,
        sourceKind: m.sourceKind,
        sourceId: m.sourceId,
        reference: m.reference,
      }));
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
      purchaseOrders,
      quotations,
      refunds,
      startDate,
      treasuryMovements,
    ]
  );

  const getPrintConfig = useCallback(
    (name) => {
      if (name === 'Sales report') {
        const rows = filterQuotationsInRange(quotations, startDate, endDate).map((q) => ({
          quotationID: q.id,
          dateISO: q.dateISO,
          customer: q.customer,
          total: formatNgn(q.totalNgn),
          status: q.status,
        }));
        return {
          title: 'Sales report',
          columns: [
            { key: 'quotationID', label: 'Quotation' },
            { key: 'dateISO', label: 'Date' },
            { key: 'customer', label: 'Customer' },
            { key: 'total', label: 'Total' },
            { key: 'status', label: 'Status' },
          ],
          rows,
          summaryLines: [
            { label: 'Quotations in range (by quote date)', value: String(rows.length) },
            { label: 'Order value in period (quotation date)', value: formatNgn(salesKpis.totalSales) },
            {
              label: 'Production-attributed revenue (cutting list date)',
              value: formatNgn(salesKpis.productionRevenueNgn),
            },
            { label: 'Cutting lists dated in period', value: String(salesKpis.cuttingListsInRange) },
            { label: 'Customer receipts in period (cash)', value: formatNgn(salesKpis.totalPaid) },
            { label: 'Outstanding receivables (all open quotes)', value: formatNgn(salesKpis.outstanding) },
          ],
        };
      }
      if (name === 'Inventory report') {
        const rows = liveProducts.map((p) => ({
          productID: p.productID,
          name: p.name,
          onHand: `${p.stockLevel.toLocaleString()} ${p.unit}`,
          reorderAt: `${Number(p.lowStockThreshold ?? 0).toLocaleString()} ${p.unit}`,
          flag: p.stockLevel < p.lowStockThreshold ? 'Below minimum' : 'OK',
        }));
        return {
          title: 'Inventory report',
          columns: [
            { key: 'productID', label: 'SKU' },
            { key: 'name', label: 'Description' },
            { key: 'onHand', label: 'On hand' },
            { key: 'reorderAt', label: 'Reorder at' },
            { key: 'flag', label: 'Stock flag' },
          ],
          rows,
          summaryLines: [
            { label: 'SKUs tracked', value: String(rows.length) },
            {
              label: 'Below reorder',
              value: String(liveProducts.filter((p) => p.stockLevel < p.lowStockThreshold).length),
            },
          ],
        };
      }
      if (name === 'Purchase report') {
        const rows = purchaseOrders.map((p) => ({
          poID: p.poID,
          supplierName: p.supplierName,
          orderDateISO: p.orderDateISO,
          status: p.status,
          lines: String(p.lines?.length || 0),
          paid: formatNgn(p.supplierPaidNgn || 0),
        }));
        return {
          title: 'Purchase report',
          columns: [
            { key: 'poID', label: 'PO' },
            { key: 'supplierName', label: 'Supplier' },
            { key: 'orderDateISO', label: 'Order date' },
            { key: 'status', label: 'Status' },
            { key: 'lines', label: 'Lines' },
            { key: 'paid', label: 'Paid (supplier)' },
          ],
          rows,
          summaryLines: [{ label: 'Purchase orders', value: String(rows.length) }],
        };
      }
      if (name === 'Expenses report') {
        const exRows = filterExpensesInRange(expenses, startDate, endDate);
        const rows = exRows.map((e) => ({
          expenseID: e.expenseID,
          date: e.date,
          category: e.category || '—',
          type: e.expenseType || '—',
          amount: formatNgn(e.amountNgn),
          reference: e.reference || '—',
        }));
        return {
          title: 'Expenses report',
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
            { label: 'Expenses in period', value: String(rows.length) },
            { label: 'Total', value: formatNgn(exRows.reduce((s, e) => s + (Number(e.amountNgn) || 0), 0)) },
          ],
        };
      }
      if (name === 'Customer ledger activity') {
        const raw = customerLedgerActivityRows(ledgerEntries, quotations, startDate, endDate);
        const rows = raw.map((r) => ({
          atISO: String(r.atISO || '').replace('T', ' '),
          type: r.type,
          customer: r.customerName || r.customerID,
          quotation: r.quotationRef || '—',
          amount: formatNgn(r.amountNgn),
          method: r.paymentMethod || '—',
          reference: r.bankReference || '—',
        }));
        return {
          title: 'Customer ledger activity',
          columns: [
            { key: 'atISO', label: 'When' },
            { key: 'type', label: 'Type' },
            { key: 'customer', label: 'Customer' },
            { key: 'quotation', label: 'Quotation' },
            { key: 'amount', label: 'Amount' },
            { key: 'method', label: 'Method' },
            { key: 'reference', label: 'Bank ref.' },
          ],
          rows,
          summaryLines: [
            { label: 'Lines in period', value: String(rows.length) },
            {
              label: 'Sum amounts (signed types)',
              value: formatNgn(raw.reduce((s, r) => s + (Number(r.amountNgn) || 0), 0)),
            },
          ],
        };
      }
      if (name === 'Bank reconciliation (period)') {
        const br = filterBankReconciliationInRange(bankReconciliation, startDate, endDate);
        const rows = br.map((r) => ({
          bankDate: r.bankDateISO,
          description: r.description || '—',
          amount: formatNgn(r.amountNgn),
          status: r.status,
          match: r.systemMatch || '—',
        }));
        return {
          title: 'Bank reconciliation (period)',
          columns: [
            { key: 'bankDate', label: 'Bank date' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'match', label: 'System match' },
          ],
          rows,
          summaryLines: [
            { label: 'Lines in period', value: String(rows.length) },
            {
              label: 'In Review status',
              value: String(br.filter((x) => x.status === 'Review').length),
            },
          ],
        };
      }
      if (name === 'Receipt & advance vs treasury') {
        const raw = receiptAdvanceTreasuryReconciliationRows(
          ledgerEntries,
          treasuryMovements,
          startDate,
          endDate
        );
        const rows = raw.map((r) => ({
          section: r.section,
          id: r.ledgerEntryId || r.treasuryMovementId || '—',
          when: String(r.atISO || r.postedAtISO || '').replace('T', ' '),
          customer: r.customerName || '—',
          quote: r.quotationRef || '—',
          ledgerAmt: r.ledgerAmountNgn != null ? formatNgn(r.ledgerAmountNgn) : '—',
          treasuryNet: r.treasuryNetNgn != null ? formatNgn(r.treasuryNetNgn) : formatNgn(r.amountNgn),
          delta: r.deltaNgn != null ? formatNgn(r.deltaNgn) : '—',
          issue: r.issue,
        }));
        return {
          title: 'Receipt & advance vs treasury',
          columns: [
            { key: 'section', label: 'Section' },
            { key: 'id', label: 'Ledger / TM id' },
            { key: 'when', label: 'When' },
            { key: 'customer', label: 'Customer' },
            { key: 'quote', label: 'Quote' },
            { key: 'ledgerAmt', label: 'Ledger ₦' },
            { key: 'treasuryNet', label: 'Treasury net ₦' },
            { key: 'delta', label: 'Delta' },
            { key: 'issue', label: 'Issue' },
          ],
          rows,
          summaryLines: [
            { label: 'Exception rows', value: String(rows.length) },
            { label: 'Note', value: 'Empty list means no mismatches in range (±₦1).' },
          ],
        };
      }
      if (name === 'AR: paid vs ledger check') {
        const disc = quotationPaidNgnLedgerDiscrepancies(quotations, ledgerEntries);
        const rows = disc.map((r) => ({
          quotation: r.quotationID,
          dateISO: r.dateISO,
          customer: r.customer,
          onQuote: formatNgn(r.paidNgnOnQuote),
          fromLedger: formatNgn(r.ledgerAttributedPaidNgn),
          delta: formatNgn(r.deltaNgn),
        }));
        return {
          title: 'AR: paid vs ledger check',
          columns: [
            { key: 'quotation', label: 'Quotation' },
            { key: 'dateISO', label: 'Quote date' },
            { key: 'customer', label: 'Customer' },
            { key: 'onQuote', label: 'Paid on quote' },
            { key: 'fromLedger', label: 'Ledger attributed' },
            { key: 'delta', label: 'Delta' },
          ],
          rows,
          summaryLines: [
            { label: 'Mismatched quotations', value: String(rows.length) },
            { label: 'Note', value: 'Full quotation list; not limited to period.' },
          ],
        };
      }
      if (name === 'GRN / coil receipt register') {
        const grn = grnCoilRegisterRows(coilLots, startDate, endDate);
        const rows = grn.map((r) => ({
          received: r.receivedAtISO,
          coil: r.coilNo,
          po: r.poID,
          supplier: r.supplierName,
          product: r.productID,
          qty: r.qtyReceived,
          landed: r.landedCostNgn !== '' ? formatNgn(r.landedCostNgn) : '—',
        }));
        return {
          title: 'GRN / coil receipt register',
          columns: [
            { key: 'received', label: 'Received' },
            { key: 'coil', label: 'Coil' },
            { key: 'po', label: 'PO' },
            { key: 'supplier', label: 'Supplier' },
            { key: 'product', label: 'Product' },
            { key: 'qty', label: 'Qty / kg' },
            { key: 'landed', label: 'Landed cost' },
          ],
          rows,
          summaryLines: [{ label: 'GRN lines in period', value: String(rows.length) }],
        };
      }
      if (name === 'PO accrual bridge') {
        const brRows = purchaseOrderAccrualBridgeRows(purchaseOrders);
        const rows = brRows.map((r) => ({
          po: r.poID,
          supplier: r.supplierName,
          ordered: formatNgn(r.orderedValueNgn),
          received: formatNgn(r.receivedValueNgn),
          paid: formatNgn(r.supplierPaidNgn),
          recvMinusPaid: formatNgn(r.receivedMinusPaidNgn),
        }));
        return {
          title: 'PO accrual bridge',
          columns: [
            { key: 'po', label: 'PO' },
            { key: 'supplier', label: 'Supplier' },
            { key: 'ordered', label: 'Ordered value' },
            { key: 'received', label: 'Received value' },
            { key: 'paid', label: 'Supplier paid' },
            { key: 'recvMinusPaid', label: 'Received − paid' },
          ],
          rows,
          summaryLines: [{ label: 'Purchase orders', value: String(rows.length) }],
        };
      }
      if (name === 'Inventory valuation & COGS') {
        const val = coilInventoryValuationRows(coilLots);
        const cogs = cogsMovementRows(movements, startDate, endDate);
        const valRows = val.map((r) => ({
          section: 'Valuation',
          colA: r.coilNo,
          colB: String(r.kgOnHand),
          colC: r.unitCostNgnPerKg !== '' ? formatNgn(r.unitCostNgnPerKg) : '—',
          colD: r.extendedValueNgn !== '' ? formatNgn(r.extendedValueNgn) : '—',
        }));
        const cogsRows = cogs.map((r) => ({
          section: 'COGS',
          colA: r.dateISO,
          colB: r.type,
          colC: r.productID || r.ref || '—',
          colD: r.valueNgn !== '' ? formatNgn(r.valueNgn) : '—',
        }));
        return {
          title: 'Inventory valuation & COGS',
          columns: [
            { key: 'section', label: 'Section' },
            { key: 'colA', label: 'Coil / Date' },
            { key: 'colB', label: 'Kg / Type' },
            { key: 'colC', label: 'Unit cost / Ref' },
            { key: 'colD', label: 'Extended / Value' },
          ],
          rows: [...valRows, ...cogsRows],
          summaryLines: [
            { label: 'Open coils valued', value: String(val.length) },
            { label: 'COGS movements in period', value: String(cogs.length) },
          ],
        };
      }
      if (name === 'Accrued expenses (approved unpaid)') {
        const ac = accruedApprovedPayablesRows(paymentRequests, startDate, endDate);
        const rows = ac.map((r) => ({
          request: r.requestID,
          approved: String(r.approvedAtISO || '').slice(0, 10),
          description: r.description,
          accrued: formatNgn(r.accruedUnpaidNgn),
        }));
        return {
          title: 'Accrued expenses (approved unpaid)',
          columns: [
            { key: 'request', label: 'Request' },
            { key: 'approved', label: 'Approved' },
            { key: 'description', label: 'Description' },
            { key: 'accrued', label: 'Unpaid balance' },
          ],
          rows,
          summaryLines: [
            { label: 'Rows', value: String(rows.length) },
            {
              label: 'Total accrued',
              value: formatNgn(ac.reduce((s, r) => s + (Number(r.accruedUnpaidNgn) || 0), 0)),
            },
          ],
        };
      }
      if (name === 'Refunds report') {
        const rfRows = filterRefundsInRange(refunds, startDate, endDate);
        const rows = rfRows.map((r) => ({
          refundID: r.refundID,
          requested: String(r.requestedAtISO || '').slice(0, 10),
          customer: r.customer,
          quote: r.quotationRef,
          status: r.status,
          requestedAmount: formatNgn(r.amountNgn),
          approved: formatNgn(r.approvedAmountNgn),
          paid: formatNgn(r.paidAmountNgn),
        }));
        return {
          title: 'Refunds report',
          columns: [
            { key: 'refundID', label: 'Refund' },
            { key: 'requested', label: 'Requested' },
            { key: 'customer', label: 'Customer' },
            { key: 'quote', label: 'Quotation' },
            { key: 'status', label: 'Status' },
            { key: 'requestedAmount', label: 'Req. amt' },
            { key: 'approved', label: 'Approved' },
            { key: 'paid', label: 'Paid' },
          ],
          rows,
          summaryLines: [
            { label: 'Refund rows (by request date)', value: String(rows.length) },
            {
              label: 'Sum requested',
              value: formatNgn(rfRows.reduce((s, r) => s + (Number(r.amountNgn) || 0), 0)),
            },
          ],
        };
      }
      if (name === 'Financial report') {
        const rows = treasuryMovements.map((m) => ({
          postedAtISO: m.postedAtISO,
          type: m.type,
          account: `${m.accountType} — ${m.accountName}`,
          amount: formatNgn(m.amountNgn),
          reference: m.reference || '—',
        }));
        return {
          title: 'Financial report',
          columns: [
            { key: 'postedAtISO', label: 'Posted' },
            { key: 'type', label: 'Type' },
            { key: 'account', label: 'Account' },
            { key: 'amount', label: 'Amount' },
            { key: 'reference', label: 'Reference' },
          ],
          rows,
          summaryLines: [
            { label: 'Movement lines', value: String(rows.length) },
            { label: 'Expenses (all periods)', value: formatNgn(expenses.reduce((s, e) => s + (e.amountNgn || 0), 0)) },
          ],
        };
      }
      const rows = treasuryMovements.map((m) => ({
        postedAtISO: m.postedAtISO,
        type: m.type,
        account: `${m.accountType} — ${m.accountName}`,
        amount: formatNgn(m.amountNgn),
        reference: m.reference || '—',
      }));
      return {
        title: 'Financial / treasury movements',
        columns: [
          { key: 'postedAtISO', label: 'Posted' },
          { key: 'type', label: 'Type' },
          { key: 'account', label: 'Account' },
          { key: 'amount', label: 'Amount' },
          { key: 'reference', label: 'Reference' },
        ],
        rows,
        summaryLines: [
          { label: 'Movement lines', value: String(rows.length) },
          { label: 'Expenses (all periods)', value: formatNgn(expenses.reduce((s, e) => s + (e.amountNgn || 0), 0)) },
        ],
      };
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
      purchaseOrders,
      quotations,
      refunds,
      salesKpis,
      startDate,
      treasuryMovements,
    ]
  );

  const downloadReport = async (name, fmt) => {
    if (name === 'General ledger — trial balance') {
      if (!ws.hasPermission('finance.view')) {
        showToast('Trial balance requires finance.view.', { variant: 'info' });
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
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        debitNgn: r.debitNgn,
        creditNgn: r.creditNgn,
        netNgn: r.netNgn,
      }));
      if (!rows.length) {
        showToast('No GL accounts returned.', { variant: 'info' });
        return;
      }
      downloadRows(name, rows, fmt);
      showToast(`${name} exported as ${fmt}.`);
      return;
    }

    if (name === 'GL — journal register') {
      if (!ws.hasPermission('finance.view')) {
        showToast('This export requires finance.view.', { variant: 'info' });
        return;
      }
      const { ok, data } = await apiFetch(
        `/api/gl/journals?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load GL journals.', { variant: 'error' });
        return;
      }
      const rows = (data.journals || []).map((j) => ({
        journalId: j.journalId,
        entryDateISO: j.entryDateISO,
        periodKey: j.periodKey,
        memo: j.memo,
        sourceKind: j.sourceKind,
        sourceId: j.sourceId,
        totalDebitNgn: j.totalDebitNgn,
        totalCreditNgn: j.totalCreditNgn,
      }));
      if (!rows.length) {
        showToast('No GL journals in the selected period.', { variant: 'info' });
        return;
      }
      downloadRows(name, rows, fmt);
      showToast(`${name} exported as ${fmt}.`);
      return;
    }

    if (name === 'GL — line detail (all accounts)') {
      if (!ws.hasPermission('finance.view')) {
        showToast('This export requires finance.view.', { variant: 'info' });
        return;
      }
      const { ok, data } = await apiFetch(
        `/api/gl/activity?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load GL activity.', { variant: 'error' });
        return;
      }
      const rows = (data.lines || []).map((l) => ({
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
      if (!rows.length) {
        showToast('No GL lines in the selected period.', { variant: 'info' });
        return;
      }
      downloadRows(name, rows, fmt);
      showToast(`${name} exported as ${fmt}.`);
      return;
    }

    if (name === 'Inventory valuation & COGS' && fmt === 'Excel') {
      const val = coilInventoryValuationRows(coilLots);
      const cogs = cogsMovementRows(movements, startDate, endDate);
      if (!val.length && !cogs.length) {
        showToast('No valuation or COGS rows for export.', { variant: 'info' });
        return;
      }
      const wb = XLSX.utils.book_new();
      if (val.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(val), 'Valuation');
      }
      if (cogs.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cogs), 'COGS');
      }
      XLSX.writeFile(wb, 'inventory-valuation-cogs.xlsx');
      showToast(`${name} exported as Excel (multi-sheet).`);
      return;
    }

    const rows = getExportRows(name);
    if (!rows.length) {
      showToast(
        name === 'Receipt & advance vs treasury'
          ? 'No receipt/treasury exceptions in this period (±₦1).'
          : `No live rows available for ${name.toLowerCase()} in the selected range.`,
        { variant: 'info' }
      );
      return;
    }
    downloadRows(name, rows, fmt);
    showToast(`${name} exported as ${fmt}.`);
  };

  const openPrintSheet = async (name) => {
    if (name === 'General ledger — trial balance') {
      if (!ws.hasPermission('finance.view')) {
        showToast('Trial balance requires finance.view.', { variant: 'info' });
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
        title: 'General ledger — trial balance',
        columns: [
          { key: 'account', label: 'Account' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'net', label: 'Net' },
        ],
        rows,
        summaryLines: [
          { label: 'Period', value: `${data.startDate} → ${data.endDate}` },
          { label: 'Total debit', value: formatNgn(data.totals?.debitNgn ?? 0) },
          { label: 'Total credit', value: formatNgn(data.totals?.creditNgn ?? 0) },
        ],
      });
      setPrintOpen(true);
      return;
    }
    if (name === 'GL — journal register') {
      if (!ws.hasPermission('finance.view')) {
        showToast('This print sheet requires finance.view.', { variant: 'info' });
        return;
      }
      const { ok, data } = await apiFetch(
        `/api/gl/journals?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load GL journals.', { variant: 'error' });
        return;
      }
      const rows = (data.journals || []).map((j) => ({
        date: j.entryDateISO,
        journal: j.journalId,
        memo: j.memo || '—',
        source: [j.sourceKind, j.sourceId].filter(Boolean).join(' ') || '—',
        debit: formatNgn(j.totalDebitNgn),
        credit: formatNgn(j.totalCreditNgn),
      }));
      setPrintPayload({
        title: 'GL — journal register',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'journal', label: 'Journal' },
          { key: 'memo', label: 'Memo' },
          { key: 'source', label: 'Source' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
        ],
        rows,
        summaryLines: [
          { label: 'Period', value: `${data.startDate} → ${data.endDate}` },
          { label: 'Journals', value: String(rows.length) },
        ],
      });
      setPrintOpen(true);
      return;
    }
    if (name === 'GL — line detail (all accounts)') {
      if (!ws.hasPermission('finance.view')) {
        showToast('This print sheet requires finance.view.', { variant: 'info' });
        return;
      }
      const { ok, data } = await apiFetch(
        `/api/gl/activity?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load GL activity.', { variant: 'error' });
        return;
      }
      const rows = (data.lines || []).map((l) => ({
        date: l.entryDateISO,
        account: `${l.accountCode} — ${l.accountName}`,
        debit: formatNgn(l.debitNgn),
        credit: formatNgn(l.creditNgn),
        lineMemo: l.lineMemo || '—',
        journal: l.journalId,
      }));
      setPrintPayload({
        title: 'GL — line detail',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'account', label: 'Account' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'lineMemo', label: 'Line memo' },
          { key: 'journal', label: 'Journal' },
        ],
        rows,
        summaryLines: [
          { label: 'Period', value: `${data.startDate} → ${data.endDate}` },
          { label: 'Lines', value: String(rows.length) },
        ],
      });
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
        eyebrow="Reporting"
        title="Reports"
        subtitle="Period dashboards plus curated exports for P&L, reconciliation, and general-ledger audit. Operational spreadsheets are grouped under “More operational exports”."
      />

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
                Most exports below filter by these dates (see each description). KPI tiles:{' '}
                <span className="font-semibold text-slate-700">order value</span> uses quotation date;{' '}
                <span className="font-semibold text-slate-700">production revenue</span> uses cutting-list dates; cash
                receipts are period cash, not the same as P&amp;L revenue.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Order value (quote date)
                  </p>
                  <p className="text-xl font-black text-[#134e4a] tabular-nums">{formatNgn(salesKpis.totalSales)}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{salesKpis.rowCount} quotations</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Production revenue (est.)
                  </p>
                  <p className="text-xl font-black text-teal-800 tabular-nums">
                    {formatNgn(salesKpis.productionRevenueNgn)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">
                    {salesKpis.cuttingListsInRange} cutting list(s) in range
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
            <h3 className={SUBHDR}>Top customers in range</h3>
            <div className="space-y-2">
              {topCustomers.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">No customer sales in range</p>
              ) : (
                topCustomers.map((row) => (
                  <div key={row.customer} className={LIST_ROW}>
                    <div className="min-w-0">
                      <p className="text-[#134e4a] truncate font-bold">{row.customer}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">
                        {row.quotations} quotation(s)
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
                <p className="text-sm font-black text-[#134e4a] mt-1">{treasuryMovements.length}</p>
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
            Recent GRNs, transfers, adjustments, and finished-goods postings from Operations and Procurement.
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {movementPreview.length === 0 ? (
              <p className="text-sm font-semibold text-slate-400">No movements yet</p>
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
            Use CSV or Excel for working papers; print opens an A4 layout. The main list is limited to audit,
            reconciliation, and P&amp;L-related packs — expand “More” for sales, stock, and procurement listings.
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
                  Sales · AR detail · refunds · stock · PO · GRN
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
