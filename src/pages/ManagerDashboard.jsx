import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  History,
  CheckCircle2,
  Flag,
  RotateCcw,
  Search,
  ChevronRight,
  DollarSign,
  Zap,
  RefreshCw,
  BarChart3,
  Plus,
  FileText,
  Factory,
  LayoutDashboard,
  AlertTriangle,
  Radio,
  Printer,
  Paperclip,
  HelpCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { printExpenseRequestRecord } from '../lib/expenseRequestPrint';
import { useWorkspace } from '../context/WorkspaceContext';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { formatNgn } from '../Data/mockData';
import { receiptCashReceivedNgn } from '../lib/salesReceiptsList';
import { effectiveManagerTargetsPerMonth, mergeDashboardPrefs } from '../lib/dashboardPrefs';
import { userCanApproveEditMutationsClient } from '../lib/editApprovalUi';
import { EditSecondApprovalInline } from '../components/EditSecondApprovalInline';
import {
  buildManagementQueuesFromSnapshot,
  buildManagerSnapshotsFromWorkspace,
  MANAGER_METRIC_PERIODS,
  managementPeriodStartISO,
} from '../lib/managementLiveFromWorkspace';
import { formatRefundReasonCategory, matchesInboxSearch } from '../lib/managerDashboardCore';
import { Card, Button } from '../components/ui';
import { ModalFrame, PageShell } from '../components/layout';
import { DashboardKpiStrip } from '../components/dashboard/DashboardKpiStrip';
import { ManagementAuditSections } from '../components/management/ManagementAuditSections';

