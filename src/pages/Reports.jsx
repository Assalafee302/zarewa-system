import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, FileText, Package, ShoppingCart, Landmark, Printer } from 'lucide-react';
import { PageHeader, PageShell, MainPanel } from '../components/layout';
import { ReportPrintModal } from '../components/reports/ReportPrintModal';
import { formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import {
  deliveryPerformanceSummary,
  filterQuotationsInRange,
  liveReceivablesNgn,
  receivablesAgingBuckets,
  supplierPerformanceSummary,
  topCustomersBySales,
} from '../lib/liveAnalytics';

const REPORTS = [
  {
    id: 'sales',
    title: 'Sales report',
    desc: 'Revenue by period, product, customer, and payment status. Export for management review.',
    icon: ShoppingCart,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'inventory',
    title: 'Inventory report',
    desc: 'Stock on hand, WIP, coil age, low-stock thresholds, and movement history.',
    icon: Package,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'purchase',
    title: 'Purchase report',
    desc: 'Purchase orders, GRN variance, supplier performance, and landed cost.',
    icon: FileText,
    formats: ['Excel', 'CSV'],
  },
  {
    id: 'financial',
    title: 'Financial report',
    desc: 'Treasury movements, cash vs bank context, and linked source references.',
    icon: Landmark,
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
    [snapshot.quotations, ws?.hasWorkspaceData]
  );
  const receipts = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.receipts) ? snapshot.receipts : []),
    [snapshot.receipts, ws?.hasWorkspaceData]
  );
  const expenses = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.expenses) ? snapshot.expenses : []),
    [snapshot.expenses, ws?.hasWorkspaceData]
  );
  const purchaseOrders = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.purchaseOrders) ? snapshot.purchaseOrders : []),
    [snapshot.purchaseOrders, ws?.hasWorkspaceData]
  );
  const deliveries = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.deliveries) ? snapshot.deliveries : []),
    [snapshot.deliveries, ws?.hasWorkspaceData]
  );
  const treasuryMovements = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.treasuryMovements) ? snapshot.treasuryMovements : []),
    [snapshot.treasuryMovements, ws?.hasWorkspaceData]
  );
  const ledgerEntries = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : []),
    [snapshot.ledgerEntries, ws?.hasWorkspaceData]
  );

  const salesKpis = useMemo(() => {
    const quotes = filterQuotationsInRange(quotations, startDate, endDate);
    const totalSales = quotes.reduce((s, q) => s + (q.totalNgn ?? 0), 0);
    const totalPaid = receipts
      .filter((r) => r.dateISO >= startDate && r.dateISO <= endDate)
      .reduce((s, q) => s + (q.amountNgn ?? 0), 0);
    const outstanding = liveReceivablesNgn(quotes, ledgerEntries);
    return { totalSales, totalPaid, outstanding, rowCount: quotes.length };
  }, [endDate, ledgerEntries, quotations, receipts, startDate]);

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
    [endDate, liveProducts, purchaseOrders, quotations, startDate, treasuryMovements]
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
            { label: 'Quotations in range', value: String(rows.length) },
            { label: 'Total quotation value', value: formatNgn(salesKpis.totalSales) },
            { label: 'Payments in range', value: formatNgn(salesKpis.totalPaid) },
            { label: 'Outstanding receivables', value: formatNgn(salesKpis.outstanding) },
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
    [endDate, expenses, liveProducts, purchaseOrders, quotations, salesKpis, startDate, treasuryMovements]
  );

  const downloadReport = (name, fmt) => {
    const rows = getExportRows(name);
    if (!rows.length) {
      showToast(`No live rows available for ${name.toLowerCase()} in the selected range.`, {
        variant: 'info',
      });
      return;
    }
    downloadRows(name, rows, fmt);
    showToast(`${name} exported as ${fmt}.`);
  };

  const openPrintSheet = (name) => {
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
        subtitle="Live operational and financial exports from your workspace — same figures as CSV/Excel downloads, plus print-ready A4 sheets."
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
            <h3 className={SUBHDR}>Sales report parameters</h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Total sales</p>
                  <p className="text-xl font-black text-[#134e4a] tabular-nums">{formatNgn(salesKpis.totalSales)}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{salesKpis.rowCount} quotations</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Payments received
                  </p>
                  <p className="text-xl font-black text-emerald-700 tabular-nums">{formatNgn(salesKpis.totalPaid)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Outstanding</p>
                  <p className="text-xl font-black text-amber-700 tabular-nums">{formatNgn(salesKpis.outstanding)}</p>
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
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Expenses recorded</p>
                <p className="text-sm font-black text-[#134e4a] tabular-nums mt-1">
                  {formatNgn(expenses.reduce((s, e) => s + (e.amountNgn || 0), 0))}
                </p>
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

        <div>
          <h3 className="z-section-title mb-2">Exports &amp; print</h3>
          <p className="text-sm font-medium text-slate-600 mb-6 max-w-2xl leading-relaxed">
            Download CSV or Excel for spreadsheets, or open an A4 print sheet for filing and sign-off.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.id}
                  className="z-soft-panel p-6 sm:p-7 transition-all hover:border-teal-100/80"
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
        </>
        )}
        </div>
      </MainPanel>
    </PageShell>
  );
};

export default Reports;
