import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  PlusCircle,
  FileText,
  Scissors,
  AlertTriangle,
  TrendingUp,
  Receipt,
  PackageCheck,
  Activity,
  BarChart3,
  Banknote,
  Wallet,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Truck,
  Download,
  ChevronRight,
  Settings2,
  HelpCircle,
  Pencil,
  X,
  Trophy,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { PageHeader, PageShell, ModalFrame } from '../components/layout';
import { DashboardKpiStrip } from '../components/dashboard/DashboardKpiStrip';
import WorkspaceShortcuts from '../components/WorkspaceShortcuts';
import {
  formatNgn,
} from '../Data/mockData';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { mergeDashboardPrefs, dashboardPrefsShallowEqual } from '../lib/dashboardPrefs';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';
import {
  buildPriceListSaveBody,
  spotPricesRowsFromMasterData,
} from '../lib/spotPricesFromMasterData';
import {
  liveCashflowMonthly,
  liveMetersSeries,
  liveProductionPulse,
  liveSalesSeriesByMonth,
  liveSalesSeriesByWeek,
  liveStockMix,
  liveTopSalesPerformersByMaterial,
} from '../lib/liveAnalytics';
import { refundOutstandingAmount } from '../lib/refundsStore';

/** Monochrome teal scale — professional, print-safe */
const PIE_COLORS = ['#134e4a', '#1a5c54', '#2d6d66', '#4a8079', '#64748b'];

function attrsForProduct(p) {
  return (
    p.dashboardAttrs ?? {
      gauge: '—',
      colour: '—',
      materialType: p.name,
    }
  );
}