const INBOX_TABS = [
  { key: 'clearance', label: 'Clearance', description: 'Paid quotes awaiting manager clearance' },
  { key: 'production', label: 'Production gate', description: 'Draft cutting lists under 70% paid' },
  { key: 'conversions', label: 'Conversion review', description: 'High / low conversion or jobs awaiting manager sign-off' },
  { key: 'flagged', label: 'Flagged', description: 'Quotations marked for audit' },
  { key: 'refunds', label: 'Refunds', description: 'Pending refund requests' },
  { key: 'payments', label: 'Payment requests', description: 'Expense / payment approvals' },
];

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quoteDeepLinked = useRef('');
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [items, setItems] = useState({
    pendingClearance: [],
    flagged: [],
    productionOverrides: [],
    pendingRefunds: [],
    pendingExpenses: [],
    pendingConversionReviews: [],
  });
  /** @type {[null | { kind: string; quoteId?: string; refundId?: string; requestId?: string; jobId?: string; row: object; cuttingListId?: string; fromProductionGate?: boolean }, Function]} */
  const [selectedIntel, setSelectedIntel] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [refundIntelExtras, setRefundIntelExtras] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingRefundIntel, setLoadingRefundIntel] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [activeTab, setActiveTab] = useState('clearance');
  const [editApprovalPending, setEditApprovalPending] = useState([]);
  const [conversionSignoffRemark, setConversionSignoffRemark] = useState('');
  const [conversionSignoffEditApprovalId, setConversionSignoffEditApprovalId] = useState('');
  const [showStockRequest, setShowStockRequest] = useState(false);
  /** @type {['month' | '4months' | 'half' | 'year', Function]} */
  const [metricPeriod, setMetricPeriod] = useState('month');

  const inboxTabs = useMemo(() => {
    const t = [...INBOX_TABS];
    if (userCanApproveEditMutationsClient(ws?.session?.user?.roleKey, ws?.permissions)) {
      t.push({
        key: 'edit_approvals',
        label: 'Edit OKs',
        description: 'Second-party approvals before colleagues save sensitive edits.',
      });
    }
    return t;
  }, [ws?.session?.user?.roleKey, ws?.permissions]);

  const unifiedWorkItems = useMemo(
    () => (Array.isArray(ws?.snapshot?.unifiedWorkItems) ? ws.snapshot.unifiedWorkItems : []),
    [ws?.snapshot?.unifiedWorkItems]
  );
  const branchNameById = useMemo(() => {
    const branches = ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [];
    return Object.fromEntries(
      branches.map((b) => [String(b.id || '').trim(), String(b.name || b.code || b.id || '').trim()])
    );
  }, [ws?.snapshot?.workspaceBranches, ws?.session?.branches]);
  const unifiedBySource = useMemo(() => {
    const out = new Map();
    for (const item of unifiedWorkItems) {
      const key = `${String(item.sourceKind || '').trim()}:${String(item.sourceId || '').trim()}`;
      if (!key || key === ':') continue;
      out.set(key, item);
    }
    return out;
  }, [unifiedWorkItems]);
  const resolveManagerWorkItem = useCallback(
    (kind, row, extra = {}) => {
      if (!row) return null;
      if (kind === 'clearance') return unifiedBySource.get(`quotation_clearance:${String(row.id || '').trim()}`) || null;
      if (kind === 'production') {
        const qref = String(row.quotation_ref || extra.quoteId || '').trim();
        return unifiedBySource.get(`production_gate:${qref}`) || null;
      }
      if (kind === 'flagged') return unifiedBySource.get(`flagged_transaction:${String(row.id || '').trim()}`) || null;
      if (kind === 'refunds') return unifiedBySource.get(`refund_request:${String(row.refund_id || '').trim()}`) || null;
      if (kind === 'payments') return unifiedBySource.get(`payment_request:${String(row.request_id || '').trim()}`) || null;
      if (kind === 'conversions') return unifiedBySource.get(`conversion_review:${String(row.job_id || '').trim()}`) || null;
      if (kind === 'edit_approvals') return unifiedBySource.get(`edit_approval:${String(row.id || '').trim()}`) || null;
      return null;
    },
    [unifiedBySource]
  );
  const openUnifiedWorkItem = useCallback(
    (item) => {
      if (!item?.routePath) return;
      navigate(item.routePath, item.routeState ? { state: item.routeState } : undefined);
    },
    [navigate]
  );
  const selectedUnifiedWorkItem = useMemo(() => {
    if (!selectedIntel) return null;
    if (selectedIntel.kind === 'quotation') {
      if (selectedIntel.fromProductionGate) {
        return (
          unifiedBySource.get(`production_gate:${String(selectedIntel.quoteId || '').trim()}`) ||
          unifiedBySource.get(`quotation_clearance:${String(selectedIntel.quoteId || '').trim()}`) ||
          null
        );
      }
      return (
        unifiedBySource.get(`flagged_transaction:${String(selectedIntel.quoteId || '').trim()}`) ||
        unifiedBySource.get(`quotation_clearance:${String(selectedIntel.quoteId || '').trim()}`) ||
        null
      );
    }
    if (selectedIntel.kind === 'refund') {
      return unifiedBySource.get(`refund_request:${String(selectedIntel.refundId || '').trim()}`) || null;
    }
    if (selectedIntel.kind === 'payment') {
      return unifiedBySource.get(`payment_request:${String(selectedIntel.requestId || '').trim()}`) || null;
    }
    if (selectedIntel.kind === 'conversion') {
      return unifiedBySource.get(`conversion_review:${String(selectedIntel.jobId || '').trim()}`) || null;
    }
    return null;
  }, [selectedIntel, unifiedBySource]);
  const renderOfficialRecordBanner = (item) => {
    if (!item) return null;
    return (
      <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-teal-300/90">Official record</p>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <p className="text-xs font-mono font-bold text-white">{item.referenceNo || item.id}</p>
            <p className="text-[10px] text-white/50 mt-1 capitalize">
              {item.documentClass} · {item.documentType?.replace?.(/_/g, ' ')}
            </p>
            {item.keyDecisionSummary ? (
              <p className="text-[10px] text-teal-100/85 mt-2 line-clamp-2">{item.keyDecisionSummary}</p>
            ) : null}
          </div>
          {item.routePath ? (
            <button
              type="button"
              onClick={() => openUnifiedWorkItem(item)}
              className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-white hover:bg-white/15"
            >
              Open record
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const paymentIntelLineItems = useMemo(() => {
    const raw = selectedIntel?.row?.line_items;
    if (!Array.isArray(raw)) return { lines: [], total: 0 };
    return { lines: raw.slice(0, 20), total: raw.length };
  }, [selectedIntel?.row?.line_items]);

  const { products: invProducts } = useInventory();
  const liveLowStockCount = useMemo(
    () => invProducts.filter((p) => p.stockLevel < p.lowStockThreshold).length,
    [invProducts]
  );

  const workspaceQuotations = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws.snapshot?.quotations) ? ws.snapshot.quotations : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.quotations]
  );
  const workspaceCuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws.snapshot?.cuttingLists) ? ws.snapshot.cuttingLists : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.cuttingLists]
  );
  const workspaceProductionJobs = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws.snapshot?.productionJobs) ? ws.snapshot.productionJobs : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.productionJobs]
  );

  const mergedPrefsForTargets = useMemo(
    () => mergeDashboardPrefs(ws?.snapshot?.dashboardPrefs),
    [ws?.snapshot?.dashboardPrefs]
  );

  const managerTargetsForBuild = useMemo(() => {
    const eff = effectiveManagerTargetsPerMonth(ws?.snapshot?.orgManagerTargets, mergedPrefsForTargets);
    return { nairaTarget: eff.nairaTargetPerMonth, meterTarget: eff.meterTargetPerMonth };
  }, [ws?.snapshot?.orgManagerTargets, mergedPrefsForTargets]);

  /** Which target tier drives progress bars (for hero chip). */
  const managerTargetSourceMeta = useMemo(() => {
    const org = ws?.snapshot?.orgManagerTargets;
    const orgN = Number(org?.nairaTargetPerMonth);
    const orgM = Number(org?.meterTargetPerMonth);
    const hasOrg = (Number.isFinite(orgN) && orgN > 0) || (Number.isFinite(orgM) && orgM > 0);

    if (mergedPrefsForTargets.managerTargetsPersonalOverride) {
      return {
        shortLabel: 'Personal',
        title:
          'Active targets: personal override. Progress bars use your own monthly baselines from Settings → Preferences. Company defaults are ignored.',
        chipClass:
          'bg-violet-500/20 border-violet-400/35 text-violet-100',
      };
    }
    if (hasOrg) {
      return {
        shortLabel: 'Company',
        title:
          'Active targets: company. Progress bars prefer company monthly baselines set by an admin in Settings → Preferences. If only one leg is set at company level, the other uses your saved baseline or the app default.',
        chipClass: 'bg-sky-500/20 border-sky-400/35 text-sky-100',
      };
    }
    return {
      shortLabel: 'Account',
      title:
        'Active targets: your account. No company targets are set; progress bars use the values saved on your account in Settings → Preferences, or built-in defaults.',
      chipClass: 'bg-white/10 border-white/20 text-teal-100/95',
    };
  }, [mergedPrefsForTargets.managerTargetsPersonalOverride, ws?.snapshot?.orgManagerTargets]);

  const displayItems = useMemo(() => {
    if (ws?.hasWorkspaceData && ws.snapshot) {
      return buildManagementQueuesFromSnapshot(ws.snapshot);
    }
    return items;
  }, [ws?.hasWorkspaceData, ws.snapshot, items]);

  const displaySnapshots = useMemo(() => {
    const periodMeta = MANAGER_METRIC_PERIODS.find((p) => p.key === metricPeriod);
    const monthsSpan = periodMeta?.monthsSpan ?? 1;
    const scaledTargets = {
      nairaTarget: managerTargetsForBuild.nairaTarget * monthsSpan,
      meterTarget: managerTargetsForBuild.meterTarget * monthsSpan,
    };
    if (!ws?.hasWorkspaceData || !ws.snapshot) {
      return {
        paidOnQuotesNgn: 0,
        producedSalesNgn: 0,
        quoteCount: 0,
        lowStockCount: liveLowStockCount,
        metersCuttingLists: 0,
        completedProductionMetres: 0,
        topByRevenue: [],
        periodKey: metricPeriod,
        periodLabel: periodMeta?.label ?? 'This month',
        targets: scaledTargets,
      };
    }
    return buildManagerSnapshotsFromWorkspace(
      workspaceQuotations,
      workspaceCuttingLists,
      workspaceProductionJobs,
      liveLowStockCount,
      managerTargetsForBuild,
      metricPeriod
    );
  }, [
    ws?.hasWorkspaceData,
    ws.snapshot,
    workspaceQuotations,
    workspaceCuttingLists,
    workspaceProductionJobs,
    liveLowStockCount,
    managerTargetsForBuild,
    metricPeriod,
  ]);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const itemsRes = await apiFetch('/api/management/items');

      const itemsOk =
        itemsRes.ok &&
        itemsRes.data &&
        Array.isArray(itemsRes.data.pendingClearance) &&
        itemsRes.data.ok !== false;
      if (itemsOk) {
        const d = itemsRes.data;
        setItems({
          pendingClearance: d.pendingClearance ?? [],
          flagged: d.flagged ?? [],
          productionOverrides: d.productionOverrides ?? [],
          pendingRefunds: d.pendingRefunds ?? [],
          pendingExpenses: d.pendingExpenses ?? [],
          pendingConversionReviews: d.pendingConversionReviews ?? [],
        });
      } else {
        const msg =
          itemsRes.data?.error ||
          (itemsRes.status === 403
            ? 'You need audit access, refund approval, or sales / quotation management rights to load this dashboard.'
            : itemsRes.status === 401
              ? 'Sign in again to load management data.'
              : `Management lists could not be loaded (${itemsRes.status}).`);
        setLoadError(msg);
      }

      let editAppr = [];
      if (userCanApproveEditMutationsClient(ws?.session?.user?.roleKey, ws?.permissions)) {
        const ea = await apiFetch('/api/edit-approvals/pending');
        if (ea.ok && ea.data?.ok && Array.isArray(ea.data.items)) editAppr = ea.data.items;
      }
      setEditApprovalPending(editAppr);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
  };

  useEffect(() => {
    fetchData();
  }, [ws?.refreshEpoch]);

  const fetchAudit = useCallback(async (quoteId) => {
    if (!quoteId) return;
    setLoadingAudit(true);
    const { ok, data } = await apiFetch(
      `/api/management/quotation-audit?quotationRef=${encodeURIComponent(quoteId)}`
    );
    if (ok && data) setAuditData(data);
    else setAuditData({ ok: false, error: data?.error || 'Could not load quotation audit.' });
    setLoadingAudit(false);
  }, []);

  /** Deep link: ?quoteRef= from Sales (cutting list, etc.) */
  useEffect(() => {
    const ref = (searchParams.get('quoteRef') || '').trim();
    if (!ref || loading) return;
    if (quoteDeepLinked.current === ref) return;
    quoteDeepLinked.current = ref;

    const fromClearance = displayItems.pendingClearance.find((q) => q.id === ref);
    const fromFlagged = displayItems.flagged.find((q) => q.id === ref);
    const fromProd = displayItems.productionOverrides.find((o) => o.quotation_ref === ref);
    setRefundIntelExtras(null);
    const row = fromClearance || fromFlagged;
    if (row) {
      setSelectedIntel({ kind: 'quotation', quoteId: ref, row: { ...row } });
    } else if (fromProd) {
      setSelectedIntel({
        kind: 'quotation',
        quoteId: ref,
        row: { id: ref, customer_name: fromProd.customer_name },
        cuttingListId: fromProd.id,
        fromProductionGate: true,
      });
    } else {
      setSelectedIntel({ kind: 'quotation', quoteId: ref, row: { id: ref, customer_name: '' } });
    }
    fetchAudit(ref);
    setActiveTab(fromProd ? 'production' : fromClearance ? 'clearance' : fromFlagged ? 'flagged' : 'clearance');
  }, [
    loading,
    searchParams,
    displayItems.pendingClearance,
    displayItems.flagged,
    displayItems.productionOverrides,
    fetchAudit,
  ]);

  /** Deep link: ?inbox=edit_approvals opens the second-party edit approval queue. */
  useEffect(() => {
    const inbox = (searchParams.get('inbox') || '').trim().toLowerCase();
    if (inbox !== 'edit_approvals') return;
    if (!userCanApproveEditMutationsClient(ws?.session?.user?.roleKey, ws?.permissions)) return;
    setActiveTab('edit_approvals');
  }, [searchParams, ws?.session?.user?.roleKey, ws?.permissions]);

  useEffect(() => {
    setConversionSignoffRemark('');
    setConversionSignoffEditApprovalId('');
  }, [selectedIntel?.kind, selectedIntel?.jobId]);

  /** If URL opened before queues loaded, merge customer row when data arrives. */
  useEffect(() => {
    if (selectedIntel?.kind !== 'quotation') return;
    const ref = selectedIntel.quoteId;
    if (!ref || String(selectedIntel.row?.customer_name || '').trim()) return;
    const row =
      displayItems.pendingClearance.find((q) => q.id === ref) || displayItems.flagged.find((q) => q.id === ref);
    const po = displayItems.productionOverrides.find((o) => o.quotation_ref === ref);
    if (row)
      setSelectedIntel((prev) =>
        prev?.kind === 'quotation' && prev.quoteId === ref ? { ...prev, row: { ...prev.row, ...row } } : prev
      );
    else if (po)
      setSelectedIntel((prev) =>
        prev?.kind === 'quotation' && prev.quoteId === ref
          ? {
              ...prev,
              row: { ...prev.row, customer_name: po.customer_name },
              cuttingListId: po.id,
              fromProductionGate: true,
            }
          : prev
      );
  }, [
    displayItems.pendingClearance,
    displayItems.flagged,
    displayItems.productionOverrides,
    selectedIntel?.kind,
    selectedIntel?.quoteId,
    selectedIntel?.row?.customer_name,
  ]);

  useEffect(() => {
    if (selectedIntel?.kind !== 'refund') {
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      return;
    }
    const qref = String(selectedIntel.row?.quotation_ref || '').trim();
    if (!qref) {
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      setAuditData(null);
      return;
    }
    void fetchAudit(qref);
    let cancelled = false;
    setLoadingRefundIntel(true);
    (async () => {
      const { ok, data } = await apiFetch(`/api/refunds/intelligence?quotationRef=${encodeURIComponent(qref)}`);
      if (cancelled) return;
      setLoadingRefundIntel(false);
      if (ok && data && data.ok !== false) setRefundIntelExtras(data);
      else setRefundIntelExtras(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIntel, fetchAudit]);

  useEffect(() => {
    if (selectedIntel?.kind !== 'conversion') return;
    const qref = String(selectedIntel.row?.quotation_ref || '').trim();
    if (!qref) {
      setAuditData(null);
      return;
    }
    void fetchAudit(qref);
  }, [selectedIntel?.kind, selectedIntel?.row?.quotation_ref, selectedIntel?.jobId, fetchAudit]);

  const tabCounts = useMemo(
    () => ({
      clearance: displayItems.pendingClearance.length,
      production: displayItems.productionOverrides.length,
      conversions: (displayItems.pendingConversionReviews ?? []).length,
      flagged: displayItems.flagged.length,
      refunds: displayItems.pendingRefunds.length,
      payments: displayItems.pendingExpenses.length,
      edit_approvals: editApprovalPending.length,
    }),
    [displayItems, editApprovalPending.length]
  );

  const totalOpenActions = useMemo(
    () =>
      tabCounts.clearance +
      tabCounts.production +
      tabCounts.conversions +
      tabCounts.flagged +
      tabCounts.refunds +
      tabCounts.payments +
      tabCounts.edit_approvals,
    [tabCounts]
  );

  const filteredInboxRows = useMemo(() => {
    let list = [];
    if (activeTab === 'clearance') list = displayItems.pendingClearance;
    else if (activeTab === 'production') list = displayItems.productionOverrides;
    else if (activeTab === 'flagged') list = displayItems.flagged;
    else if (activeTab === 'refunds') list = displayItems.pendingRefunds;
    else if (activeTab === 'payments') list = displayItems.pendingExpenses;
    else if (activeTab === 'conversions') list = displayItems.pendingConversionReviews ?? [];
    else if (activeTab === 'edit_approvals') list = editApprovalPending;
    return list.filter((row) => matchesInboxSearch(inboxSearch, row, activeTab));
  }, [activeTab, displayItems, inboxSearch, editApprovalPending]);

  const producedSalesProgress =
    displaySnapshots.targets?.nairaTarget > 0
      ? Math.min(
          100,
          Math.round((displaySnapshots.producedSalesNgn / displaySnapshots.targets.nairaTarget) * 100)
        )
      : 0;
  const productionMetresProgress =
    displaySnapshots.targets?.meterTarget > 0
      ? Math.min(
          100,
          Math.round((displaySnapshots.completedProductionMetres / displaySnapshots.targets.meterTarget) * 100)
        )
      : 0;

  const openQuotationIntel = useCallback(
    (quotationId, row, extra = {}) => {
      if (!quotationId) return;
      const baseRow = row ? { ...row } : { id: quotationId, customer_name: '' };
      setRefundIntelExtras(null);
      setSelectedIntel({
        kind: 'quotation',
        quoteId: quotationId,
        row: baseRow,
        ...extra,
      });
      fetchAudit(quotationId);
    },
    [fetchAudit]
  );

  const handleReview = async (quotationId, decision, reason = '') => {
    if (!quotationId) return;
    setDecisionBusy(true);
    const { ok, data } = await apiFetch('/api/management/review', {
      method: 'POST',
      body: JSON.stringify({ quotationId, decision, reason }),
    });
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not apply manager decision.', { variant: 'error' });
      return;
    }
    const labels = {
      clear: 'Clearance approved.',
      approve_production: 'Production override saved. Cutting list can proceed in Sales.',
      flag: 'Moved to flagged queue for audit.',
    };
    showToast(labels[decision] || 'Updated.', { variant: 'success' });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    if (selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === quotationId) {
      setSelectedIntel(null);
      setAuditData(null);
    }
  };

  const handleRefundDecision = async (status) => {
    if (selectedIntel?.kind !== 'refund') return;
    const note =
      window.prompt(status === 'Approved' ? 'Optional note for approval' : 'Reason for rejection (optional)') ?? '';
    const amount = Number(selectedIntel.row?.amount_ngn) || 0;
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/refunds/${encodeURIComponent(selectedIntel.refundId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({
          status,
          managerComments: note.trim(),
          ...(status === 'Approved' && amount > 0 ? { approvedAmountNgn: amount } : {}),
        }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not update refund.', { variant: 'error' });
      return;
    }
    showToast(status === 'Approved' ? 'Refund approved.' : 'Refund rejected.', { variant: 'success' });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
    setRefundIntelExtras(null);
  };

  const handlePaymentDecision = async (status) => {
    if (selectedIntel?.kind !== 'payment') return;
    const note =
      window.prompt(status === 'Approved' ? 'Optional note' : 'Reason for rejection (optional)') ?? '';
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/payment-requests/${encodeURIComponent(selectedIntel.requestId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ status, note: note.trim() }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not update payment request.', { variant: 'error' });
      return;
    }
    showToast(status === 'Approved' ? 'Payment request approved.' : 'Payment request rejected.', {
      variant: 'success',
    });
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
  };

  const handleConversionSignoff = async () => {
    if (selectedIntel?.kind !== 'conversion') return;
    const remark = conversionSignoffRemark.trim();
    if (remark.length < 3) {
      showToast('Enter a sign-off remark (at least 3 characters).', { variant: 'error' });
      return;
    }
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/production-jobs/${encodeURIComponent(selectedIntel.jobId)}/manager-review-signoff`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          remark,
          ...(conversionSignoffEditApprovalId.trim()
            ? { editApprovalId: conversionSignoffEditApprovalId.trim() }
            : {}),
        }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not sign off this job.', { variant: 'error' });
      return;
    }
    showToast('Conversion review signed off.', { variant: 'success' });
    setConversionSignoffRemark('');
    setConversionSignoffEditApprovalId('');
    await fetchData();
    await (ws.refresh?.() ?? Promise.resolve());
    setSelectedIntel(null);
  };

  const renderInboxRow = (row) => {
    if (activeTab === 'edit_approvals') {
      const e = row;
      const workItem = resolveManagerWorkItem('edit_approvals', e);
      return (
        <div
          key={e.id}
          className="flex flex-wrap items-start justify-between gap-2 p-4 border-b border-slate-100 last:border-0"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold text-slate-700">{e.id}</p>
            <p className="text-[11px] font-semibold text-slate-800 mt-1">
              {e.entityKind} · <span className="font-mono">{e.entityId}</span>
            </p>
            <p className="text-[9px] text-slate-500 mt-1">
              Requested by {e.requestedByDisplay || e.requestedByUserId || '—'}
            </p>
            {workItem?.referenceNo ? (
              <p className="text-[9px] text-slate-400 mt-1 font-mono">Record {workItem.referenceNo}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-[#134e4a] px-3 py-1.5 text-[10px] font-black uppercase text-white hover:brightness-105"
            onClick={async () => {
              const { ok, data } = await apiFetch(`/api/edit-approvals/${encodeURIComponent(e.id)}/approve`, {
                method: 'POST',
                body: JSON.stringify({}),
              });
              if (!ok || !data?.ok) {
                showToast(data?.error || 'Could not approve.', { variant: 'error' });
                return;
              }
              showToast('Edit approval granted — token is valid for one save.');
              await fetchData();
              await (ws.refreshEditApprovalsPending?.() ?? Promise.resolve());
            }}
          >
            Approve
          </button>
        </div>
      );
    }
    if (activeTab === 'clearance') {
      const workItem = resolveManagerWorkItem('clearance', row);
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => openQuotationIntel(row.id, row)}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-teal-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === row.id ? 'bg-teal-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-[#134e4a] tabular-nums">{row.id}</span>
            <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
              {row.date_iso ? new Date(row.date_iso).toLocaleDateString() : '—'}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mb-2 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mb-2">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-800 bg-teal-100/90 px-2 py-0.5 rounded-md tabular-nums">
                {formatNgn(row.paid_ngn)}
              </span>
              <span className="text-[9px] text-slate-500">of {formatNgn(row.total_ngn)}</span>
            </div>
            <ChevronRight
              size={14}
              className="text-slate-300 group-hover:text-[#134e4a] transition-transform group-hover:translate-x-0.5 shrink-0"
            />
          </div>
        </button>
      );
    }
    if (activeTab === 'production') {
      const qref = row.quotation_ref;
      const workItem = resolveManagerWorkItem('production', row, { quoteId: qref });
      return (
        <button
          key={row.id}
          type="button"
          onClick={() =>
            openQuotationIntel(
              qref,
              { id: qref, customer_name: row.customer_name },
              { cuttingListId: row.id, fromProductionGate: true }
            )
          }
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === qref ? 'bg-amber-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Cutting list</span>
            <span className="text-xs font-mono font-bold text-slate-600">{row.id}</span>
          </div>
          <p className="text-xs font-bold text-[#134e4a] mb-1">{qref}</p>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mb-2 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mb-2">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">
              Paid {formatNgn(row.paid_ngn)} / {formatNgn(row.total_ngn)}
            </span>
            <span className="font-bold text-amber-700 tabular-nums">{row.total_meters?.toLocaleString?.() ?? row.total_meters} m</span>
          </div>
        </button>
      );
    }
    if (activeTab === 'flagged') {
      const workItem = resolveManagerWorkItem('flagged', row);
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => openQuotationIntel(row.id, row)}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-rose-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'quotation' && selectedIntel.quoteId === row.id ? 'bg-rose-50/70' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-rose-900">{row.id}</span>
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate mb-2">{row.customer_name}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mb-2 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mb-2">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <p className="text-[10px] text-rose-800/90 line-clamp-2 leading-snug">{row.manager_flag_reason || 'No reason on file.'}</p>
          <p className="text-[9px] text-slate-400 mt-2">
            {row.manager_flagged_at_iso ? new Date(row.manager_flagged_at_iso).toLocaleString() : '—'}
          </p>
        </button>
      );
    }
    if (activeTab === 'refunds') {
      const workItem = resolveManagerWorkItem('refunds', row);
      return (
        <button
          key={row.refund_id}
          type="button"
          onClick={() => setSelectedIntel({ kind: 'refund', refundId: row.refund_id, row: { ...row } })}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'refund' && selectedIntel.refundId === row.refund_id ? 'bg-amber-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-slate-800">{row.refund_id}</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">{formatNgn(row.amount_ngn)}</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-700 truncate">{row.customer_name}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mt-1 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mt-1">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <p className="text-[10px] text-slate-500 mt-1">
            {row.quotation_ref} · {formatRefundReasonCategory(row.reason_category)}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Transaction intel</span>
            <ChevronRight
              size={14}
              className="text-slate-300 group-hover:text-amber-700 transition-transform group-hover:translate-x-0.5 shrink-0"
            />
          </div>
        </button>
      );
    }
    if (activeTab === 'payments') {
      const workItem = resolveManagerWorkItem('payments', row);
      return (
        <button
          key={row.request_id}
          type="button"
          onClick={() => {
            setAuditData(null);
            setRefundIntelExtras(null);
            setSelectedIntel({ kind: 'payment', requestId: row.request_id, row: { ...row } });
          }}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/50 focus-visible:ring-inset ${
            selectedIntel?.kind === 'payment' && selectedIntel.requestId === row.request_id ? 'bg-slate-100/90' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-800">{row.request_id}</span>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
              {formatNgn(row.amount_requested_ngn)}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 line-clamp-2">{row.description}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mt-1 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mt-1">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <p className="text-[9px] text-slate-400 mt-2 uppercase tracking-wide">{row.request_date}</p>
          <p className="text-[9px] text-slate-400 mt-1">Status: {row.approval_status ?? row.status ?? 'Pending'}</p>
          <div className="flex items-center justify-end mt-1">
            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600 shrink-0" />
          </div>
        </button>
      );
    }
    if (activeTab === 'conversions') {
      const alert = String(row.conversion_alert_state || '');
      const workItem = resolveManagerWorkItem('conversions', row);
      return (
        <button
          key={row.job_id}
          type="button"
          onClick={() => {
            setAuditData(null);
            setRefundIntelExtras(null);
            setSelectedIntel({ kind: 'conversion', jobId: row.job_id, row: { ...row } });
          }}
          className={`group w-full text-left p-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 focus-visible:ring-inset ${
            selectedIntel?.kind === 'conversion' && selectedIntel.jobId === row.job_id ? 'bg-violet-50/80' : ''
          }`}
        >
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-slate-700">{row.job_id}</span>
            <span
              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                alert === 'High'
                  ? 'bg-rose-100 text-rose-800'
                  : alert === 'Low'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {alert || 'Review'}
            </span>
          </div>
          <p className="text-xs font-bold text-[#134e4a] mb-0.5">{row.quotation_ref || '—'}</p>
          <p className="text-[11px] font-semibold text-slate-700 truncate">{row.customer_name}</p>
          {workItem?.referenceNo ? (
            <p className="text-[9px] text-slate-400 mt-1 font-mono">Record {workItem.referenceNo}</p>
          ) : null}
          {row.branch_id ? (
            <p className="text-[9px] text-slate-400 mt-1">{branchNameById[row.branch_id] || row.branch_id}</p>
          ) : null}
          <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{row.product_name}</p>
          <p className="text-[9px] text-slate-400 mt-2 tabular-nums">
            {row.actual_meters != null ? `${Number(row.actual_meters).toLocaleString()} m` : '—'}
            {row.completed_at_iso ? ` · ${new Date(row.completed_at_iso).toLocaleString()}` : ''}
          </p>
        </button>
      );
    }
    return null;
  };

  const tabMeta = inboxTabs.find((t) => t.key === activeTab);

  return (
    <PageShell className="pb-14">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-6 sm:mb-8">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl text-[10px] font-bold uppercase tracking-wide h-10 border-slate-200"
          onClick={() => navigate('/sales')}
        >
          Sales
        </Button>
        <button
          type="button"
          title="Reload management API and workspace snapshot"
          onClick={() => void handleRefreshAll()}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
        <Button
          type="button"
          onClick={() => setShowStockRequest(true)}
          className="rounded-xl gap-2 font-bold uppercase text-[10px] h-10"
        >
          <Plus size={16} /> Stock note
        </Button>
      </div>

      {loadError ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 mb-6"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#134e4a] via-[#0f3d39] to-[#0a2e2c] text-white p-6 sm:p-8 mb-6 shadow-lg shadow-teal-950/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <LayoutDashboard size={28} className="text-teal-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200/90">
                  {displaySnapshots.periodLabel ?? 'This month'}
                </p>
                {ws?.hasWorkspaceData ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-200">
                    <Radio size={10} className="text-emerald-300" aria-hidden />
                    Live workspace
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/50">
                    No workspace
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${managerTargetSourceMeta.chipClass}`}
                  title={managerTargetSourceMeta.title}
                >
                  Targets: {managerTargetSourceMeta.shortLabel}
                </span>
              </div>
              <p className="text-[9px] font-semibold text-teal-200/75 mt-1.5 mb-0 tracking-wide">
                {managerTargetSourceMeta.line}
              </p>
              <div
                className="flex flex-wrap gap-1 mt-3 mb-1"
                role="group"
                aria-label="Metrics time range"
              >
                {MANAGER_METRIC_PERIODS.map((p) => {
                  const on = metricPeriod === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setMetricPeriod(p.key)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-colors ${
                        on
                          ? 'bg-white text-[#0f3d39] border-white shadow-sm'
                          : 'bg-white/5 text-teal-100/90 border-white/15 hover:bg-white/10 hover:border-white/25'
                      }`}
                    >
                      {p.shortLabel}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/90 mb-1 flex items-center gap-1.5 flex-wrap">
                <span>Sales produced (same basis as KPI strip)</span>
                <span
                  className="inline-flex rounded-full p-0.5 text-teal-200/80 hover:text-white hover:bg-white/10 cursor-help"
                  title="Quotation totals allocated to completed production jobs in this period, by job completion date — not cash date. Matches the Sales card in the KPI strip below."
                >
                  <HelpCircle size={14} aria-hidden />
                  <span className="sr-only">Explain sales produced</span>
                </span>
              </p>
              <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums">
                {formatNgn(displaySnapshots.producedSalesNgn)}
              </p>
              <p
                className="text-[11px] text-teal-100/80 mt-1.5 tabular-nums flex items-center gap-1.5 flex-wrap"
                title="Sum of paidNgn on quotations whose quote date falls in the selected period. This is cash recorded on quotes, not production-attributed revenue."
              >
                <span>Collected on quotations (quote date): {formatNgn(displaySnapshots.paidOnQuotesNgn)}</span>
                <HelpCircle size={13} className="shrink-0 text-teal-200/70" aria-hidden />
              </p>
              <p className="text-xs text-white/70 mt-2 max-w-md">
                {totalOpenActions} open management item{totalOpenActions === 1 ? '' : 's'} across queues
                {loading ? ' · refreshing…' : ''}.
                {ws?.hasWorkspaceData
                  ? ' Numbers and inbox follow your signed-in workspace snapshot.'
                  : ' Connect the workspace to sync inbox rows with Sales and Operations in real time.'}
              </p>
            </div>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-4 lg:max-w-xl">
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">Quotes</p>
              <p className="text-lg font-black tabular-nums mt-1">{displaySnapshots.quoteCount}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">Low stock SKUs</p>
              <p className="text-lg font-black tabular-nums mt-1">{displaySnapshots.lowStockCount}</p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-3 sm:col-span-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80">
                Metres produced (completed jobs)
              </p>
              <p className="text-lg font-black tabular-nums mt-1">
                {Number(displaySnapshots.completedProductionMetres || 0).toLocaleString()} m
              </p>
              <p className="text-[8px] font-semibold text-teal-200/70 mt-1.5 leading-snug">
                Cutting lists (dated in period): {Number(displaySnapshots.metersCuttingLists || 0).toLocaleString()} m
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-teal-100/90 mb-1.5">
              <span>Produced sales vs target</span>
              <span className="tabular-nums">{producedSalesProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-400 transition-all"
                style={{ width: `${producedSalesProgress}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-teal-100/90 mb-1.5">
              <span>Production metres vs target</span>
              <span className="tabular-nums">{productionMetresProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${productionMetresProgress}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-[9px] text-teal-200/55 mt-3 max-w-xl leading-relaxed">
          Progress bars use monthly targets × selected range. Company defaults (Settings → Preferences, admins) apply
          to everyone unless you enable a personal override there.
        </p>
      </div>

      <DashboardKpiStrip
        sectionClassName="mb-6"
        metricsWindow={{
          startISO: managementPeriodStartISO(metricPeriod),
          label: displaySnapshots.periodLabel ?? 'This month',
        }}
      />

      {!ws?.hasWorkspaceData ? (
        <p className="text-xs font-semibold text-slate-500 mb-6">
          KPI strip uses live workspace data — connect to the API if figures look empty.
        </p>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-6">
          <Card className="overflow-hidden border-slate-200/90 shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <h2 className="text-sm font-black text-[#134e4a] tracking-tight flex items-center gap-2">
                    <ShieldCheck size={18} className="text-teal-600 shrink-0" />
                    Action inbox
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">{tabMeta?.description}</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={inboxSearch}
                    onChange={(e) => setInboxSearch(e.target.value)}
                    placeholder="Filter this queue…"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  />
                </div>
              </div>
              <div className="flex gap-1 mt-4 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar">
                {inboxTabs.map((t) => {
                  const active = activeTab === t.key;
                  const count = tabCounts[t.key] ?? 0;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-colors border ${
                        active
                          ? 'bg-[#134e4a] text-white border-[#134e4a] shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {t.label}
                      <span
                        className={`tabular-nums px-1.5 py-0.5 rounded-md text-[9px] ${
                          active ? 'bg-white/20' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-h-[420px] max-h-[min(56vh,560px)] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                  <RefreshCw size={28} className="animate-spin text-[#134e4a]" />
                  <p className="text-xs font-bold uppercase tracking-widest">Loading queues</p>
                </div>
              ) : filteredInboxRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center text-slate-400">
                  {activeTab === 'clearance' ? (
                    <CheckCircle2 size={36} className="opacity-25 mb-3 text-teal-600" />
                  ) : activeTab === 'production' ? (
                    <Factory size={36} className="opacity-25 mb-3 text-amber-600" />
                  ) : activeTab === 'flagged' ? (
                    <Flag size={36} className="opacity-25 mb-3 text-rose-500" />
                  ) : activeTab === 'conversions' ? (
                    <BarChart3 size={36} className="opacity-25 mb-3 text-violet-600" />
                  ) : activeTab === 'refunds' ? (
                    <RotateCcw size={36} className="opacity-25 mb-3 text-amber-600" />
                  ) : activeTab === 'edit_approvals' ? (
                    <ShieldCheck size={36} className="opacity-25 mb-3 text-teal-600" />
                  ) : (
                    <FileText size={36} className="opacity-25 mb-3 text-rose-500" />
                  )}
                  <p className="text-sm font-bold text-slate-600">Nothing in this queue</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {inboxSearch.trim()
                      ? 'Try clearing the search filter.'
                      : 'When new items arrive, they will appear here.'}
                  </p>
                </div>
              ) : (
                <div>{filteredInboxRows.map((row) => renderInboxRow(row))}</div>
              )}
            </div>
          </Card>

          <Card className="p-5 border-slate-200/90 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em] mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-[#134e4a]" />
              Top customers ({(displaySnapshots.periodLabel ?? 'this month').toLowerCase()})
            </h3>
            <div className="space-y-4">
              {displaySnapshots.topByRevenue.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No revenue data for {(displaySnapshots.periodLabel ?? 'this period').toLowerCase()} yet.
                </p>
              ) : (
                displaySnapshots.topByRevenue.map((c, idx) => (
                  <div key={c.customer_id || idx} className="flex items-center gap-4">
                    <span className="text-xs font-black text-slate-400 w-5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] font-bold text-slate-800 mb-1 gap-2">
                        <span className="truncate">{c.customer_name}</span>
                        <span className="tabular-nums shrink-0 text-[#134e4a]">{formatNgn(c.revenue)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(c.revenue / (displaySnapshots.topByRevenue[0]?.revenue || 1)) * 100}%`,
                          }}
                          className="h-full bg-[#134e4a] rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="xl:col-span-5 xl:sticky xl:top-6 space-y-4">
          <Card className="flex flex-col bg-slate-900 border-slate-800 shadow-xl overflow-hidden min-h-[min(88vh,920px)] max-h-[min(92vh,960px)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] flex items-center gap-2">
                <History size={14} className="text-teal-400" />
                Transaction intel
              </h3>
              {selectedIntel ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIntel(null);
                    setAuditData(null);
                    setRefundIntelExtras(null);
                  }}
                  className="text-[10px] font-bold uppercase text-white/40 hover:text-white transition-colors"
                >
                  Close
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-white min-h-0">
              {!selectedIntel ? (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <Search size={28} className="text-white/25" />
                  </div>
                  <p className="text-sm font-bold text-white/50">Select an inbox row</p>
                  <p className="text-xs text-white/35 mt-2 max-w-[240px] leading-relaxed">
                    Clearance, production gate, conversion review, flags, refunds, and payment requests all open here with actions.
                  </p>
                </div>
              ) : selectedIntel.kind === 'quotation' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-teal-400/90 mb-1">Quotation</p>
                    <h2 className="text-xl font-black text-white leading-tight">{selectedIntel.quoteId}</h2>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">
                      {selectedIntel.row?.customer_name || 'Customer name not on this list row'}
                    </p>
                    {selectedIntel.fromProductionGate ? (
                      <p className="text-[10px] text-amber-300/90 mt-2 leading-snug">
                        Opened from production gate (low payment). Use production override only after you accept the risk.
                      </p>
                    ) : null}
                  </div>
                  {renderOfficialRecordBanner(selectedUnifiedWorkItem)}

                  {loadingAudit ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-2xl border border-white/10 bg-white/[0.04]">
                      <RefreshCw className="text-teal-400 animate-spin" size={28} />
                      <span className="text-[11px] font-bold text-white/50">Loading quotation detail…</span>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 space-y-3">
                        <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Clearance decision</p>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          Approve records manager clearance. Disapprove or Flag both move the quote to the{' '}
                          <span className="text-white/70">Flagged</span> inbox with your reason.
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => handleReview(selectedIntel.quoteId, 'clear')}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              const reason = window.prompt('Why are you disapproving this clearance? (required)');
                              if (reason && reason.trim()) handleReview(selectedIntel.quoteId, 'flag', reason.trim());
                            }}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white border border-white/10 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Disapprove</span>
                          </button>
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              const reason = window.prompt('Reason for audit flag? (required)');
                              if (reason && reason.trim()) handleReview(selectedIntel.quoteId, 'flag', reason.trim());
                            }}
                            className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/85 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                          >
                            <Flag size={18} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Flag</span>
                          </button>
                        </div>
                        {selectedIntel.fromProductionGate ? (
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => handleReview(selectedIntel.quoteId, 'approve_production')}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-teal-700 hover:bg-teal-600 text-white border border-white/10 disabled:opacity-50 transition-colors"
                          >
                            <Zap size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              Production override (low payment)
                            </span>
                          </button>
                        ) : null}
                      </div>

                      <ManagementAuditSections auditData={auditData} loadingAudit={false} formatNgn={formatNgn} />
                    </>
                  )}
                </div>
              ) : selectedIntel.kind === 'refund' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/90 mb-1">Refund request</p>
                    <h2 className="text-lg font-black text-white font-mono leading-tight">{selectedIntel.refundId}</h2>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">{selectedIntel.row?.customer_name}</p>
                    <p className="text-xs text-white/50 mt-2 tabular-nums">{formatNgn(selectedIntel.row?.amount_ngn)}</p>
                    <p className="text-[10px] text-white/40 mt-2">
                      {selectedIntel.row?.quotation_ref ? `Quote ${selectedIntel.row.quotation_ref}` : '—'} ·{' '}
                      {formatRefundReasonCategory(selectedIntel.row?.reason_category)}
                    </p>
                  </div>
                  {renderOfficialRecordBanner(selectedUnifiedWorkItem)}

                  {loadingRefundIntel ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="text-amber-400 animate-spin" size={28} />
                    </div>
                  ) : refundIntelExtras ? (
                    <>
                      <section>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Receipts (quote context)</p>
                        <div className="space-y-2">
                          {!refundIntelExtras.receipts?.length ? (
                            <p className="text-xs text-white/35 py-2">None.</p>
                          ) : (
                            refundIntelExtras.receipts.map((rcpt, idx) => (
                              <div
                                key={rcpt.id || idx}
                                className="flex gap-3 p-3 rounded-xl bg-white/[0.06] border border-white/10"
                              >
                                <div className="p-2 bg-emerald-500/15 rounded-lg shrink-0">
                                  <DollarSign size={14} className="text-emerald-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black text-white tabular-nums">
                                    {formatNgn(receiptCashReceivedNgn(rcpt))}
                                  </p>
                                  <p className="text-[9px] text-white/30 mt-1 font-mono">{rcpt.id}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                      <section>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Cutting lists</p>
                        {!refundIntelExtras.cuttingLists?.length ? (
                          <p className="text-xs text-white/35 py-2">None linked.</p>
                        ) : (
                          <div className="space-y-2">
                            {refundIntelExtras.cuttingLists.map((cl, idx) => (
                              <div key={cl.id || idx} className="p-3 rounded-xl bg-white/[0.06] border border-white/10 text-[10px]">
                                <p className="font-bold text-white">{cl.id}</p>
                                <p className="text-white/40 mt-1 tabular-nums">{cl.totalMeters?.toLocaleString?.()} m</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  ) : selectedIntel.row?.quotation_ref ? null : (
                    <p className="text-[10px] text-white/35">No quotation linked — context panels unavailable.</p>
                  )}

                  {selectedIntel.row?.quotation_ref ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-violet-300/90 uppercase tracking-widest">
                        Full quotation picture (orders, payments, balance, production, refunds)
                      </p>
                      <ManagementAuditSections auditData={auditData} loadingAudit={loadingAudit} formatNgn={formatNgn} />
                    </div>
                  ) : null}

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Decision</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handleRefundDecision('Approved')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handleRefundDecision('Rejected')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Reject</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() =>
                        navigate('/sales', {
                          state: {
                            focusSalesTab: 'refund',
                            openSalesRecord: { type: 'refund', id: selectedIntel.refundId },
                          },
                        })
                      }
                      className="w-full text-[10px] font-bold uppercase tracking-wide text-white/40 hover:text-white/70 py-2"
                    >
                      Open full refund flow in Sales
                    </button>
                  </div>
                </div>
              ) : selectedIntel.kind === 'payment' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-300/90 mb-1">Payment request</p>
                    <h2 className="text-lg font-black text-white leading-tight">{selectedIntel.requestId}</h2>
                    <p className="text-xs text-white/45 mt-2 font-mono">{selectedIntel.row?.expense_id}</p>
                    {selectedIntel.row?.expense_category ? (
                      <p className="text-[11px] text-teal-200/90 mt-2">
                        Category:{' '}
                        <span className="font-semibold text-white/90">{selectedIntel.row.expense_category}</span>
                      </p>
                    ) : null}
                    {selectedIntel.row?.request_reference ? (
                      <p className="text-[11px] text-white/55 mt-2">
                        Reference: <span className="font-semibold text-white/80">{selectedIntel.row.request_reference}</span>
                      </p>
                    ) : null}
                    <p className="text-sm font-semibold text-white/80 mt-3 tabular-nums">
                      {formatNgn(selectedIntel.row?.amount_requested_ngn)}
                    </p>
                    <p className="text-sm text-white/60 mt-3 leading-snug whitespace-pre-wrap">
                      {selectedIntel.row?.description}
                    </p>
                    <p className="text-[10px] text-white/35 mt-3 uppercase tracking-wide">{selectedIntel.row?.request_date}</p>
                    {paymentIntelLineItems.total > 0 ? (
                      <div className="z-scroll-x mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                        <table className="w-full min-w-[320px] border-collapse text-left text-xs">
                          <thead>
                            <tr className="text-white/50 uppercase tracking-wide border-b border-white/10 text-[11px] font-bold">
                              <th className="p-2.5">Item</th>
                              <th className="p-2.5 text-right">Unit</th>
                              <th className="p-2.5 text-right">Price</th>
                              <th className="p-2.5 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentIntelLineItems.lines.map((ln, i) => (
                              <tr key={i} className="border-b border-white/5 text-white/80">
                                <td className="p-2.5 max-w-0 whitespace-nowrap truncate" title={ln.item || '—'}>
                                  {ln.item || '—'}
                                </td>
                                <td className="p-2.5 text-right tabular-nums whitespace-nowrap">
                                  {Number(ln.unit) || 0}
                                </td>
                                <td className="p-2.5 text-right tabular-nums whitespace-nowrap">
                                  {formatNgn(Number(ln.unitPriceNgn ?? ln.unit_price_ngn) || 0)}
                                </td>
                                <td className="p-2.5 text-right tabular-nums font-semibold text-white/90 whitespace-nowrap">
                                  {formatNgn(Number(ln.lineTotalNgn ?? ln.line_total_ngn) || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {paymentIntelLineItems.total > 20 ? (
                          <p className="px-2.5 py-2 text-[11px] font-semibold text-white/45">
                            Showing 20 of {paymentIntelLineItems.total} lines.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {selectedIntel.row?.attachment_present ? (
                        <a
                          href={apiUrl(
                            `/api/payment-requests/${encodeURIComponent(selectedIntel.requestId)}/attachment`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white"
                        >
                          <Paperclip size={14} />
                          {selectedIntel.row?.attachment_name || 'View attachment'}
                        </a>
                      ) : (
                        <span className="text-[10px] text-white/35">No attachment</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          printExpenseRequestRecord(
                            {
                              requestID: selectedIntel.requestId,
                              requestDate: selectedIntel.row?.request_date,
                              requestReference: selectedIntel.row?.request_reference,
                              description: selectedIntel.row?.description,
                              expenseID: selectedIntel.row?.expense_id,
                              amountRequestedNgn: selectedIntel.row?.amount_requested_ngn,
                              approvalStatus: selectedIntel.row?.approval_status,
                              expenseCategory: selectedIntel.row?.expense_category,
                              lineItems: selectedIntel.row?.line_items,
                              attachmentName: selectedIntel.row?.attachment_name,
                              attachmentPresent: selectedIntel.row?.attachment_present,
                            },
                            formatNgn
                          )
                        }
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                      >
                        <Printer size={14} />
                        Print record
                      </button>
                    </div>
                  </div>
                  {renderOfficialRecordBanner(selectedUnifiedWorkItem)}
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Decision</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handlePaymentDecision('Approved')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => handlePaymentDecision('Rejected')}
                        className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors"
                      >
                        <Flag size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Reject</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedIntel.kind === 'conversion' ? (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/90 mb-1">Conversion review</p>
                    <h2 className="text-lg font-black text-white font-mono leading-tight">{selectedIntel.jobId}</h2>
                    <p className="text-xs font-bold text-teal-300/90 mt-2">{selectedIntel.row?.quotation_ref || '—'}</p>
                    <p className="text-sm font-semibold text-white/70 mt-1 truncate">{selectedIntel.row?.customer_name}</p>
                    <p className="text-[10px] text-white/45 mt-2">{selectedIntel.row?.product_name}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md bg-white/10">
                        Alert: {selectedIntel.row?.conversion_alert_state || '—'}
                      </span>
                      {selectedIntel.row?.manager_review_required ? (
                        <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md bg-amber-500/20 text-amber-200">
                          Manager review
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-white/50 mt-4 tabular-nums">
                      Actual: {Number(selectedIntel.row?.actual_meters || 0).toLocaleString()} m
                      {selectedIntel.row?.actual_weight_kg != null
                        ? ` · ${Number(selectedIntel.row.actual_weight_kg).toLocaleString()} kg`
                        : ''}
                    </p>
                    <p className="text-[9px] text-white/30 mt-2">
                      {selectedIntel.row?.completed_at_iso
                        ? new Date(selectedIntel.row.completed_at_iso).toLocaleString()
                        : ''}
                    </p>
                  </div>
                  {renderOfficialRecordBanner(selectedUnifiedWorkItem)}

                  {selectedIntel.row?.quotation_ref ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-violet-300/90 uppercase tracking-widest">
                        Quotation context (payments, balance, meters, conversion trail)
                      </p>
                      <ManagementAuditSections auditData={auditData} loadingAudit={loadingAudit} formatNgn={formatNgn} />
                    </div>
                  ) : null}

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Sign off</p>
                    <p className="text-[10px] text-white/45 leading-relaxed">
                      Confirms you have reviewed High/Low conversion or the open manager review for this completed job.
                    </p>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/50">
                      Remark
                      <textarea
                        value={conversionSignoffRemark}
                        onChange={(e) => setConversionSignoffRemark(e.target.value)}
                        rows={2}
                        placeholder="e.g. Variance reviewed — approved to close."
                        className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-violet-400/40"
                      />
                    </label>
                    {selectedIntel.jobId ? (
                      <div className="rounded-xl border border-amber-400/40 bg-amber-950/40 p-2">
                        <EditSecondApprovalInline
                          entityKind="production_job"
                          entityId={selectedIntel.jobId}
                          value={conversionSignoffEditApprovalId}
                          onChange={setConversionSignoffEditApprovalId}
                          className="!border-amber-300/50 !bg-amber-950/60 !text-amber-50"
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() => void handleConversionSignoff()}
                      className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase text-[9px] tracking-widest disabled:opacity-50 transition-colors"
                    >
                      <Factory size={18} />
                      Sign off review
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30">
              <p className="text-[9px] font-semibold text-white/25 text-center uppercase tracking-widest">
                Management · Zarewa
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ModalFrame
        isOpen={showStockRequest}
        onClose={() => setShowStockRequest(false)}
        title="Inventory note"
        description="Placeholder stock request form"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-base font-bold text-[#134e4a]">Inventory replenishment</h2>
            <button
              type="button"
              onClick={() => setShowStockRequest(false)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">
              Draft a coil or material request for procurement. Wire this to your payment / PO flow when ready.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Material</label>
                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
                  <option>Aluminium coil</option>
                  <option>PVC resin</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Weight (kg)</label>
                <input
                  type="number"
                  placeholder="5000"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 rounded-xl font-bold uppercase text-[10px] h-11"
                type="button"
                onClick={() => {
                  showToast('Request draft captured. Continue in Procurement for sourcing and PO execution.', {
                    variant: 'success',
                  });
                  setShowStockRequest(false);
                }}
              >
                Submit request draft
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowStockRequest(false)}
                className="rounded-xl font-bold uppercase text-[10px] h-11"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default ManagerDashboard;
