import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  PlusCircle,
  FileText,
  Scissors,
  Receipt,
  PackageCheck,
  AlertTriangle,
  Banknote,
  Wallet,
  ChevronRight,
  HelpCircle,
  Pencil,
  X,
  Trophy,
} from 'lucide-react';
import { PageHeader, PageShell, ModalFrame } from '../components/layout';
import WorkspaceShortcuts from '../components/WorkspaceShortcuts';
import {
  formatNgn,
} from '../Data/mockData';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { EditSecondApprovalInline } from '../components/EditSecondApprovalInline';
import { mergeDashboardPrefs, dashboardPrefsShallowEqual } from '../lib/dashboardPrefs';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';
import {
  buildPriceListSaveBody,
  spotPricesRowsFromMasterData,
} from '../lib/spotPricesFromMasterData';
import { liveTopSalesPerformersByMaterial } from '../lib/liveAnalytics';
import { refundOutstandingAmount } from '../lib/refundsStore';
import EditApprovalsPanel from '../components/dashboard/EditApprovalsPanel';

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

function CoilRequestAckRow({ request, ws, showToast }) {
  const [aid, setAid] = useState('');
  const acknowledge = async () => {
    if (!ws?.canMutate) {
      showToast('Reconnect to acknowledge — workspace is read-only.', { variant: 'info' });
      return;
    }
    const { ok, data } = await apiFetch(`/api/coil-requests/${encodeURIComponent(request.id)}/acknowledge`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(aid.trim() ? { editApprovalId: aid.trim() } : {}),
      }),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not acknowledge request.', { variant: 'error' });
      return;
    }
    setAid('');
    await ws.refresh();
  };
  return (
    <li className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="min-w-0 text-[11px]">
        <p className="font-semibold text-slate-900">
          {request.gauge || '—'} mm · {request.colour || '—'} · {request.materialType || '—'}
        </p>
        <p className="text-slate-600 mt-1">
          {request.requestedKg ? `${request.requestedKg} kg (approx.)` : 'Qty not specified'}
          {request.note ? ` · ${request.note}` : ''}
        </p>
        <p className="text-[9px] text-slate-400 mt-1 font-mono">{request.id}</p>
        <EditSecondApprovalInline
          entityKind="coil_request"
          entityId={request.id}
          value={aid}
          onChange={setAid}
          className="mt-2"
        />
      </div>
      <button
        type="button"
        onClick={() => void acknowledge()}
        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase text-slate-700 hover:bg-slate-50"
      >
        Acknowledge
      </button>
    </li>
  );
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
  const [priceListEditAidById, setPriceListEditAidById] = useState({});

   
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
   

  const spotPriceRows = useMemo(
    () => spotPricesRowsFromMasterData(ws?.snapshot?.masterData),
    [ws?.snapshot?.masterData]
  );
  const canEditSpotPrices = Boolean(ws?.hasPermission?.('settings.view'));

  const openPriceEditor = useCallback(() => {
    setPriceDraft(spotPriceRows.map((r) => ({ ...r })));
    setPriceListEditAidById({});
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
          const aid = String(priceListEditAidById[row.id] || '').trim();
          const { ok, data } = await apiFetch(
            `/api/setup/price-list/${encodeURIComponent(row.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                ...body,
                ...(aid ? { editApprovalId: aid } : {}),
              }),
            }
          );
          if (!ok || !data?.ok) {
            showToast(data?.error || `Could not update ${row.id}.`, { variant: 'error' });
            return;
          }
        }
        await ws.refresh();
        setPriceListEditAidById({});
        setPriceEditorOpen(false);
        showToast('Prices saved to setup (master data).');
      } catch (err) {
        showToast(String(err.message || err), { variant: 'error' });
      }
    },
    [priceDraft, priceListEditAidById, showToast, ws]
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

  const productionMetrics = ws?.snapshot?.productionMetrics;

  const topCoilsRows = useMemo(
    () => liveTopSalesPerformersByMaterial(productionJobs, quotations, { limit: 5 }),
    [productionJobs, quotations]
  );

  return (
    <PageShell blurred={priceEditorOpen}>
      <PageHeader
        title="Operations dashboard"
        subtitle={
          currentUserName
            ? `${currentUserName}, here is the live sales, treasury, production, and inventory picture for today.`
            : 'Live sales, treasury, production, and inventory control in one view'
        }
      />

      <WorkspaceShortcuts />

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
                <CoilRequestAckRow key={r.id} request={r} ws={ws} showToast={showToast} />
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
          {ws?.canAccessModule?.('edit_approvals') ? <EditApprovalsPanel /> : null}

          <section className="bg-white p-6 md:p-8 rounded-xl border border-slate-200/90 shadow-sm">
            <div className="flex flex-col gap-4 mb-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#134e4a]">
                    <Trophy size={20} strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                      Top material performers (production)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                      By <span className="font-medium text-slate-600">colour</span>,{' '}
                      <span className="font-medium text-slate-600">gauge</span>, and{' '}
                      <span className="font-medium text-slate-600">profile</span>
                      {' '}
                      — actual metres from jobs completed this month; ₦ is each job’s share of its quotation total (by
                      actual metres across completed jobs for that quote).
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
                  <span>Metres</span>
                  <span className="text-slate-300 font-normal">·</span>
                  <span>kg</span>
                </span>
              </span>
              <span className="text-right tabular-nums">Sales (₦)</span>
            </div>

            {topCoilsRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center border-t border-slate-100">
                No production completions in the current month yet — rankings appear as jobs are completed.
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
                            {row.metresProduced.toLocaleString()} m · ~{row.weightKg.toLocaleString()} kg
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
                          <span>{row.metresProduced.toLocaleString()} m</span>
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
                    <div className="sm:col-span-12">
                      <EditSecondApprovalInline
                        entityKind="setup_record"
                        entityId={`price-list:${row.id}`}
                        value={priceListEditAidById[row.id] || ''}
                        onChange={(v) =>
                          setPriceListEditAidById((prev) => ({
                            ...prev,
                            [row.id]: v,
                          }))
                        }
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
              <span className="font-semibold text-slate-800">Metres produced (7 days)</span> is the sum of{' '}
              <span className="font-semibold text-slate-800">actual metres</span> on production jobs completed in that
              window — so mill output can be higher than produced while WIP sits in the yard, or lower if you are
              dispatching older stock.
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