function formatPerformerGauge(row) {
  if (Number(row.gaugeMm) > 0) return `${row.gaugeMm} mm`;
  if (row.gaugeRaw && row.gaugeRaw !== '—') return row.gaugeRaw;
  return '—';
}

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { products: invProducts, movements, wipByProduct, purchaseOrders } = useInventory();
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const currentUserName = ws?.session?.user?.displayName?.split?.(' ')?.[0] || '';
  const [millHelpOpen, setMillHelpOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => mergeDashboardPrefs());
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState([]);
  const [salesTrendGranularity, setSalesTrendGranularity] = useState('month');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const next = mergeDashboardPrefs(ws?.snapshot?.dashboardPrefs);
    setPrefs((prev) => (dashboardPrefsShallowEqual(prev, next) ? prev : next));
  }, [ws?.snapshot?.dashboardPrefs, ws?.refreshEpoch]);

  useEffect(() => {
    if (location.pathname === '/') {
      const next = mergeDashboardPrefs(ws?.snapshot?.dashboardPrefs);
      setPrefs((prev) => (dashboardPrefsShallowEqual(prev, next) ? prev : next));
    }
  }, [location.pathname, location.key, ws?.snapshot?.dashboardPrefs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const spotPriceRows = useMemo(
    () => spotPricesRowsFromMasterData(ws?.snapshot?.masterData),
    [ws?.snapshot?.masterData]
  );
  const canEditSpotPrices = Boolean(ws?.hasPermission?.('settings.view'));

  const openPriceEditor = useCallback(() => {
    setPriceDraft(spotPriceRows.map((r) => ({ ...r })));
    setPriceEditorOpen(true);
  }, [spotPriceRows]);

  const savePrices = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!ws?.canMutate) {
        showToast('Reconnect to save — workspace is read-only.', { variant: 'info' });
        return;
      }
      try {
        for (const row of priceDraft) {
          const body = buildPriceListSaveBody(row.setupRow, {
            unitPriceNgn: row.priceNgn,
            notes: row.note ?? '',
          });
          const { ok, data } = await apiFetch(
            `/api/setup/price-list/${encodeURIComponent(row.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify(body),
            }
          );
          if (!ok || !data?.ok) {
            showToast(data?.error || `Could not update ${row.id}.`, { variant: 'error' });
            return;
          }
        }
        await ws.refresh();
        setPriceEditorOpen(false);
        showToast('Prices saved to setup (master data).');
      } catch (err) {
        showToast(String(err.message || err), { variant: 'error' });
      }
    },
    [priceDraft, showToast, ws]
  );

  const goSalesAction = useCallback(
    (openSalesAction) => {
      navigate('/sales', { state: { openSalesAction } });
    },
    [navigate]
  );

  const goExpenseRequest = useCallback(() => {
    navigate('/accounts', { state: { accountsTab: 'requests' } });
  }, [navigate]);

  const lowStockSkus = useMemo(
    () => invProducts.filter((p) => p.stockLevel < p.lowStockThreshold),
    [invProducts]
  );
  const liveLowStockCount = lowStockSkus.length;
  const quotations = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.quotations)
          ? ws.snapshot.quotations
          : []
        : [],
    [ws]
  );
  const receipts = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.receipts)
          ? ws.snapshot.receipts
          : []
        : [],
    [ws]
  );
  const cuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.cuttingLists)
          ? ws.snapshot.cuttingLists
          : []
        : [],
    [ws]
  );
  const expenses = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.expenses)
          ? ws.snapshot.expenses
          : []
        : [],
    [ws]
  );
  const treasuryMovements = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.treasuryMovements)
          ? ws.snapshot.treasuryMovements
          : []
        : [],
    [ws]
  );
  const paymentRequests = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.paymentRequests)
          ? ws.snapshot.paymentRequests
          : []
        : [],
    [ws]
  );
  const refunds = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.refunds)
          ? ws.snapshot.refunds
          : []
        : [],
    [ws]
  );

  const openPaymentRequestsCount = useMemo(
    () =>
      paymentRequests.filter((x) => {
        const requested = Number(x.amountRequestedNgn) || 0;
        const paid = Number(x.paidAmountNgn) || 0;
        if (x.approvalStatus === 'Rejected') return false;
        if (x.approvalStatus !== 'Approved') return true;
        return paid < requested;
      }).length,
    [paymentRequests]
  );

  const pendingCoilRequests = useMemo(() => {
    const apiList = ws?.snapshot?.coilRequests;
    if (ws?.hasWorkspaceData && Array.isArray(apiList)) {
      return apiList.filter((r) => r.status === 'pending');
    }
    return [];
  }, [ws]);

  const productionJobs = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : [],
    [ws]
  );
  const managerReviewCount = useMemo(
    () => productionJobs.filter((j) => productionJobNeedsManagerReviewAttention(j)).length,
    [productionJobs]
  );

  const transitPoCount = useMemo(
    () => purchaseOrders.filter((p) => ['Approved', 'On loading', 'In Transit'].includes(p.status)).length,
    [purchaseOrders]
  );

  const healthySkus = useMemo(() => {
    return invProducts
      .filter((p) => p.stockLevel >= p.lowStockThreshold)
      .sort((a, b) => b.stockLevel - a.stockLevel)
      .slice(0, 2);
  }, [invProducts]);

  const metersSeries = useMemo(() => liveMetersSeries(cuttingLists, 6), [cuttingLists]);
  const metersCurrent = metersSeries[metersSeries.length - 1];
  const metersPrev = metersSeries[metersSeries.length - 2];
  const metersDeltaPct = useMemo(() => {
    if (!metersPrev?.meters) return null;
    return ((metersCurrent.meters - metersPrev.meters) / metersPrev.meters) * 100;
  }, [metersCurrent, metersPrev]);

  const salesByMonth = useMemo(() => liveSalesSeriesByMonth(quotations, 6), [quotations]);
  const stockMix = useMemo(() => liveStockMix(invProducts), [invProducts]);
  const cashflowMonthly = useMemo(
    () => liveCashflowMonthly(receipts, expenses, 6, treasuryMovements),
    [expenses, receipts, treasuryMovements]
  );

  const dashboardAlerts = useMemo(() => {
    const pendingRefundPayouts = refunds.filter((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0);
    return [
      {
        id: 'stock',
        type: 'Inventory',
        title: liveLowStockCount > 0 ? `${liveLowStockCount} SKU(s) below minimum` : 'Stock levels healthy',
        detail:
          liveLowStockCount > 0
            ? 'Open Operations to replenish or adjust low-stock lines.'
            : 'No low-stock SKU currently needs attention.',
        hint: 'Open Store & production — stock records, GRN, and adjustments.',
        severity: liveLowStockCount > 0 ? 'danger' : 'info',
        path: '/operations',
      },
      {
        id: 'coil',
        type: 'Coil requests',
        title:
          pendingCoilRequests.length > 0
            ? `${pendingCoilRequests.length} coil request(s) pending`
            : 'No pending coil requests',
        detail:
          pendingCoilRequests.length > 0
            ? 'Store or management acknowledgement still needed.'
            : 'No coil requests waiting on acknowledgement.',
        hint: 'Open Operations · Stock & coil requests.',
        severity: pendingCoilRequests.length > 0 ? 'warning' : 'info',
        path: '/operations',
        state: { focusOpsTab: 'inventory' },
      },
      {
        id: 'procurement',
        type: 'Procurement',
        title:
          transitPoCount > 0
            ? `${transitPoCount} PO(s) approved or in transit`
            : 'No POs awaiting receipt',
        detail:
          transitPoCount > 0
            ? 'Approved, on loading, or in transit — follow up before GRN.'
            : 'Nothing in the approved / transit pipeline right now.',
        hint: 'Open Procurement to track purchase orders and transport.',
        severity: transitPoCount > 0 ? 'warning' : 'info',
        path: '/procurement',
      },
      {
        id: 'conversion',
        type: 'Production',
        title:
          managerReviewCount > 0
            ? `${managerReviewCount} job(s) need manager review`
            : 'No conversion escalations',
        detail:
          managerReviewCount > 0
            ? 'Yield or reference variance flagged for sign-off.'
            : 'No production jobs are waiting on manager review.',
        hint: 'Open Operations · Production for traceability and sign-off.',
        severity: managerReviewCount > 0 ? 'warning' : 'info',
        path: '/operations',
        state: { focusOpsTab: 'production' },
      },
      {
        id: 'requests',
        type: 'Approvals',
        title: `${openPaymentRequestsCount} payment request(s) open`,
        detail: 'Finance approvals and treasury payouts still waiting for action.',
        hint: 'Open Finance on the Payment requests tab.',
        severity: openPaymentRequestsCount > 0 ? 'warning' : 'info',
        path: '/accounts',
        state: { accountsTab: 'requests' },
      },
      {
        id: 'refunds',
        type: 'Refunds',
        title: `${pendingRefundPayouts.length} refund payout(s) pending`,
        detail: 'Approved customer refunds that still need treasury payout.',
        hint: 'Open Finance on Treasury to record customer refund payouts.',
        severity: pendingRefundPayouts.length > 0 ? 'warning' : 'info',
        path: '/accounts',
        state: { accountsTab: 'treasury' },
      },
    ];
  }, [
    liveLowStockCount,
    managerReviewCount,
    openPaymentRequestsCount,
    pendingCoilRequests,
    refunds,
    transitPoCount,
  ]);

  const salesTrendData = useMemo(
    () =>
      salesTrendGranularity === 'week'
        ? liveSalesSeriesByWeek(quotations, 8)
        : salesByMonth,
    [quotations, salesByMonth, salesTrendGranularity]
  );

  const pulse = useMemo(
    () => liveProductionPulse(cuttingLists, movements, wipByProduct, pendingCoilRequests),
    [cuttingLists, movements, pendingCoilRequests, wipByProduct]
  );

  const productionMetrics = ws?.snapshot?.productionMetrics;

  const topCoilsRows = useMemo(
    () => liveTopSalesPerformersByMaterial(cuttingLists, quotations, { limit: 5 }),
    [cuttingLists, quotations]
  );

  return (
    <PageShell blurred={priceEditorOpen}>
      <PageHeader
        eyebrow="Operations"
        title="Operations dashboard"
        subtitle={
          currentUserName
            ? `${currentUserName}, here is the live sales, treasury, production, and inventory picture for today.`
            : 'Live sales, treasury, production, and inventory control in one view'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:max-w-md">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="z-btn-secondary gap-2"
              title="Customize visible tiles (saved in this browser)"
            >
              <Settings2 size={16} /> Preferences
            </button>
          </div>
        }
      />

      <WorkspaceShortcuts />

      <DashboardKpiStrip />

      {pendingCoilRequests.length > 0 ? (
        <section className="mb-8 rounded-xl border border-amber-200/80 bg-amber-50/40 shadow-sm overflow-hidden">
          <div className="h-1 bg-amber-500" aria-hidden />
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-900/80">
                  Store — coil requests
                </p>
                <h2 className="text-base font-bold text-slate-900 mt-1">
                  Pending for MD / procurement ({pendingCoilRequests.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-wide hover:underline shrink-0"
              >
                Open store
              </button>
            </div>
            <ul className="divide-y divide-amber-200/50 rounded-lg border border-amber-200/60 bg-white">
              {pendingCoilRequests.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                >
                  <div className="min-w-0 text-[11px]">
                    <p className="font-semibold text-slate-900">
                      {r.gauge || '—'} mm · {r.colour || '—'} · {r.materialType || '—'}
                    </p>
                    <p className="text-slate-600 mt-1">
                      {r.requestedKg ? `${r.requestedKg} kg (approx.)` : 'Qty not specified'}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1 font-mono">{r.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!ws?.canMutate) {
                        showToast('Reconnect to acknowledge — workspace is read-only.', { variant: 'info' });
                        return;
                      }
                      await apiFetch(`/api/coil-requests/${encodeURIComponent(r.id)}/acknowledge`, {
                        method: 'PATCH',
                      });
                      await ws.refresh();
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase text-slate-700 hover:bg-slate-50"
                  >
                    Acknowledge
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="mb-8 rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="h-1 bg-[#134e4a]" aria-hidden />
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="min-w-0 max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Spot price list
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-1 tracking-tight">
                ₦ per metre — yard gate pricing
              </h2>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Pulled from Setup → master data (price list, per-metre lines). Edits require Settings access and update
                the database for everyone.
              </p>
            </div>
            <button
              type="button"
              onClick={openPriceEditor}
              disabled={!canEditSpotPrices || spotPriceRows.length === 0}
              title={
                !canEditSpotPrices
                  ? 'You need Settings permission to edit master prices.'
                  : spotPriceRows.length === 0
                    ? 'Add active per-metre rows in Setup → master data → price list.'
                    : 'Edit prices'
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#134e4a] shadow-sm hover:bg-slate-50 transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Pencil size={15} />
              Update prices
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-0 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
            {spotPriceRows.length === 0 ? (
              <p className="text-sm text-slate-500 col-span-full py-4">
                No per-metre price list in workspace — open Settings → master data, or your role may not include master
                data.
              </p>
            ) : (
              spotPriceRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_auto] gap-x-4 items-center border-b border-slate-100 py-2.5 min-h-[3rem]"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-800">{row.gaugeLabel}</span>
                    <span className="text-[10px] text-slate-500 ml-2">{row.productType}</span>
                    {row.note ? (
                      <span className="block text-[9px] text-slate-400 mt-0.5">{row.note}</span>
                    ) : null}
                  </div>
                  <span className="text-sm font-bold text-[#134e4a] tabular-nums text-right whitespace-nowrap">
                    ₦{row.priceNgn.toLocaleString()}/m
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {prefs.showAlertBanner ? (
        <section
          className="mb-8 rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm"
          aria-label="Operational alerts"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-xs font-semibold text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle size={14} className="text-slate-500" />
              Alerts & reminders
            </h3>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
              {ws?.apiOnline
                ? 'Live operational feed'
                : ws?.usingCachedData
                  ? 'Cached feed — reconnect for live updates'
                  : 'Connect API for live feed'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {dashboardAlerts.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.hint}
                onClick={() => navigate(a.path, { state: a.state ?? {} })}
                className={`text-left p-4 rounded-xl border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20 ${
                  a.severity === 'danger'
                    ? 'border-l-4 border-l-rose-600'
                    : a.severity === 'warning'
                      ? 'border-l-4 border-l-amber-500'
                      : 'border-l-4 border-l-slate-300'
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  {a.type}
                </p>
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">{a.detail}</p>
                <p className="text-[10px] font-semibold text-slate-500 mt-3 flex items-center gap-1">
                  Take action <ChevronRight size={12} />
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-6">
          <div className="z-card-muted">
            <h3 className="z-section-title flex items-center gap-2">
              <Zap size={14} className="text-[#134e4a] shrink-0" />
              Quick actions
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => goSalesAction('quotation')}
                className="flex items-center gap-3 bg-[#134e4a] text-white p-4 rounded-xl shadow-sm hover:brightness-[1.03] transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/40 focus-visible:ring-offset-2"
              >
                <PlusCircle
                  size={18}
                  className="text-white/90 group-hover:rotate-90 transition-transform shrink-0"
                />
                <span className="font-bold text-[11px] uppercase tracking-wider">New quote</span>
              </button>
              <button
                type="button"
                onClick={() => goSalesAction('receipt')}
                className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
              >
                <FileText size={18} className="text-slate-500 shrink-0" />
                <span className="font-bold text-[11px] uppercase text-left">New receipt</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/procurement')}
                className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
              >
                <Banknote size={18} className="text-slate-500 shrink-0" />
                <span className="font-bold text-[11px] uppercase text-left">New purchase</span>
              </button>
              <button
                type="button"
                onClick={() => goSalesAction('cutting')}
                className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
              >
                <Scissors size={18} className="text-slate-500 shrink-0" />
                <span className="font-bold text-[11px] uppercase text-left">Cutting list</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
              >
                <Wallet size={18} className="text-slate-500 shrink-0" />
                <span className="font-bold text-[11px] uppercase text-left">Stock / WIP review</span>
              </button>
              <button
                type="button"
                onClick={goExpenseRequest}
                className="flex items-center gap-3 bg-gray-50 text-[#134e4a] p-4 rounded-xl border border-slate-200 hover:bg-white hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2"
              >
                <Receipt size={18} className="text-slate-500 shrink-0" />
                <span className="font-bold text-[11px] uppercase text-left">Expense request</span>
              </button>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-slate-200/90 bg-slate-50/80">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                Market note
              </p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              HRC &amp; scrap spreads are volatile. Hold coil disposals until weighbridge confirms net weight vs
              invoice.
            </p>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-8">
          <section className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-200/90 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.04] pointer-events-none text-[#134e4a]">
              <BarChart3 size={120} />
            </div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-3 text-[#134e4a]">
                <Activity size={20} strokeWidth={2} />
                <h3 className="text-base font-bold uppercase tracking-wide text-slate-900">
                  Production pulse
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-slate-200 tabular-nums">
                <TrendingUp size={14} className="text-slate-500" />
                {metersDeltaPct == null ? 'Fresh baseline' : `${metersDeltaPct >= 0 ? '+' : ''}${metersDeltaPct.toFixed(1)}% vs prior month`}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => navigate('/sales')}
                title="Sales / dispatch context"
                className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 text-left hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
              >
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Meters sold (7 days)
                </p>
                <p className="text-3xl font-bold tracking-tight text-[#134e4a] tabular-nums">
                  {pulse.metersSold7d.toLocaleString()}
                  <span className="text-lg font-semibold text-slate-500 ml-1">m</span>
                </p>
                <p className="text-[9px] text-slate-500 mt-2">From cutting lists recorded in the last 7 days.</p>
              </button>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                title="Meters corrugated at the mill — line output before full dispatch"
                className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 text-left hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
              >
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                  Mill output (7 days)
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMillHelpOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setMillHelpOpen(true);
                      }
                    }}
                    className="inline-flex rounded-full p-0.5 text-slate-400 hover:text-[#134e4a] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/30 cursor-pointer"
                    aria-label="What is mill output?"
                    title="Explain this metric"
                  >
                    <HelpCircle size={14} />
                  </span>
                </p>
                <p className="text-3xl font-bold tracking-tight text-[#134e4a] tabular-nums">
                  {pulse.millOutput7d.toLocaleString()}
                  <span className="text-lg font-semibold text-slate-500 ml-1">m</span>
                </p>
                <p className="text-[9px] text-slate-500 mt-2 leading-snug">
                  Corrugated off the line; may differ from sold while WIP is in yard.
                </p>
              </button>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                title="Production queue"
                className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 text-left hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
              >
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Active jobs
                </p>
                <p className="text-3xl font-bold tracking-tight text-[#134e4a] tabular-nums">
                  {pulse.activeJobs}
                </p>
                <p className="text-[9px] text-slate-500 mt-2">Derived from WIP balances and open coil requests.</p>
              </button>
            </div>
            {productionMetrics && productionMetrics.jobCount > 0 ? (
              <p className="text-[10px] text-slate-600 mt-5 pt-4 border-t border-slate-100 leading-relaxed">
                <span className="font-semibold text-slate-800">Production job rollup</span> (current workspace):{' '}
                {productionMetrics.jobCount} job(s) · planned{' '}
                {Math.round(Number(productionMetrics.totalPlannedMeters) || 0).toLocaleString()} m · actual recorded{' '}
                {Math.round(Number(productionMetrics.totalActualMeters) || 0).toLocaleString()} m · completed actual{' '}
                {Math.round(Number(productionMetrics.completedActualMeters) || 0).toLocaleString()} m
              </p>
            ) : null}
          </section>

          <section className="bg-white p-6 md:p-8 rounded-xl border border-slate-200/90 shadow-sm">
            <div className="flex flex-col gap-4 mb-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#134e4a]">
                    <Trophy size={20} strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                      Top 5 performers (sales)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                      By <span className="font-medium text-slate-600">colour</span>,{' '}
                      <span className="font-medium text-slate-600">gauge</span>, and{' '}
                      <span className="font-medium text-slate-600">profile</span>
                      {' '}
                      — from cutting lists this month, with revenue from linked quotations (each quote counted once
                      per material mix).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/sales')}
                  className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-wide hover:underline shrink-0 self-start sm:self-auto"
                >
                  Sales detail
                </button>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 w-full sm:w-auto">
                <span className="px-2.5 sm:px-3 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide bg-white text-[#134e4a] shadow-sm border border-slate-200/80">
                  This month (MTD)
                </span>
              </div>
            </div>

            <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,10.5rem)_minmax(0,7rem)] gap-x-3 gap-y-1 px-3 py-2 border-b border-slate-200 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="text-center">#</span>
              <span>Colour</span>
              <span>Gauge</span>
              <span>Material</span>
              <span className="text-right tabular-nums">
                <span className="inline-flex flex-wrap justify-end gap-x-2 gap-y-0">
                  <span>Meters</span>
                  <span className="text-slate-300 font-normal">·</span>
                  <span>kg</span>
                </span>
              </span>
              <span className="text-right tabular-nums">Revenue</span>
            </div>

            {topCoilsRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center border-t border-slate-100">
                No cutting lists in the current month yet — rankings will appear as sales are recorded.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topCoilsRows.map((row) => (
                  <li key={`${row.rank}-${row.colour}-${row.gaugeRaw}-${row.materialType}`}>
                    <button
                      type="button"
                      onClick={() => navigate('/sales')}
                      className="w-full text-left py-3 px-2 sm:px-3 rounded-lg hover:bg-slate-50/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/15"
                    >
                      <div className="sm:hidden space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#134e4a] text-[10px] font-bold text-white tabular-nums shrink-0">
                            {row.rank}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 tabular-nums">
                            {formatPerformerGauge(row)} · {row.colour}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 pl-9">{row.materialType}</p>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-9 text-[11px] tabular-nums">
                          <span className="text-slate-500">
                            {row.metersSold.toLocaleString()} m · ~{row.weightKg.toLocaleString()} kg
                          </span>
                          <span className="font-semibold text-[#134e4a]">{formatNgn(row.revenueNgn)}</span>
                        </div>
                      </div>
                      <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,10.5rem)_minmax(0,7rem)] gap-x-3 items-center">
                        <span className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-[#134e4a] tabular-nums">
                          {row.rank}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{row.colour}</span>
                        <span className="text-sm font-semibold text-slate-800 tabular-nums">
                          {formatPerformerGauge(row)}
                        </span>
                        <span className="text-[12px] text-slate-600 truncate pr-1">{row.materialType}</span>
                        <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0 text-sm font-semibold text-slate-800 tabular-nums text-right">
                          <span>{row.metersSold.toLocaleString()} m</span>
                          <span className="text-slate-300 font-normal">·</span>
                          <span className="text-slate-500 font-medium">~{row.weightKg.toLocaleString()} kg</span>
                        </span>
                        <span className="text-sm font-semibold text-[#134e4a] tabular-nums text-right">
                          {formatNgn(row.revenueNgn)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {prefs.showCharts ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <section className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 text-slate-800">
                    <LineChartIcon size={18} className="text-[#134e4a]" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                      Sales trend
                    </h3>
                  </div>
                  <div
                    className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50"
                    role="group"
                    aria-label="Sales trend granularity"
                  >
                    <button
                      type="button"
                      onClick={() => setSalesTrendGranularity('week')}
                      className={`px-3 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all ${
                        salesTrendGranularity === 'week'
                          ? 'bg-[#134e4a] text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      By week
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalesTrendGranularity('month')}
                      className={`px-3 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all ${
                        salesTrendGranularity === 'month'
                          ? 'bg-[#134e4a] text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      By month
                    </button>
                  </div>
                </div>
                <div className="h-64 w-full" title="Hover points for exact amounts">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesTrendData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`}
                        width={40}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [formatNgn(value), 'Revenue']}
                        labelFormatter={(l) => l}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="amountNgn"
                        stroke="#134e4a"
                        strokeWidth={2}
                        dot={{ fill: '#134e4a', r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: '#134e4a' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-800">
                  <PieChartIcon size={18} className="text-[#134e4a]" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                    Stock mix (shape of yard)
                  </h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stockMix}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {stockMix.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [`${v}`, name]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-sm xl:col-span-2">
                <div className="flex items-center gap-2 mb-4 text-slate-800">
                  <BarChart3 size={18} className="text-[#134e4a]" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                    Income vs expense (NGN millions)
                  </h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={cashflowMonthly}
                      margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => `₦${v}M`}
                        width={44}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(v) => [`₦${v}M`, '']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                      <Bar dataKey="income" fill="#134e4a" name="Income" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" fill="#cbd5e1" name="Expense" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200/90">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-6">
                Inventory health (gauge · material · colour)
              </h3>
              <div className="space-y-4">
                {healthySkus.length === 0 ? (
                  <p className="text-xs text-gray-500">No SKUs above threshold.</p>
                ) : (
                  healthySkus.map((p) => {
                    const a = attrsForProduct(p);
                    return (
                      <button
                        key={p.productID}
                        type="button"
                        onClick={() => navigate('/operations')}
                        title="View stock record"
                        className="w-full grid grid-cols-[1fr_auto] gap-x-4 items-center p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:border-slate-300 transition-colors text-left"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <PackageCheck className="text-slate-500 shrink-0 mt-0.5" size={18} />
                          <div>
                            <p className="text-xs font-semibold text-slate-900">
                              <span className="tabular-nums">{a.gauge}</span> mm · {a.materialType}
                            </p>
                            <p className="text-[10px] font-medium text-slate-500 mt-0.5">{a.colour}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-[#134e4a] tabular-nums text-right shrink-0">
                          {p.stockLevel.toLocaleString()} {p.unit}
                        </span>
                      </button>
                    );
                  })
                )}
                {lowStockSkus.length > 0 ? (
                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-3 tracking-widest flex items-center gap-2">
                      <AlertTriangle size={12} className="text-slate-400" /> Below reorder
                    </h4>
                    <ul className="space-y-2">
                      {lowStockSkus.map((p) => {
                        const a = attrsForProduct(p);
                        return (
                          <li
                            key={p.productID}
                            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center rounded-xl border-y border-r border-slate-200 border-l-[3px] border-l-rose-600 bg-white px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-900">
                                <span className="tabular-nums">{a.gauge}</span> mm · {a.materialType}
                              </p>
                              <p className="text-[10px] font-medium text-slate-500">{a.colour}</p>
                            </div>
                            <p className="text-[10px] font-bold text-slate-800 tabular-nums text-right whitespace-nowrap">
                              {p.stockLevel.toLocaleString()} {p.unit}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </div>

      {prefs.showReportsStrip ? (
        <section className="z-soft-panel mt-10 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-xs font-black text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
              <Download size={16} />
              Reports & exports
            </h3>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-wider hover:underline"
              title="Full reports library"
            >
              Open reports
            </button>
          </div>
          <p className="text-xs text-gray-500 max-w-2xl mb-4">
            Download sales, inventory, purchase, and financial statements as PDF, Excel, or CSV when the export
            service is connected.
          </p>
          <div className="flex flex-wrap gap-3">
            {['Sales summary', 'Inventory valuation', 'Purchase history', 'P&L snapshot'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate('/reports')}
                className="z-btn-secondary text-[10px] uppercase tracking-wide"
                title="Configure export in Reports"
              >
                <Truck size={14} className="opacity-70" /> {label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ModalFrame isOpen={priceEditorOpen} onClose={() => setPriceEditorOpen(false)}>
        <div className="z-modal-panel max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 shrink-0">
            <h3 className="text-lg font-black text-[#134e4a]">Update spot prices — master data (₦/m)</h3>
            <button
              type="button"
              onClick={() => setPriceEditorOpen(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>
          <form onSubmit={savePrices} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto px-6 py-4 custom-scrollbar flex-1">
              <p className="text-[11px] text-gray-500 mb-4">
                Adjust ₦ per metre. Saving updates the server price list (visible to all users after refresh).
              </p>
              <div className="space-y-3">
                {priceDraft.map((row, idx) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end rounded-xl border border-gray-100 bg-gray-50/50 p-3"
                  >
                    <div className="sm:col-span-4">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Gauge</label>
                      <p className="text-sm font-bold text-[#134e4a]">{row.gaugeLabel}</p>
                      <p className="text-[10px] text-gray-500">{row.productType}</p>
                    </div>
                    <div className="sm:col-span-5">
                      <label
                        htmlFor={`note-${row.id}`}
                        className="text-[9px] font-bold text-gray-400 uppercase block mb-1"
                      >
                        Note
                      </label>
                      <input
                        id={`note-${row.id}`}
                        value={row.note ?? ''}
                        onChange={(e) =>
                          setPriceDraft((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r))
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white py-2 px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`price-${row.id}`}
                        className="text-[9px] font-bold text-gray-400 uppercase block mb-1"
                      >
                        ₦ / m
                      </label>
                      <input
                        id={`price-${row.id}`}
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={row.priceNgn}
                        onChange={(e) =>
                          setPriceDraft((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, priceNgn: Number(e.target.value) || 0 } : r
                            )
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white py-2 px-3 text-sm font-black text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/15 tabular-nums"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-6 py-4 shrink-0 bg-white">
              <button type="submit" className="z-btn-primary flex-1 justify-center">
                Save prices
              </button>
              <button
                type="button"
                className="z-btn-secondary flex-1 justify-center"
                onClick={() => setPriceEditorOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={millHelpOpen} onClose={() => setMillHelpOpen(false)}>
        <div className="z-modal-panel max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h3 className="text-base font-black text-[#134e4a]">Mill output (7 days)</h3>
          <div className="mt-4 space-y-3 text-[13px] text-slate-600 leading-relaxed">
            <p>
              This number is the total <span className="font-semibold text-slate-800">metres of finished roofing</span>{' '}
              recorded from production in the last seven days. It comes from{' '}
              <span className="font-semibold text-slate-800">stock movements</span> of type finished-goods receipt
              (corrugated off the line into sellable SKU).
            </p>
            <p>
              <span className="font-semibold text-slate-800">Meters sold (7 days)</span> is driven by cutting lists
              registered in that window — so mill output can be higher than sold while WIP sits in the yard, or lower
              if you are dispatching older stock.
            </p>
            <p className="text-[11px] text-slate-500">
              For detail, open <span className="font-semibold">Production</span> and use production traceability /
              finished-goods postings.
            </p>
          </div>
          <button
            type="button"
            className="mt-6 w-full z-btn-primary justify-center"
            onClick={() => setMillHelpOpen(false)}
          >
            Got it
          </button>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Dashboard;
