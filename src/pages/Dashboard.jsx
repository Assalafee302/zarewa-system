import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Landmark,
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
import {
  formatNgn,
} from '../Data/mockData';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { loadDashboardPrefs } from '../lib/dashboardPrefs';
import { loadSpotPrices, saveSpotPrices } from '../lib/dashboardSpotPrices';
import {
  liveCashflowMonthly,
  liveLiquidityBreakdown,
  liveMetersSeries,
  liveProductionPulse,
  liveSalesSeriesByMonth,
  liveSalesSeriesByWeek,
  liveStockMix,
  totalLiquidityNgn,
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

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Align period chips: `2026-03` → `Mar ’26` */
function shortPeriodLabel(isoKey) {
  const parts = String(isoKey).split('-');
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  if (y && m >= 1 && m <= 12) return `${MONTH_SHORT[m - 1]} ’${y.slice(-2)}`;
  return isoKey;
}

function KpiCard({ title, value, sub, onClick, titleAttr, highlight, children }) {
  const accent =
    highlight === 'danger'
      ? 'border-l-4 border-l-rose-600'
      : highlight === 'success'
        ? 'border-l-4 border-l-[#134e4a]'
        : 'border-l-4 border-l-transparent';
  return (
    <button
      type="button"
      onClick={onClick}
      title={titleAttr ?? title}
      className={`z-kpi-card text-left h-full min-h-[8.5rem] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20 focus-visible:ring-offset-2 w-full flex flex-col ${accent}`}
    >
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-2xl font-bold text-[#134e4a] tracking-tight tabular-nums leading-tight">
        {value}
      </p>
      {children ? <div className="mt-3 flex-1 min-h-0">{children}</div> : null}
      {sub ? (
        <p
          className={`text-[10px] font-medium text-slate-500 mt-3 flex items-center gap-1 tabular-nums ${children ? 'border-t border-slate-100 pt-3' : 'pt-1'}`}
        >
          {sub}
          <ChevronRight size={12} className="opacity-40 shrink-0 text-slate-400" />
        </p>
      ) : null}
    </button>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { products: invProducts, movements, wipByProduct, coilLots } = useInventory();
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const currentUserName = ws?.session?.user?.displayName?.split?.(' ')?.[0] || '';
  const [millHelpOpen, setMillHelpOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadDashboardPrefs);
  const [spotPrices, setSpotPrices] = useState(() => loadSpotPrices());
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState(() => loadSpotPrices());
  const [salesTrendGranularity, setSalesTrendGranularity] = useState('month');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (location.pathname === '/') setPrefs(loadDashboardPrefs());
  }, [location.pathname, location.key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openPriceEditor = useCallback(() => {
    setPriceDraft(loadSpotPrices());
    setPriceEditorOpen(true);
  }, []);

  const savePrices = useCallback(
    (e) => {
      e?.preventDefault?.();
      saveSpotPrices(priceDraft);
      setSpotPrices(loadSpotPrices());
      setPriceEditorOpen(false);
    },
    [priceDraft]
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
  const treasuryAccounts = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.treasuryAccounts)
          ? ws.snapshot.treasuryAccounts
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

  const liquidityBreakdown = useMemo(() => liveLiquidityBreakdown(treasuryAccounts), [treasuryAccounts]);
  const liquidityTotal = useMemo(() => totalLiquidityNgn(treasuryAccounts), [treasuryAccounts]);
  const salesByMonth = useMemo(() => liveSalesSeriesByMonth(quotations, 6), [quotations]);
  const salesMonthRevenue = salesByMonth[salesByMonth.length - 1]?.amountNgn || 0;
  const stockMix = useMemo(() => liveStockMix(invProducts), [invProducts]);
  const cashflowMonthly = useMemo(
    () => liveCashflowMonthly(receipts, expenses, 6, treasuryMovements),
    [expenses, receipts, treasuryMovements]
  );

  const stockAlerts = useMemo(() => {
    return lowStockSkus.slice(0, 6).map((p) => {
      const a = attrsForProduct(p);
      return {
        id: p.productID,
        gauge: a.gauge,
        colour: a.colour,
        materialType: a.materialType,
        status: p.stockLevel <= 0 ? 'Critical' : 'Low',
        qty: `${p.stockLevel.toLocaleString()} ${p.unit}`,
      };
    });
  }, [lowStockSkus]);

  const dashboardAlerts = useMemo(() => {
    return [
      {
        id: 'stock',
        type: 'Inventory',
        title: liveLowStockCount > 0 ? `${liveLowStockCount} SKU(s) below minimum` : 'Stock levels healthy',
        detail:
          liveLowStockCount > 0
            ? 'Open Operations to replenish or adjust low-stock lines.'
            : 'No low-stock SKU currently needs attention.',
        severity: liveLowStockCount > 0 ? 'danger' : 'info',
        path: '/operations',
      },
      {
        id: 'requests',
        type: 'Approvals',
        title: `${
          paymentRequests.filter((x) => {
            const requested = Number(x.amountRequestedNgn) || 0;
            const paid = Number(x.paidAmountNgn) || 0;
            if (x.approvalStatus === 'Rejected') return false;
            if (x.approvalStatus !== 'Approved') return true;
            return paid < requested;
          }).length
        } payment request(s) open`,
        detail: 'Finance approvals and treasury payouts still waiting for action.',
        severity: paymentRequests.some((x) => {
          const requested = Number(x.amountRequestedNgn) || 0;
          const paid = Number(x.paidAmountNgn) || 0;
          if (x.approvalStatus === 'Rejected') return false;
          if (x.approvalStatus !== 'Approved') return true;
          return paid < requested;
        })
          ? 'warning'
          : 'info',
        path: '/accounts',
        state: { accountsTab: 'requests' },
      },
      {
        id: 'refunds',
        type: 'Refunds',
        title: `${refunds.filter((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0).length} refund payout(s) pending`,
        detail: 'Approved customer refunds that still need treasury payout.',
        severity: refunds.some((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0) ? 'warning' : 'info',
        path: '/accounts',
        state: { accountsTab: 'treasury' },
      },
    ];
  }, [liveLowStockCount, paymentRequests, refunds]);

  const pendingCoilRequests = useMemo(() => {
    const apiList = ws?.snapshot?.coilRequests;
    if (ws?.hasWorkspaceData && Array.isArray(apiList)) {
      return apiList.filter((r) => r.status === 'pending');
    }
    return [];
  }, [ws]);

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

  const topCoilsRows = useMemo(() => {
    return [...invProducts]
      .filter((p) => Number(p.stockLevel) > 0)
      .sort((a, b) => (Number(b.stockLevel) || 0) - (Number(a.stockLevel) || 0))
      .slice(0, 5)
      .map((p, i) => {
        const a = attrsForProduct(p);
        const gaugeMm = Number(String(a.gauge || '').match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
        const relatedLots = coilLots.filter((lot) => lot.productID === p.productID);
        const weightKg = relatedLots.reduce((s, lot) => s + (Number(lot.weightKg) || Number(lot.qtyReceived) || 0), 0);
        return {
          rank: i + 1,
          colour: a.colour || '—',
          gaugeMm,
          materialType: a.materialType || p.name,
          metersSold: 0,
          weightKg: weightKg || Number(p.stockLevel) || 0,
          revenueNgn: 0,
        };
      });
  }, [coilLots, invProducts]);

  return (
    <PageShell blurred={priceEditorOpen}>
      <PageHeader
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

      <section className="mb-8">
        <h2 className="sr-only">Key performance indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Meters sold (this month)"
            value={`${metersCurrent.meters.toLocaleString()} m`}
            sub={
              metersDeltaPct == null
                ? metersCurrent.label
                : `${metersDeltaPct >= 0 ? '+' : ''}${metersDeltaPct.toFixed(1)}% vs ${metersPrev?.label ?? 'prior month'}`
            }
            titleAttr="Recent metres from cutting lists."
            onClick={() => navigate('/operations')}
            highlight={metersDeltaPct != null && metersDeltaPct < 0 ? 'danger' : 'success'}
          >
            <div className="grid grid-cols-3 gap-x-3 gap-y-3">
              {metersSeries.slice(-4, -1).map((m) => (
                <div
                  key={m.key}
                  className="min-w-0 border-b border-slate-100 pb-2 last:border-0 sm:border-0 sm:pb-0"
                  title={`${m.label}: ${m.meters.toLocaleString()} m`}
                >
                  <p className="text-[9px] font-semibold text-slate-500 truncate">
                    {shortPeriodLabel(m.key)}
                  </p>
                  <p className="text-[12px] font-bold text-[#134e4a] tabular-nums text-right sm:text-left">
                    {(m.meters / 1000).toFixed(0)}
                    <span className="text-[9px] font-semibold text-slate-400 ml-0.5">k m</span>
                  </p>
                </div>
              ))}
            </div>
          </KpiCard>

          <KpiCard
            title="Sales revenue (MTD)"
            value={formatNgn(salesMonthRevenue)}
            sub="Quotations & receipts"
            titleAttr="Month-to-date quotation value from live records."
            onClick={() => navigate('/sales')}
          />

          <button
            type="button"
            onClick={() => navigate('/accounts')}
            title="Open Finance for treasury detail"
            className="z-kpi-card text-left h-full min-h-[8.5rem] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20 focus-visible:ring-offset-2 flex flex-col border-l-4 border-l-transparent"
          >
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Landmark size={14} className="text-[#134e4a]" />
              Cash & bank (total)
            </p>
            <p className="text-2xl font-bold text-[#134e4a] tracking-tight tabular-nums leading-tight">
              {formatNgn(liquidityTotal)}
            </p>
            <ul className="mt-3 flex-1 space-y-0 border-t border-slate-100 pt-3">
              {liquidityBreakdown.map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 border-b border-slate-50 last:border-0 text-[10px] font-medium text-slate-600"
                >
                  <span className="truncate text-left">{row.label}</span>
                  <span className="tabular-nums text-right text-[#134e4a] font-semibold shrink-0">
                    {formatNgn(row.amountNgn)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] font-medium text-slate-400 mt-3 pt-2 border-t border-slate-100 flex items-center gap-1">
              Treasury detail <ChevronRight size={12} className="opacity-50" />
            </p>
          </button>

          <KpiCard
            title="Low stock (by gauge · type · colour)"
            value={String(liveLowStockCount)}
            sub="Open inventory to reorder / GRN"
            titleAttr="SKUs below minimum — detail lists material shape."
            onClick={() => navigate('/operations')}
            highlight={liveLowStockCount > 0 ? 'danger' : undefined}
          >
            {stockAlerts.length > 0 ? (
              <ul className="mt-2 space-y-2 border-t border-slate-100 pt-3">
                {stockAlerts.slice(0, 3).map((s) => (
                  <li key={s.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-start text-left">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-[#134e4a] leading-snug">
                        <span className="tabular-nums">{s.gauge}</span>
                        <span className="text-slate-400 font-medium"> mm</span>
                        <span className="text-slate-600"> · {s.materialType}</span>
                      </p>
                      <p className="text-[9px] text-slate-500 truncate">{s.colour}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[9px] font-semibold uppercase text-slate-400">{s.status}</p>
                      <p className="text-[10px] font-bold text-slate-700 tabular-nums">{s.qty}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[10px] font-medium text-slate-500 border-t border-slate-100 pt-3">
                All tracked SKUs above reorder.
              </p>
            )}
          </KpiCard>
        </div>
      </section>

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
                0.30–0.40 Aluzinc rows are guides until you confirm. Values saved in this browser.
              </p>
            </div>
            <button
              type="button"
              onClick={openPriceEditor}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#134e4a] shadow-sm hover:bg-slate-50 transition-colors shrink-0"
            >
              <Pencil size={15} />
              Update prices
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-0 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
            {spotPrices.map((row) => (
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
            ))}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <button
                    type="button"
                    onClick={() => setMillHelpOpen(true)}
                    className="inline-flex rounded-full p-0.5 text-slate-400 hover:text-[#134e4a] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/30"
                    aria-label="What is mill output?"
                    title="Explain this metric"
                  >
                    <HelpCircle size={14} />
                  </button>
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
                      By <span className="font-medium text-slate-600">colour</span> and{' '}
                      <span className="font-medium text-slate-600">gauge (thickness)</span>
                      {' '}
                      — live current stock leaders by colour and gauge.
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
                  Current stock
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

            <ul className="divide-y divide-slate-100">
              {topCoilsRows.map((row) => (
                <li key={`${row.rank}-${row.colour}-${row.gaugeMm}`}>
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
                          {row.gaugeMm} mm · {row.colour}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 pl-9">{row.materialType}</p>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-9 text-[11px] tabular-nums">
                        <span className="text-slate-500">
                          {row.weightKg.toLocaleString()} kg
                        </span>
                        <span className="font-semibold text-[#134e4a]">Live store</span>
                      </div>
                    </div>
                    <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,10.5rem)_minmax(0,7rem)] gap-x-3 items-center">
                      <span className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-[#134e4a] tabular-nums">
                        {row.rank}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{row.colour}</span>
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">{row.gaugeMm} mm</span>
                      <span className="text-[12px] text-slate-600 truncate pr-1">{row.materialType}</span>
                      <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0 text-sm font-semibold text-slate-800 tabular-nums text-right">
                        <span>{row.weightKg.toLocaleString()} kg</span>
                      </span>
                      <span className="text-sm font-semibold text-[#134e4a] tabular-nums text-right">Live</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
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

          <section
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-[11px] text-slate-600 leading-relaxed"
            aria-label="Suggested dashboard metrics"
          >
            <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-widest mb-2">
              Strong fits for the next dashboard row
            </p>
            <p className="mb-2">
              Based on the rest of the app (Operations, Finance, Procurement, Deliveries), these would round
              out control-room visibility:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">WIP vs store coil (kg)</span> — ties Live Production
                Monitor to transfer &amp; FG.
              </li>
              <li>
                <span className="font-semibold text-slate-800">PO in transit &amp; GRN backlog</span> — from
                Procurement / Inventory context.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Margin vs spot list</span> — landed cost (when you add
                it) vs the ₦/m table above.
              </li>
              <li>
                <span className="font-semibold text-slate-800">AR aging &amp; overdue</span> — from Sales /
                Accounts receivables.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Deliveries due / POD pending</span> — from
                Deliveries board.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Scrap % &amp; yield</span> — roll up from production
                monitor into a weekly KPI.
              </li>
            </ul>
          </section>
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
            <h3 className="text-lg font-black text-[#134e4a]">Update spot prices (₦/m)</h3>
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
                Adjust ₦ per metre. Values are stored in this browser only until an API backs pricing.
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
