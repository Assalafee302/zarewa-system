import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Scissors,
  Plus,
  Truck,
  AlertTriangle,
  TrendingUp,
  Package,
  X,
  Award,
  ChevronRight,
  Scale,
  Search,
  Disc3,
} from 'lucide-react';

import { WorkspacePanelToolbar } from '../components/workspace';
import { WORKSPACE_EMPTY_LIST_CLASS } from '../lib/workspaceListStyle';
import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import { AiAskButton } from '../components/AiAskButton';
import { LiveProductionMonitor } from '../components/LiveProductionMonitor';
import OperationsCoilControlTab from '../components/operations/OperationsCoilControlTab';
import { OperationsInventoryAttentionPanel } from '../components/operations/OperationsInventoryAttentionPanel';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../lib/appDataTable';
import { AppTablePager, AppTableWrap } from '../components/ui/AppDataTable';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';
import { procurementKindFromPo } from '../lib/procurementPoKind';

/** Current kg on the coil (after production use); uses API fields when present. */
function liveCoilWeightKg(lot) {
  if (lot.currentWeightKg != null && lot.currentWeightKg !== '') {
    const cw = Number(lot.currentWeightKg);
    if (Number.isFinite(cw)) return Math.max(0, cw);
  }
  if (lot.qtyRemaining != null && lot.qtyRemaining !== '') {
    const qr = Number(lot.qtyRemaining);
    if (Number.isFinite(qr)) return Math.max(0, qr);
  }
  const w = Number(lot.weightKg);
  if (Number.isFinite(w) && w > 0) return w;
  const q = Number(lot.qtyReceived);
  return Number.isFinite(q) ? Math.max(0, q) : 0;
}

/** Roll up conversion checks for one cutting list (multiple coils → one summary line). */
function summarizeConversionChecksForCuttingList(checks, formatPct) {
  if (!Array.isArray(checks) || !checks.length) return null;
  const alertSeverityRank = (s) => {
    const t = String(s || 'OK').toLowerCase();
    if (t === 'high') return 4;
    if (t === 'low') return 3;
    if (t === 'watch') return 2;
    return 1;
  };
  let worst = 'OK';
  let worstR = 0;
  for (const c of checks) {
    const s = String(c.alertState || 'OK');
    const r = alertSeverityRank(s);
    if (r > worstR) {
      worstR = r;
      worst = String(c.alertState || 'OK');
    }
  }
  const sorted = [...checks].sort((a, b) =>
    String(b.checkedAtISO || '').localeCompare(String(a.checkedAtISO || ''))
  );
  const latest = sorted[0];
  const v = latest.varianceSummary?.variances ?? {};
  return {
    count: checks.length,
    worst,
    deltaLabel: `Δ Std ${formatPct(v.standardPct)}`,
  };
}

/** Lower score = needs attention first (active + closed production lists). */
function productionAttentionScore(row) {
  const completed = Boolean(row?.completed);
  const pr = String(row?.priority || '');
  if (completed || pr === 'Done' || pr === 'Cancelled') return 9;
  if (row?.needsCoil) return 0;
  if (row?.managerReviewRequired) return 1;
  if (row?.overdue) return 2;
  if (pr === 'High') return 3;
  if (pr === 'Waiting' || pr === 'Wait') return 4;
  return 5;
}

/**
 * @param {'attention'|'id'|'customer'|'status'} sortKey
 */
function compareProductionQueueRows(a, b, sortKey) {
  if (sortKey === 'attention') {
    const pa = productionAttentionScore(a);
    const pb = productionAttentionScore(b);
    if (pa !== pb) return pa - pb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  if (sortKey === 'customer') {
    const c = String(a.customer || '').localeCompare(String(b.customer || ''), undefined, { sensitivity: 'base' });
    if (c !== 0) return c;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  if (sortKey === 'status') {
    const s = String(a.status || '').localeCompare(String(b.status || ''));
    if (s !== 0) return s;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  return String(a.id || '').localeCompare(String(b.id || ''));
}

const PANEL_TITLE = {
  production: 'Production queue',
  coilControl: 'Coil control',
};

/** Rows per page for production line lists (live jobs, closed queue, manager review). */
const PRODUCTION_TABLE_PAGE_SIZE = 10;

/** Coil / stone / accessory — single control for both receive and on-hand panels. */
const STOCK_RECEIVE_KIND_TABS = [
  { id: 'coil', label: 'Coil' },
  { id: 'stone', label: 'Stone' },
  { id: 'accessory', label: 'Accessories' },
];

/** Matches `confirmStoreReceipt` — POs store can post GRN against */
const PO_RECEIVABLE_STATUSES = ['Approved', 'On loading', 'In Transit'];

/** Default rows shown; search or sort surfaces older items. */
const STOCK_SIDE_LIST_LIMIT = 15;

function sortTransitPurchaseOrders(rows, sortKey) {
  const poCmp = (a, b) => String(a.poID || '').localeCompare(String(b.poID || ''));
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'orderAsc': {
        const c = String(a.orderDateISO || '').localeCompare(String(b.orderDateISO || ''));
        return c !== 0 ? c : poCmp(a, b);
      }
      case 'etaAsc': {
        const emptyA = !String(a.expectedDeliveryISO || '').trim();
        const emptyB = !String(b.expectedDeliveryISO || '').trim();
        if (emptyA !== emptyB) return emptyA ? 1 : -1;
        const c = String(a.expectedDeliveryISO || '').localeCompare(String(b.expectedDeliveryISO || ''));
        return c !== 0 ? c : poCmp(a, b);
      }
      case 'etaDesc': {
        const emptyA = !String(a.expectedDeliveryISO || '').trim();
        const emptyB = !String(b.expectedDeliveryISO || '').trim();
        if (emptyA !== emptyB) return emptyA ? 1 : -1;
        const c = String(b.expectedDeliveryISO || '').localeCompare(String(a.expectedDeliveryISO || ''));
        return c !== 0 ? c : poCmp(a, b);
      }
      case 'supplierAsc': {
        const c = String(a.supplierName || '').localeCompare(String(b.supplierName || ''));
        return c !== 0 ? c : poCmp(a, b);
      }
      case 'poAsc':
        return poCmp(a, b);
      case 'statusAsc': {
        const c = String(a.status || '').localeCompare(String(b.status || ''));
        return c !== 0 ? c : String(b.orderDateISO || '').localeCompare(String(a.orderDateISO || ''));
      }
      case 'orderDesc':
      default: {
        const c = String(b.orderDateISO || '').localeCompare(String(a.orderDateISO || ''));
        return c !== 0 ? c : poCmp(a, b);
      }
    }
  });
}

function transitPoSearchBlob(p) {
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const lineBits = lines
    .map((l) => [l.productName, l.productID, l.color, l.gauge].filter(Boolean).join(' '))
    .join(' ');
  return [
    p.poID,
    p.supplierName,
    p.status,
    p.transportAgentName,
    p.expectedDeliveryISO,
    p.orderDateISO,
    lineBits,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Matches server GRN default `CL-YY-####` (writeOps.postPurchaseOrderGrn). */
const CL_COIL_NO_RE = /^CL-(\d{2})-(\d{1,6})$/i;

function maxClSequenceForYear(coilLots, yy2, extraCoilNos = []) {
  let max = 0;
  for (const lot of coilLots || []) {
    const m = String(lot.coilNo || '').trim().match(CL_COIL_NO_RE);
    if (!m || m[1] !== yy2) continue;
    max = Math.max(max, parseInt(m[2], 10));
  }
  for (const cn of extraCoilNos) {
    const m = String(cn || '').trim().match(CL_COIL_NO_RE);
    if (!m || m[1] !== yy2) continue;
    max = Math.max(max, parseInt(m[2], 10));
  }
  return max;
}

function coilReceiptSearchBlob(c) {
  return [
    c.coilNo,
    c.colour,
    c.gaugeLabel,
    c.materialTypeName,
    c.productID,
    c.poID,
    c.supplierName,
    c.location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const ADJUST_REASONS = [
  'Damage',
  'Overstock',
  'Count correction',
  'Loss / shrinkage',
  'Other',
];

const Operations = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { show: showToast } = useToast();
  const {
    products: inventoryRows,
    purchaseOrders,
    inTransitLoads,
    confirmStoreReceipt,
    adjustStock,
    coilLots,
  } = useInventory();
  const ws = useWorkspace();

  const [activeTab, setActiveTab] = useState('production');
  const [searchQuery, setSearchQuery] = useState('');
  /** Closed-record list: all | completed | cancelled (in-progress jobs are above this list). */
  const [productionFilter, setProductionFilter] = useState('all');
  const [productionActiveSortKey, setProductionActiveSortKey] = useState('attention');
  const [productionClosedSortKey, setProductionClosedSortKey] = useState('attention');
  useEffect(() => {
    if (!ws?.hasWorkspaceData) return;
    const onlineFilters = new Set(['all', 'completed', 'cancelled']);
    if (onlineFilters.has(productionFilter)) return;
    setProductionFilter('all');
  }, [ws?.hasWorkspaceData, productionFilter]);
  const [showStockAdjust, setShowStockAdjust] = useState(false);
  const [showCoilRequest, setShowCoilRequest] = useState(false);
  /** `job` = live API job row; `pending` = offline cutting list queue (no traceability). */
  const [productionTraceModal, setProductionTraceModal] = useState(null);
  const [completeChecklistModal, setCompleteChecklistModal] = useState(null);
  const [completeChecklist, setCompleteChecklist] = useState({
    transferPosted: false,
    runLogPosted: false,
    conversionChecked: false,
  });

  const [receiveDraft, setReceiveDraft] = useState({ poID: '', location: '' });
  const [expandedReceivePoId, setExpandedReceivePoId] = useState(null);
  const [grnLines, setGrnLines] = useState([]);
  const [grnConversionOverride, setGrnConversionOverride] = useState(false);
  const grnReceivePoIdRef = useRef('');

  const [coilRequestForm, setCoilRequestForm] = useState({
    rows: [{ gauge: '', colour: '', materialType: '', requestedKg: '' }],
    note: '',
  });

  const [stockAdjust, setStockAdjust] = useState({
    productID: '',
    type: 'Increase',
    qty: '',
    reasonCode: 'Count correction',
    reasonNote: '',
    date: '',
  });
  /** After 409 COIL_SKU_DRIFT: show acknowledgement before retry. */
  const [stockAdjustCoilPrompt, setStockAdjustCoilPrompt] = useState(false);
  const [stockAdjustCoilAck, setStockAdjustCoilAck] = useState(false);
  const [stockAdjustCoilCount, setStockAdjustCoilCount] = useState(null);

  useEffect(() => {
    if (showStockAdjust) {
      setStockAdjustCoilPrompt(false);
      setStockAdjustCoilAck(false);
      setStockAdjustCoilCount(null);
    }
  }, [showStockAdjust]);

  const closeStockAdjustModal = useCallback(() => {
    setShowStockAdjust(false);
    setStockAdjustCoilPrompt(false);
    setStockAdjustCoilAck(false);
    setStockAdjustCoilCount(null);
  }, []);

  const [coilLiveSort, setCoilLiveSort] = useState('recent');
  const [transitSearch, setTransitSearch] = useState('');
  const [transitSort, setTransitSort] = useState('orderDesc');
  const [coilLiveSearch, setCoilLiveSearch] = useState('');
  /** Stock management: filter in-transit POs and received stock panel (coil lots vs metre/unit SKUs). */
  const [stockReceiveKind, setStockReceiveKind] = useState(() => /** @type {'coil'|'stone'|'accessory'} */ ('coil'));
  const [productMovementModal, setProductMovementModal] = useState(null);
  const [productMovementsLoading, setProductMovementsLoading] = useState(false);
  const [productMovementsRows, setProductMovementsRows] = useState([]);
  const productMovementsPage = useAppTablePaging(
    productMovementsRows,
    APP_DATA_TABLE_PAGE_SIZE,
    productMovementModal?.productID
  );

  const inventoryStats = useMemo(() => {
    const activeCoils = coilLots.filter((c) => c.currentStatus !== 'Consumed');
    let aluzincKg = 0;
    let aluminiumKg = 0;
    let lowStock = 0;
    const buckets = new Map();

    for (const c of activeCoils) {
      const live = liveCoilWeightKg(c);
      if (live > 0 && live < 100) lowStock += 1;
      const mt = String(c.materialTypeName || '').toLowerCase();
      if (mt.includes('alumin')) aluminiumKg += live;
      else aluzincKg += live;

      const gauge = c.gaugeLabel || '—';
      const colour = c.colour || '—';
      const material = c.materialTypeName || c.productID || '—';
      const key = `${gauge}|${colour}|${material}`;
      buckets.set(key, {
        gauge,
        colour,
        material,
        kg: (buckets.get(key)?.kg || 0) + live,
      });
    }

    const topMaterials = [...buckets.values()].sort((a, b) => b.kg - a.kg).slice(0, 3);
    return {
      totalKg: aluminiumKg + aluzincKg,
      aluzincKg,
      aluminiumKg,
      lowStock,
      topMaterials,
    };
  }, [coilLots]);

  const productionJobs = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : []),
    [ws]
  );
  const productionJobCoils = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobCoils) ? ws.snapshot.productionJobCoils : [],
    [ws]
  );
  const productionConversionChecks = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionConversionChecks)
        ? ws.snapshot.productionConversionChecks
        : [],
    [ws]
  );
  const cuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.cuttingLists) ? ws.snapshot.cuttingLists : [],
    [ws]
  );

  const jobByCuttingListId = useMemo(() => {
    const m = new Map();
    for (const j of productionJobs) {
      if (j.cuttingListId) m.set(j.cuttingListId, j);
    }
    return m;
  }, [productionJobs]);

  const productionQueueModel = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (item) => {
      if (!q) return true;
      const blob = `${item.id} ${item.customer} ${item.spec} ${item.quotationRef || ''} ${item.cuttingListId || ''}`.toLowerCase();
      return blob.includes(q);
    };

    if (!ws?.hasWorkspaceData) {
      const rows = cuttingLists
        .filter((cl) => !cl.productionRegistered)
        .map((cl) => ({
          queueKind: 'cuttingList',
          id: cl.id,
          customer: cl.customer || '—',
          spec: cl.quotationRef ? `Quote ${cl.quotationRef}` : 'Cutting list',
          quantity: typeof cl.total === 'string' ? cl.total : `${cl.total ?? '—'}`,
          priority:
            String(cl.status || '').toLowerCase().includes('draft') ||
            String(cl.status || '').toLowerCase().includes('pending')
              ? 'High'
              : 'Normal',
          completed: false,
          quotationRef: cl.quotationRef || '',
          cuttingListId: cl.id,
          status: '',
          coilCount: 0,
          coilLabel: null,
        }));
      return {
        mode: 'offline',
        sections: [{ key: 'pending', title: null, rows: rows.filter(matches) }],
      };
    }

    const coilCount = (jobID) => productionJobCoils.filter((c) => c.jobID === jobID).length;

    const registered = cuttingLists.filter((cl) => cl.productionRegistered);

    const mapRegistered = (cl) => {
      const job = jobByCuttingListId.get(cl.id);
      const status = job?.status ?? 'Planned';
      const isCompleted = status === 'Completed';
      const isCancelled = status === 'Cancelled';
      const closedRecord = isCompleted || isCancelled;
      const jobID = job?.jobID;
      const nCoils = jobID ? coilCount(jobID) : 0;
      const specParts = [
        cl.quotationRef ? `Quote ${cl.quotationRef}` : null,
        cl.productName || cl.productID || null,
      ].filter(Boolean);
      const plannedM = Number(cl.totalMeters ?? job?.plannedMeters ?? 0);
      const actualM = Number(job?.actualMeters ?? 0);
      return {
        queueKind: 'registered',
        id: cl.id,
        customer: cl.customer || '—',
        spec: specParts.length ? specParts.join(' · ') : '—',
        quantity: isCompleted
          ? `${actualM.toLocaleString()}m posted`
          : isCancelled
            ? 'Cancelled'
            : `${plannedM.toLocaleString()}m planned`,
        status,
        coilCount: nCoils,
        coilLabel: !job
          ? 'Syncing production data…'
          : closedRecord
            ? nCoils > 0
              ? `${nCoils} coil(s) on record`
              : null
            : status === 'Planned'
              ? nCoils === 0
                ? 'Coils: none (allocate before start)'
                : `Coils: ${nCoils} allocated`
              : status === 'Running'
                ? `Coils: ${nCoils} on line`
                : null,
        priority: closedRecord
          ? isCancelled
            ? 'Cancelled'
            : 'Done'
          : !job
            ? 'Wait'
            : nCoils === 0 && status === 'Planned'
              ? 'High'
              : job.managerReviewRequired ||
                  (job.endDateISO && job.endDateISO <= new Date().toISOString().slice(0, 10))
                ? 'High'
                : 'Normal',
        managerReviewRequired: Boolean(job?.managerReviewRequired),
        needsCoil: !closedRecord && status === 'Planned' && nCoils === 0,
        dueDateISO: job?.endDateISO || null,
        overdue:
          !closedRecord &&
          Boolean(job?.endDateISO) &&
          String(job.endDateISO) < new Date().toISOString().slice(0, 10),
        completed: closedRecord,
        quotationRef: cl.quotationRef || '',
        cuttingListId: cl.id,
      };
    };

    const rows = registered.map(mapRegistered);
    const active = rows.filter((r) => !r.completed);
    const closed = rows.filter((r) => r.completed);

    return {
      mode: 'online',
      sections: [
        { key: 'active', title: 'In progress', rows: active.filter(matches) },
        { key: 'closed', title: 'Completed or cancelled', rows: closed.filter(matches) },
      ],
    };
  }, [cuttingLists, productionJobCoils, ws?.hasWorkspaceData, searchQuery, jobByCuttingListId]);
  const conversionStats = useMemo(() => {
    if (!productionConversionChecks.length) {
      return { efficiencyPct: null, flagged: 0, watch: 0, total: 0 };
    }
    const flagged = productionConversionChecks.filter((row) => row.managerReviewRequired).length;
    const watch = productionConversionChecks.filter((row) => row.alertState === 'Watch').length;
    const withinBand = productionConversionChecks.filter(
      (row) => row.alertState === 'OK' || row.alertState === 'Watch'
    ).length;
    return {
      efficiencyPct: Math.round((withinBand / productionConversionChecks.length) * 100),
      flagged,
      watch,
      total: productionConversionChecks.length,
    };
  }, [productionConversionChecks]);

  const jobsNeedingManagerReview = useMemo(
    () => productionJobs.filter((j) => productionJobNeedsManagerReviewAttention(j)),
    [productionJobs]
  );

  const conversionChecksByCuttingListId = useMemo(() => {
    const m = new Map();
    for (const c of productionConversionChecks) {
      const id = String(c.cuttingListId || '').trim();
      if (!id) continue;
      const arr = m.get(id);
      if (arr) arr.push(c);
      else m.set(id, [c]);
    }
    return m;
  }, [productionConversionChecks]);

  const productionActiveRows = useMemo(() => {
    if (productionQueueModel.mode !== 'online') return [];
    return productionQueueModel.sections.find((s) => s.key === 'active')?.rows || [];
  }, [productionQueueModel]);

  const productionActiveSorted = useMemo(
    () => [...productionActiveRows].sort((a, b) => compareProductionQueueRows(a, b, productionActiveSortKey)),
    [productionActiveRows, productionActiveSortKey]
  );

  /** Main table: closed jobs only (completed or cancelled). In-progress appears in the panel above. */
  const productionClosedFiltered = useMemo(() => {
    const rows =
      productionQueueModel.mode === 'online'
        ? productionQueueModel.sections.find((s) => s.key === 'closed')?.rows || []
        : productionQueueModel.sections.flatMap((s) => s.rows || []);
    return rows.filter((row) => {
      if (productionQueueModel.mode !== 'online') {
        if (productionFilter === 'waiting') {
          return row.priority === 'Waiting' || row.priority === 'Wait' || row.status === 'Planned';
        }
        if (productionFilter === 'running') return row.status === 'Running';
        if (productionFilter === 'needs_review') return Boolean(row.managerReviewRequired);
        if (productionFilter === 'done') return Boolean(row.completed);
        return true;
      }
      if (productionFilter === 'completed') return row.status === 'Completed';
      if (productionFilter === 'cancelled') return row.status === 'Cancelled';
      if (productionFilter === 'done') return row.status === 'Completed';
      return true;
    });
  }, [productionQueueModel, productionFilter]);

  const productionQueueRows = useMemo(
    () =>
      [...productionClosedFiltered].sort((a, b) =>
        compareProductionQueueRows(a, b, productionClosedSortKey)
      ),
    [productionClosedFiltered, productionClosedSortKey]
  );

  const productionActivePage = useAppTablePaging(
    productionActiveSorted,
    PRODUCTION_TABLE_PAGE_SIZE,
    productionActiveSortKey,
    searchQuery,
    ws?.hasWorkspaceData
  );

  const productionClosedPage = useAppTablePaging(
    productionQueueRows,
    PRODUCTION_TABLE_PAGE_SIZE,
    productionClosedSortKey,
    productionFilter,
    searchQuery,
    ws?.hasWorkspaceData
  );

  const jobsReviewPage = useAppTablePaging(
    jobsNeedingManagerReview,
    PRODUCTION_TABLE_PAGE_SIZE,
    jobsNeedingManagerReview.length,
    searchQuery
  );

  const productionQueueStats = useMemo(() => {
    const rows = productionQueueModel.sections.flatMap((s) => s.rows || []);
    const active = rows.filter((r) => !r.completed);
    return {
      waiting: active.filter((r) => r.priority === 'Waiting' || r.priority === 'Wait' || r.status === 'Planned')
        .length,
      noCoil: active.filter((r) => r.needsCoil).length,
      needsReview: active.filter((r) => r.managerReviewRequired).length,
      overdue: active.filter((r) => r.overdue).length,
    };
  }, [productionQueueModel]);

  const operationsInventoryAttention = ws?.snapshot?.operationsInventoryAttention;

  const openAttentionProductionTrace = useCallback(
    (cuttingListId) => {
      const id = String(cuttingListId || '').trim();
      if (!id) return;
      if (!ws?.canMutate) {
        showToast('Connect API to open production trace.', { variant: 'info' });
        return;
      }
      setProductionTraceModal({ type: 'trace', cuttingListId: id, completed: false });
    },
    [ws?.canMutate, showToast]
  );

  const goProcurementFromAttention = useCallback(() => {
    navigate('/procurement', { state: { focusTab: 'suppliers' } });
  }, [navigate]);

  const formatVariancePct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  };

  const opsTabs = useMemo(
    () => [
      { id: 'inventory', icon: <Box size={16} />, label: 'Stock management' },
      { id: 'production', icon: <Scissors size={16} />, label: 'Production line' },
      { id: 'coilControl', icon: <Disc3 size={16} />, label: 'Coil control' },
    ],
    []
  );

  const handleOpsTab = (id) => {
    setActiveTab(id);
    setSearchQuery('');
    setProductionFilter('all');
  };

  useEffect(() => {
    const st = location.state || {};
    const t = st.focusOpsTab;
    const invSku = String(st.opsInventorySkuQuery || '').trim();

    if (t === 'inventory') {
      setActiveTab('inventory');
      if (invSku) {
        const p = invSku.toUpperCase();
        if (p.startsWith('STONE-')) setStockReceiveKind('stone');
        else if (p.startsWith('ACC-')) setStockReceiveKind('accessory');
        else setStockReceiveKind('coil');
        setCoilLiveSearch(invSku);
      }
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (t === 'coilControl') {
      setActiveTab('coilControl');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (t === 'maintenance') {
      setActiveTab('production');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (t !== 'production') return;
    setActiveTab(t);
    const highlightId = String(st.highlightCuttingListId || '').trim();
    if (t === 'production' && highlightId) setSearchQuery(highlightId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const transitOrdersAll = useMemo(
    () =>
      purchaseOrders.filter(
        (p) =>
          PO_RECEIVABLE_STATUSES.includes(p.status) && procurementKindFromPo(p) === stockReceiveKind
      ),
    [purchaseOrders, stockReceiveKind]
  );

  const transitSearchNorm = transitSearch.trim().toLowerCase();
  const transitOrdersSortedFiltered = useMemo(() => {
    const sorted = sortTransitPurchaseOrders(transitOrdersAll, transitSort);
    if (!transitSearchNorm) return sorted;
    return sorted.filter((p) => transitPoSearchBlob(p).includes(transitSearchNorm));
  }, [transitOrdersAll, transitSort, transitSearchNorm]);

  const transitOrdersTruncated =
    !transitSearchNorm && transitOrdersSortedFiltered.length > STOCK_SIDE_LIST_LIMIT;
  const transitOrders = useMemo(() => {
    if (transitSearchNorm) return transitOrdersSortedFiltered;
    return transitOrdersSortedFiltered.slice(0, STOCK_SIDE_LIST_LIMIT);
  }, [transitOrdersSortedFiltered, transitSearchNorm]);

  const coilLotsReceiptSorted = useMemo(() => {
    const finishedCoils = new Set(
      (ws?.snapshot?.movements || [])
        .filter((m) => m?.type === 'FINISHED_GOODS' && m?.ref)
        .map((m) => String(m.ref))
    );
    const rows = coilLots.filter(
      (c) => c.currentStatus !== 'Consumed' && c.currentStatus !== 'Finished' && !finishedCoils.has(String(c.coilNo))
    );
    rows.sort((a, b) => {
      if (coilLiveSort === 'kgDesc') return liveCoilWeightKg(b) - liveCoilWeightKg(a);
      if (coilLiveSort === 'kgAsc') return liveCoilWeightKg(a) - liveCoilWeightKg(b);
      if (coilLiveSort === 'coilAsc') return String(a.coilNo || '').localeCompare(String(b.coilNo || ''));
      if (coilLiveSort === 'gaugeAsc') return String(a.gaugeLabel || '').localeCompare(String(b.gaugeLabel || ''));
      if (coilLiveSort === 'materialAsc') {
        return String(a.materialTypeName || a.productID || '').localeCompare(
          String(b.materialTypeName || b.productID || '')
        );
      }
      const da = String(a.receivedAtISO || '');
      const db = String(b.receivedAtISO || '');
      if (da !== db) return db.localeCompare(da);
      return String(b.coilNo || '').localeCompare(String(a.coilNo || ''));
    });
    return rows;
  }, [coilLots, coilLiveSort, ws?.snapshot?.movements]);

  const coilLiveSearchNorm = coilLiveSearch.trim().toLowerCase();
  const coilLotsReceiptFiltered = useMemo(() => {
    if (!coilLiveSearchNorm) return coilLotsReceiptSorted;
    return coilLotsReceiptSorted.filter((c) => coilReceiptSearchBlob(c).includes(coilLiveSearchNorm));
  }, [coilLotsReceiptSorted, coilLiveSearchNorm]);

  const coilsReceiptTruncated =
    !coilLiveSearchNorm && coilLotsReceiptFiltered.length > STOCK_SIDE_LIST_LIMIT;
  const coilLotsByReceipt = useMemo(() => {
    if (coilLiveSearchNorm) return coilLotsReceiptFiltered;
    return coilLotsReceiptFiltered.slice(0, STOCK_SIDE_LIST_LIMIT);
  }, [coilLotsReceiptFiltered, coilLiveSearchNorm]);

  const anyReceivablePo = useMemo(
    () => purchaseOrders.some((p) => PO_RECEIVABLE_STATUSES.includes(p.status)),
    [purchaseOrders]
  );

  const skuProductsLiveSorted = useMemo(() => {
    if (stockReceiveKind === 'coil') return [];
    const pred =
      stockReceiveKind === 'stone'
        ? (p) => /^STONE-/i.test(String(p.productID || ''))
        : (p) => /^ACC-/i.test(String(p.productID || ''));
    return [...inventoryRows]
      .filter(pred)
      .sort((a, b) => (Number(b.stockLevel) || 0) - (Number(a.stockLevel) || 0));
  }, [inventoryRows, stockReceiveKind]);

  const skuLiveSearchNorm = coilLiveSearch.trim().toLowerCase();
  const skuProductsReceiptFiltered = useMemo(() => {
    if (!skuLiveSearchNorm) return skuProductsLiveSorted;
    return skuProductsLiveSorted.filter((p) => {
      const blob = [p.productID, p.name, p.unit].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(skuLiveSearchNorm);
    });
  }, [skuProductsLiveSorted, skuLiveSearchNorm]);

  const skuReceiptTruncated =
    stockReceiveKind !== 'coil' && !skuLiveSearchNorm && skuProductsReceiptFiltered.length > STOCK_SIDE_LIST_LIMIT;
  const skuProductsByReceipt = useMemo(() => {
    if (stockReceiveKind === 'coil') return [];
    if (skuLiveSearchNorm) return skuProductsReceiptFiltered;
    return skuProductsReceiptFiltered.slice(0, STOCK_SIDE_LIST_LIMIT);
  }, [stockReceiveKind, skuProductsReceiptFiltered, skuLiveSearchNorm]);

  useEffect(() => {
    const pid = productMovementModal?.productID;
    if (!pid) {
      setProductMovementsRows([]);
      return undefined;
    }
    let cancelled = false;
    setProductMovementsLoading(true);
    void (async () => {
      const r = await apiFetch(
        `/api/inventory/product-movements/${encodeURIComponent(pid)}?limit=500`
      );
      if (cancelled) return;
      setProductMovementsLoading(false);
      if (r.ok && r.data?.ok) setProductMovementsRows(Array.isArray(r.data.movements) ? r.data.movements : []);
      else setProductMovementsRows([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [productMovementModal?.productID]);

  useEffect(() => {
    const poId = receiveDraft.poID;
    if (grnReceivePoIdRef.current !== poId) {
      grnReceivePoIdRef.current = poId;
      setGrnConversionOverride(false);
    }

    const po = purchaseOrders.find((p) => p.poID === poId);
    if (!po) {
      setGrnLines([]);
      return;
    }

    const yy = String(new Date().getFullYear()).slice(-2);
    const poKind = procurementKindFromPo(po);

    setGrnLines((prev) => {
      const openLines = po.lines.filter((l) => Number(l.qtyOrdered) > Number(l.qtyReceived));
      const prevByKey = new Map(prev.map((r) => [r.lineKey, r]));
      const numsInForm = prev.map((r) => r.coilNo).filter(Boolean);
      let nextSeq = maxClSequenceForYear(coilLots, yy, numsInForm);

      if (poKind === 'stone' || poKind === 'accessory') {
        return openLines.map((l) => {
          const remaining = Number(l.qtyOrdered) - Number(l.qtyReceived);
          const old = prevByKey.get(l.lineKey);
          return {
            lineKey: l.lineKey,
            productID: l.productID,
            productName: l.productName,
            color: l.color,
            gauge: l.gauge,
            remaining,
            qtyReceived: old?.qtyReceived ?? '',
            coilNo: '',
            grnKind: poKind,
          };
        });
      }

      return openLines.map((l) => {
        const remaining = Number(l.qtyOrdered) - Number(l.qtyReceived);
        const old = prevByKey.get(l.lineKey);
        if (old) {
          return {
            lineKey: l.lineKey,
            productID: l.productID,
            productName: l.productName,
            color: l.color,
            gauge: l.gauge,
            remaining,
            qtyReceived: old.qtyReceived,
            coilNo: old.coilNo,
            grnKind: 'coil',
          };
        }
        nextSeq += 1;
        return {
          lineKey: l.lineKey,
          productID: l.productID,
          productName: l.productName,
          color: l.color,
          gauge: l.gauge,
          remaining,
          qtyReceived: '',
          coilNo: `CL-${yy}-${String(nextSeq).padStart(4, '0')}`,
          grnKind: 'coil',
        };
      });
    });
  }, [receiveDraft.poID, purchaseOrders, coilLots]);

  const applyTransitReceipt = async (e) => {
    e.preventDefault();
    if (!receiveDraft.poID) {
      showToast('Select an incoming order.', { variant: 'error' });
      return;
    }
    const entries = grnLines
      .map((row) => {
        const entry = {
          lineKey: row.lineKey,
          productID: row.productID,
          qtyReceived: Number(row.qtyReceived),
          coilNo: row.grnKind === 'coil' ? row.coilNo : '',
          location: receiveDraft.location,
        };
        /* Omit weightKg — server treats missing weighbridge as “use qty”; avoids empty-string quirks in proxies. */
        return entry;
      })
      .filter((x) => x.qtyReceived > 0 && !Number.isNaN(x.qtyReceived));
    if (!entries.length) {
      showToast('Enter receive quantity for at least one open line.', { variant: 'error' });
      return;
    }
    const res = await confirmStoreReceipt(
      receiveDraft.poID,
      entries,
      {},
      { allowConversionMismatch: grnConversionOverride }
    );
    if (!res.ok) {
      showToast(res.error, { variant: 'error' });
      return;
    }
    const coils = res.coilNos?.filter(Boolean).join(', ') || '';
    showToast(`Receipt posted — stock updated${coils ? ` · ${coils}` : ''}.`);
    setReceiveDraft({ poID: '', location: '' });
    setGrnLines([]);
    setGrnConversionOverride(false);
    setExpandedReceivePoId(null);
  };

  const applyStockAdjust = async (e) => {
    e.preventDefault();
    const { productID, type, qty, reasonCode, reasonNote, date } = stockAdjust;
    if (!productID || !qty) return;
    if (reasonCode === 'Other' && !reasonNote.trim()) {
      showToast('Describe the reason for “Other”.', { variant: 'error' });
      return;
    }
    const q = Number(qty);
    if (Number.isNaN(q) || q <= 0) return;
    const res = await adjustStock(productID, type, q, reasonCode, reasonNote.trim(), date, {
      acknowledgeCoilSkuDrift: type === 'Decrease' && stockAdjustCoilAck,
    });
    if (!res.ok) {
      if (res.code === 'COIL_SKU_DRIFT') {
        setStockAdjustCoilPrompt(true);
        setStockAdjustCoilCount(
          typeof res.coilLotCount === 'number' ? res.coilLotCount : null
        );
        showToast(res.error, { variant: 'error' });
        return;
      }
      showToast(res.error, { variant: 'error' });
      return;
    }
    setStockAdjust({
      productID: '',
      type: 'Increase',
      qty: '',
      reasonCode: 'Count correction',
      reasonNote: '',
      date: date || '',
    });
    closeStockAdjustModal();
    showToast('Stock adjustment applied.');
  };

  const submitCoilRequest = async (e) => {
    e.preventDefault();
    const rows = (coilRequestForm.rows || [])
      .map((r) => ({
        gauge: String(r.gauge || '').trim(),
        colour: String(r.colour || '').trim(),
        materialType: String(r.materialType || '').trim(),
        requestedKg: String(r.requestedKg || '').trim(),
      }))
      .filter((r) => r.gauge || r.colour || r.materialType || r.requestedKg);
    if (!rows.length) {
      showToast('Add at least one request line.', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to submit coil requests — read-only cached workspace.'
          : 'Sign in with a live server connection to submit coil requests.',
        { variant: 'info' }
      );
      return;
    }
    for (const row of rows) {
      if (!row.gauge && !row.colour && !row.materialType) {
        showToast('Each request line needs at least gauge, colour, or material.', { variant: 'error' });
        return;
      }
      const body = {
        gauge: row.gauge,
        colour: row.colour,
        materialType: row.materialType,
        requestedKg: row.requestedKg ? Number(row.requestedKg) || 0 : 0,
        note: coilRequestForm.note.trim(),
      };
      const { ok, data } = await apiFetch('/api/coil-requests', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save one of the request lines.', { variant: 'error' });
        return;
      }
    }
    await ws.refresh();
    setCoilRequestForm({
      rows: [{ gauge: '', colour: '', materialType: '', requestedKg: '' }],
      note: '',
    });
    setShowCoilRequest(false);
    showToast(`${rows.length} coil request line(s) sent — visible on MD operations dashboard.`);
  };

  const isAnyModalOpen =
    showStockAdjust ||
    showCoilRequest ||
    completeChecklistModal != null ||
    productionTraceModal != null ||
    productMovementModal != null;

  useEffect(() => {
    if (activeTab !== 'inventory') return undefined;
    if (!ws?.hasWorkspaceData) return undefined;
    const t = window.setInterval(() => {
      void ws.refresh?.();
    }, 15000);
    return () => window.clearInterval(t);
  }, [activeTab, ws]);

  const openProductionQueueRow = (item) => {
    if (ws?.canMutate) {
      setProductionTraceModal({
        type: 'trace',
        cuttingListId: item.id,
        completed: Boolean(item.completed),
      });
      return;
    }
    setProductionTraceModal({
      type: 'pending',
      id: item.id,
      customer: item.customer,
      spec: item.spec,
      quantity: item.quantity,
      priority: item.priority,
    });
  };

  const openTraceWithHint = (item, hint) => {
    if (!ws?.canMutate) {
      showToast('Connect API to manage production actions.', { variant: 'info' });
      return;
    }
    openProductionQueueRow(item);
    if (hint) showToast(hint, { variant: 'info' });
  };

  const requestMarkComplete = (item) => {
    setCompleteChecklistModal(item);
    setCompleteChecklist({
      transferPosted: false,
      runLogPosted: false,
      conversionChecked: false,
    });
  };

  const confirmMarkCompleteChecklist = () => {
    if (!completeChecklistModal) return;
    const allChecked =
      completeChecklist.transferPosted &&
      completeChecklist.runLogPosted &&
      completeChecklist.conversionChecked;
    if (!allChecked) {
      showToast('Tick all checklist items before completion.', { variant: 'error' });
      return;
    }
    const item = completeChecklistModal;
    setCompleteChecklistModal(null);
    openTraceWithHint(item, `Now mark ${item.id} as completed in the traceability panel.`);
  };

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        title="Store & production"
        subtitle="Receive in-transit coils into stock, adjustments & coil requests. Coil control posts ledger moves, scrap/offcut (metres + book refs), return inward to the offcut pool, and supplier defect logs."
        tabs={<PageTabs tabs={opsTabs} value={activeTab} onChange={handleOpsTab} />}
        actions={
          <AiAskButton
            mode="operations"
            prompt={
              activeTab === 'inventory'
                ? 'Summarize stock risk, in-transit receipts, and the most important store actions.'
                : activeTab === 'production'
                  ? 'Which production jobs or conversion checks need attention first, and why?'
                  : activeTab === 'coilControl'
                    ? 'Which coil ledger adjustments, scrap/offcut entries, return inward pool lines, or supplier defects need attention first?'
                    : 'Summarize operational priorities for this workspace.'
            }
            pageContext={{
              source: 'operations-page',
              activeTab,
              searchQuery,
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-teal-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[#134e4a] shadow-sm transition hover:bg-teal-50"
          >
            Ask AI
          </AiAskButton>
        }
      />

      <div className="mb-4 lg:mb-6">
        <OperationsInventoryAttentionPanel
          attention={operationsInventoryAttention}
          hasWorkspaceData={Boolean(ws?.hasWorkspaceData)}
          onOpenProductionTrace={openAttentionProductionTrace}
          onGoProcurement={goProcurementFromAttention}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
        {activeTab === 'inventory' ? (
        <div className="col-span-full w-full order-2">
          <div className="mb-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2 sm:px-3">
            <div role="tablist" aria-label="Stock category (receive and on-hand)" className="flex flex-wrap gap-1">
              {STOCK_RECEIVE_KIND_TABS.map((t) => {
                const active = stockReceiveKind === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStockReceiveKind(t.id)}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-colors ${
                      active
                        ? 'bg-[#134e4a] text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 lg:items-start">
            <section className="z-soft-panel overflow-hidden w-full min-w-0 flex flex-col lg:col-span-1">
            <div className="h-1 bg-teal-500 shrink-0 opacity-80" />
            <div className="p-3 sm:p-4 flex flex-col">
              <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Truck size={14} className="text-sky-700" />
                Goods in transit — receive
              </h3>
              {!anyReceivablePo && inTransitLoads.length === 0 ? (
                <p className="text-[10px] font-medium text-slate-400">Nothing on road or loading.</p>
              ) : transitOrdersSortedFiltered.length === 0 ? (
                <p className="text-[10px] font-medium text-slate-400">
                  {transitSearch.trim()
                    ? 'No purchase orders match your search.'
                    : `No ${stockReceiveKind === 'coil' ? 'coil' : stockReceiveKind === 'stone' ? 'stone-coated' : 'accessory'} orders in receivable status — switch category or check Procurement.`}
                </p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-1.5 mb-1.5 shrink-0">
                    <label className="relative min-w-0 w-full flex-1 sm:min-w-[140px]">
                      <Search
                        size={12}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={transitSearch}
                        onChange={(e) => setTransitSearch(e.target.value)}
                        placeholder="PO, supplier, product…"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-[10px] font-semibold text-slate-800 placeholder:text-slate-400"
                      />
                    </label>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        Sort
                      </span>
                      <select
                        value={transitSort}
                        onChange={(e) => setTransitSort(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[10px] font-semibold text-slate-700 min-w-0 max-w-full"
                      >
                        <option value="orderDesc">Newest order</option>
                        <option value="orderAsc">Oldest order</option>
                        <option value="etaAsc">ETA (soonest)</option>
                        <option value="etaDesc">ETA (latest)</option>
                        <option value="supplierAsc">Supplier A–Z</option>
                        <option value="poAsc">PO no.</option>
                        <option value="statusAsc">Status</option>
                      </select>
                    </div>
                  </div>
                  {transitOrdersTruncated ? (
                    <p className="text-[8px] font-semibold text-slate-500 mb-1">
                      +{transitOrdersSortedFiltered.length - STOCK_SIDE_LIST_LIMIT} more — search or sort
                    </p>
                  ) : null}
                  <ul className="space-y-1.5">
                  {transitOrders.map((p) => {
                    const pk = procurementKindFromPo(p);
                    const openQty = p.lines.reduce(
                      (sum, l) => sum + Math.max(0, Number(l.qtyOrdered) - Number(l.qtyReceived)),
                      0
                    );
                    const openLabel =
                      pk === 'stone' ? `${openQty.toLocaleString()} m open` : pk === 'accessory' ? `${openQty.toLocaleString()} units open` : `${openQty.toLocaleString()} kg open`;
                    const meta2 = [
                      p.status,
                      p.transportAgentName || null,
                      p.expectedDeliveryISO ? `ETA ${p.expectedDeliveryISO}` : null,
                      `${p.lines.length} line(s)`,
                      openLabel,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                    <li
                      key={p.poID}
                      className="rounded-lg border border-slate-200/60 bg-white/40 py-1 px-2 shadow-sm backdrop-blur-md"
                    >
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className="text-[11px] font-black text-[#134e4a] truncate min-w-0">
                            {p.poID}
                            <span className="font-bold text-slate-700"> · {p.supplierName}</span>
                          </p>
                          {expandedReceivePoId !== p.poID ? (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedReceivePoId(p.poID);
                                setReceiveDraft((d) => ({ ...d, poID: p.poID }));
                              }}
                              className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded-md shrink-0"
                            >
                              Receive
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedReceivePoId(null);
                                setReceiveDraft({ poID: '', location: '' });
                                setGrnLines([]);
                              }}
                              className="text-[8px] font-semibold text-slate-500 hover:text-slate-800 uppercase shrink-0 px-1"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        <p
                          className="text-[9px] font-semibold text-slate-600 mt-0.5 leading-snug line-clamp-2"
                          title={meta2}
                        >
                          {meta2}
                        </p>
                      </div>
                      {expandedReceivePoId === p.poID ? (
                        <form
                          noValidate
                          className="mt-1.5 space-y-2 border-t border-dashed border-slate-200 pt-1.5"
                          onSubmit={applyTransitReceipt}
                        >
                          <input
                            value={receiveDraft.location}
                            onChange={(e) =>
                              setReceiveDraft((s) => ({ ...s, location: e.target.value }))
                            }
                            placeholder="Location (optional)"
                            aria-label="Storage location"
                            className="w-full rounded-lg border border-slate-200 py-1.5 px-2 text-[11px] font-semibold text-slate-800"
                          />
                          {grnLines.length === 0 ? (
                            <p className="text-[10px] text-amber-700">No open lines on this order.</p>
                          ) : (
                            grnLines.map((row, idx) => {
                              const maxU =
                                row.grnKind === 'stone' ? 'm' : row.grnKind === 'accessory' ? 'units' : 'kg';
                              const gaugeS = String(row.gauge ?? '').trim() || '—';
                              const colourS = String(row.color ?? '').trim() || '—';
                              return (
                              <div
                                key={row.lineKey || idx}
                                className="rounded-md border border-slate-200/90 bg-white p-2 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 min-w-0">
                                  <p className="text-[11px] font-black text-[#134e4a] leading-snug min-w-0 flex-1">
                                    {row.productName}
                                  </p>
                                  <span
                                    className="text-[10px] font-black tabular-nums text-slate-700 shrink-0"
                                    title="Open on PO; you can post more if the delivery was heavier than ordered."
                                  >
                                    Open{' '}
                                    {row.remaining.toLocaleString()}
                                    {maxU === 'm' ? ' m' : maxU === 'units' ? ' u' : ' kg'}
                                  </span>
                                </div>
                                <p className="text-[10px] font-bold text-slate-800 leading-tight">
                                  <span className="font-black text-slate-950">{gaugeS}</span>
                                  <span className="text-slate-400 font-semibold"> · </span>
                                  <span className="font-black text-slate-950">{colourS}</span>
                                </p>
                                {row.grnKind === 'stone' || row.grnKind === 'accessory' ? (
                                  <div>
                                    <label className="sr-only">
                                      {row.grnKind === 'stone' ? 'Metres received' : 'Units received'}
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step={row.grnKind === 'stone' ? '0.01' : '1'}
                                      value={row.qtyReceived}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setGrnLines((prev) =>
                                          prev.map((r, i) => (i === idx ? { ...r, qtyReceived: v } : r))
                                        );
                                      }}
                                      placeholder={row.grnKind === 'stone' ? 'Metres' : 'Units'}
                                      className="w-full rounded border border-slate-200 py-1.5 px-2 text-xs font-black text-[#134e4a]"
                                    />
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    <div>
                                      <label className="sr-only">Kilograms received</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={row.qtyReceived}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setGrnLines((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, qtyReceived: v } : r))
                                          );
                                        }}
                                        placeholder="Kg"
                                        className="w-full rounded border border-slate-200 py-1.5 px-2 text-xs font-black text-[#134e4a]"
                                      />
                                    </div>
                                    <div>
                                      <label className="sr-only">Coil number</label>
                                      <input
                                        value={row.coilNo}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setGrnLines((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, coilNo: v } : r))
                                          );
                                        }}
                                        placeholder="Coil #"
                                        title="Suggested from register; edit if tag differs."
                                        className="w-full rounded border border-slate-200 py-1.5 px-2 text-xs font-black font-mono text-slate-900"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              );
                            })
                          )}
                          {grnLines.length > 0 &&
                          grnLines.some((r) => r.grnKind === 'coil') &&
                          ws?.hasPermission?.('purchase_orders.manage') ? (
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50/90 p-2 text-[9px] font-bold text-amber-950">
                              <input
                                type="checkbox"
                                checked={grnConversionOverride}
                                onChange={(e) => setGrnConversionOverride(e.target.checked)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-amber-400"
                              />
                              <span>Override conversion checks (audited).</span>
                            </label>
                          ) : null}
                          {grnLines.length > 0 ? (
                            <button
                              type="submit"
                              className="w-full rounded-lg bg-[#134e4a] text-white text-[10px] font-black uppercase tracking-wide py-2 hover:bg-[#0f3d39]"
                            >
                              Confirm receipt
                            </button>
                          ) : null}
                        </form>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
                </>
              )}
            </div>
          </section>

            <section className="z-soft-panel overflow-hidden w-full min-w-0 flex flex-col lg:col-span-2">
              <div className="h-1 bg-[#134e4a] shrink-0 opacity-80" />
              <div className="p-3 sm:p-4 flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Scale size={14} className="text-[#134e4a]" />
                  {stockReceiveKind === 'coil'
                    ? 'Received coils — live weight'
                    : stockReceiveKind === 'stone'
                      ? 'Received stone — live metres'
                      : 'Received accessories — live qty'}
                </h3>
                {stockReceiveKind === 'coil' ? (
                  <>
                    {coilLotsReceiptSorted.length === 0 ? (
                    <p className="text-[10px] font-medium text-slate-400">
                      No coils yet — confirm a receipt in the panel on the left.
                    </p>
                  ) : coilLotsReceiptFiltered.length === 0 ? (
                    <p className="text-[10px] font-medium text-slate-400">No coils match your search.</p>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 mb-2 shrink-0">
                        <label className="relative min-w-0 w-full flex-1 sm:min-w-[140px]">
                          <Search
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={coilLiveSearch}
                            onChange={(e) => setCoilLiveSearch(e.target.value)}
                            placeholder="Search coil, PO, colour…"
                            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-[10px] font-medium text-slate-800 placeholder:text-slate-400"
                          />
                        </label>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                            Sort
                          </span>
                          <select
                            value={coilLiveSort}
                            onChange={(e) => setCoilLiveSort(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[10px] font-semibold text-slate-700 min-w-0 max-w-full"
                          >
                            <option value="recent">Newest receipt</option>
                            <option value="kgDesc">Current kg (high → low)</option>
                            <option value="kgAsc">Current kg (low → high)</option>
                            <option value="coilAsc">Coil no (A → Z)</option>
                            <option value="gaugeAsc">Gauge</option>
                            <option value="materialAsc">Material</option>
                          </select>
                        </div>
                      </div>
                      {coilsReceiptTruncated ? (
                        <p className="text-[9px] text-slate-500 mb-1.5">
                          Showing {STOCK_SIDE_LIST_LIMIT} of {coilLotsReceiptFiltered.length}. Search to find older coils.
                        </p>
                      ) : null}
                      <ul className="space-y-1.5">
                        {coilLotsByReceipt.map((c) => {
                          const live = liveCoilWeightKg(c);
                          const material = c.materialTypeName || c.productID || '—';
                          const meta2 = [
                            c.colour || null,
                            c.gaugeLabel || null,
                            c.poID ? `PO ${c.poID}` : null,
                            c.receivedAtISO ? `Rcvd ${c.receivedAtISO}` : null,
                            `${live.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg current`,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <li key={`${c.coilNo}-${c.poID || ''}-${c.lineKey || ''}`}>
                              <button
                                type="button"
                                onClick={() => navigate(`/operations/coils/${encodeURIComponent(c.coilNo)}`)}
                                className="w-full text-left rounded-lg border border-slate-200/60 bg-white/40 py-1 px-2 shadow-sm backdrop-blur-md hover:bg-white/70 transition-colors group"
                              >
                                <div className="min-w-0 leading-tight">
                                  <div className="flex items-center justify-between gap-2 min-w-0">
                                    <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                      {c.coilNo}
                                      <span className="font-medium text-slate-600"> · {material}</span>
                                    </p>
                                    <span className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 group-hover:bg-sky-200 px-2 py-1 rounded-md shrink-0">
                                      Open
                                    </span>
                                  </div>
                                  <p
                                    className="text-[9px] font-semibold text-slate-600 mt-0.5 leading-snug line-clamp-2"
                                    title={meta2}
                                  >
                                    {meta2}
                                  </p>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  </>
                ) : skuProductsLiveSorted.length === 0 ? (
                  <p className="text-[10px] font-medium text-slate-400">
                    No {stockReceiveKind === 'stone' ? 'stone-coated' : 'accessory'} SKUs in catalog yet — create a PO
                    or receipt in Procurement.
                  </p>
                ) : skuProductsReceiptFiltered.length === 0 ? (
                  <p className="text-[10px] font-medium text-slate-400">No rows match your search.</p>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 mb-2 shrink-0">
                      <label className="relative min-w-0 w-full flex-1 sm:min-w-[140px]">
                        <Search
                          size={12}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={coilLiveSearch}
                          onChange={(e) => setCoilLiveSearch(e.target.value)}
                          placeholder="Search SKU or name…"
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-[10px] font-medium text-slate-800 placeholder:text-slate-400"
                        />
                      </label>
                    </div>
                    {skuReceiptTruncated ? (
                      <p className="text-[9px] text-slate-500 mb-1.5">
                        Showing {STOCK_SIDE_LIST_LIMIT} of {skuProductsReceiptFiltered.length}. Search for more SKUs.
                      </p>
                    ) : null}
                    <ul className="space-y-1.5">
                      {skuProductsByReceipt.map((p) => {
                        const live = Number(p.stockLevel) || 0;
                        const u = String(p.unit || '').trim() || (stockReceiveKind === 'stone' ? 'm' : 'u');
                        const meta2 = [
                          p.productID,
                          `Live ${live.toLocaleString()} ${u}`,
                        ].join(' · ');
                        return (
                          <li key={p.productID}>
                            <button
                              type="button"
                              onClick={() =>
                                setProductMovementModal({
                                  productID: p.productID,
                                  name: p.name || p.productID,
                                  unit: u,
                                })
                              }
                              className="w-full text-left rounded-lg border border-slate-200/60 bg-white/40 py-1.5 px-2.5 shadow-sm backdrop-blur-md hover:bg-white/70 transition-colors group"
                            >
                              <div className="min-w-0 leading-tight">
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                    <span className="font-mono">{p.productID}</span>
                                    <span className="font-medium text-slate-600"> · {p.name || '—'}</span>
                                  </p>
                                  <span className="text-[10px] font-black text-[#134e4a] tabular-nums shrink-0">
                                    {live.toLocaleString()} {u}
                                  </span>
                                </div>
                                <p
                                  className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                  title={meta2}
                                >
                                  {meta2} · tap for movements
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
        ) : null}

        {activeTab === 'inventory' ? (
        <div className="col-span-full mb-2 order-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowStockAdjust(true)}
              className="z-btn-secondary"
            >
                  <Box size={16} /> Adjust stock
            </button>
            <button
              type="button"
              onClick={() => setShowCoilRequest(true)}
              className="z-btn-primary"
            >
                  <Plus size={16} /> Request coils
            </button>
          </div>
        </div>
        ) : null}

        {activeTab === 'inventory' ? (
        <div className="col-span-full mb-2 order-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <Package size={12} /> Total stock
              </p>
              <p className="mt-1 text-xl font-black text-[#134e4a] tabular-nums">
                {inventoryStats.totalKg.toLocaleString()} <span className="text-[10px] font-semibold">kg</span>
              </p>
              <div className="mt-2 border-t border-slate-100 pt-2 space-y-1 text-[10px]">
                <p className="flex items-center justify-between text-slate-600">
                  <span>Aluminium</span>
                  <span className="font-bold tabular-nums">{inventoryStats.aluminiumKg.toLocaleString()} kg</span>
                </p>
                <p className="flex items-center justify-between text-slate-600">
                  <span>Aluzinc</span>
                  <span className="font-bold tabular-nums">{inventoryStats.aluzincKg.toLocaleString()} kg</span>
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Conversion efficiency</p>
              <p className="mt-1 text-xl font-black text-[#134e4a] tabular-nums">
                {conversionStats.efficiencyPct != null ? `${conversionStats.efficiencyPct}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-red-700 flex items-center gap-1">
                <AlertTriangle size={12} /> Low coils (&lt;100kg)
              </p>
              <p className="mt-1 text-xl font-black text-red-700 tabular-nums">{inventoryStats.lowStock}</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-teal-700 flex items-center gap-1">
                <Award size={12} /> Top materials
              </p>
              <div className="mt-1 space-y-1">
                {inventoryStats.topMaterials.length === 0 ? (
                  <p className="text-[10px] text-teal-700">No active coils</p>
                ) : (
                  inventoryStats.topMaterials.map((row, idx) => (
                    <p key={`${row.gauge}-${row.colour}-${row.material}-${idx}`} className="text-[10px] text-teal-700 tabular-nums truncate">
                      <span className="font-bold text-[#134e4a]">{idx + 1}.</span> {row.gauge} mm · {row.colour} ·{' '}
                      <span className="font-semibold">{row.kg.toLocaleString()} kg</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {activeTab !== 'inventory' ? (
        <div className="lg:col-span-4 order-1 lg:order-2">
          <MainPanel>
            {activeTab === 'production' ? (
              <WorkspacePanelToolbar
                title={PANEL_TITLE[activeTab] ?? 'Records'}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search SKUs…"
              />
            ) : activeTab === 'coilControl' ? (
              <WorkspacePanelToolbar title={PANEL_TITLE.coilControl} />
            ) : null}

            <div className="space-y-4">
              {activeTab === 'coilControl' ? <OperationsCoilControlTab /> : null}

              {activeTab === 'production' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start -mt-1">
                  {/* Left 1/3 — in progress / need action */}
                  <section className="space-y-4 lg:col-span-1 order-1 min-w-0 flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">
                          In progress · need action
                        </h3>
                        <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                          Planned or running jobs. Open trace to allocate coils, start, complete, or cancel (releases
                          reservations when abandoned).
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                        Sort
                        <select
                          value={productionActiveSortKey}
                          onChange={(e) => setProductionActiveSortKey(e.target.value)}
                          className="max-w-[9.5rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold normal-case text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25"
                        >
                          <option value="attention">Attention</option>
                          <option value="id">Cutting list ID</option>
                          <option value="customer">Customer A–Z</option>
                          <option value="status">Status A–Z</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Jobs waiting</p>
                        <p className="mt-0.5 text-lg font-black text-[#134e4a] tabular-nums">
                          {productionQueueStats.waiting}
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-amber-800">No coil</p>
                        <p className="mt-0.5 text-lg font-black text-amber-800 tabular-nums">
                          {productionQueueStats.noCoil}
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-red-800">Mgr review</p>
                        <p className="mt-0.5 text-lg font-black text-red-800 tabular-nums">
                          {productionQueueStats.needsReview}
                        </p>
                      </div>
                      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-rose-800">Overdue</p>
                        <p className="mt-0.5 text-lg font-black text-rose-800 tabular-nums">
                          {productionQueueStats.overdue}
                        </p>
                      </div>
                    </div>

                    {ws?.hasWorkspaceData && jobsNeedingManagerReview.length > 0 ? (
                      <div className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-3 text-sm text-red-950 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-800 flex items-center gap-2">
                          <AlertTriangle size={16} className="shrink-0" />
                          Manager review queue
                        </p>
                        <p className="mt-2 text-[10px] text-red-900/90 leading-snug">
                          Conversion outside agreed bands — resolve from traceability.
                        </p>
                        <ul className="mt-2 space-y-1 text-[10px] font-semibold">
                          {jobsReviewPage.slice.map((j) => (
                            <li key={j.jobID} className="font-mono text-red-950">
                              {j.cuttingListId || j.jobID}
                            </li>
                          ))}
                        </ul>
                        <AppTablePager
                          showingFrom={jobsReviewPage.showingFrom}
                          showingTo={jobsReviewPage.showingTo}
                          total={jobsReviewPage.total}
                          hasPrev={jobsReviewPage.hasPrev}
                          hasNext={jobsReviewPage.hasNext}
                          onPrev={jobsReviewPage.goPrev}
                          onNext={jobsReviewPage.goNext}
                          pageSize={PRODUCTION_TABLE_PAGE_SIZE}
                        />
                      </div>
                    ) : null}

                    {ws?.hasWorkspaceData && productionActiveRows.length > 0 ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-sm flex flex-col">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-900">Live jobs</p>
                        <ul className="mt-2 space-y-1.5">
                          {productionActivePage.slice.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-100 bg-white/90 px-2.5 py-2"
                            >
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] font-bold text-[#134e4a]">{item.id}</p>
                                <p className="text-[9px] text-slate-600 truncate">
                                  {item.customer} · {item.status || '—'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  openTraceWithHint(item, 'Allocate coils, start, complete, or cancel from this panel.')
                                }
                                className="shrink-0 text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-sky-300 bg-white text-sky-900 hover:bg-sky-50"
                              >
                                Open trace
                              </button>
                            </li>
                          ))}
                        </ul>
                        <AppTablePager
                          showingFrom={productionActivePage.showingFrom}
                          showingTo={productionActivePage.showingTo}
                          total={productionActivePage.total}
                          hasPrev={productionActivePage.hasPrev}
                          hasNext={productionActivePage.hasNext}
                          onPrev={productionActivePage.goPrev}
                          onNext={productionActivePage.goNext}
                          pageSize={PRODUCTION_TABLE_PAGE_SIZE}
                        />
                      </div>
                    ) : ws?.hasWorkspaceData ? (
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        No in-progress jobs in this workspace. Closed and finished records are on the right.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Connect to the live workspace to see in-progress production jobs.
                      </p>
                    )}
                  </section>

                  {/* Right 2/3 — closed / finished / complete + reference-check detail */}
                  <section className="space-y-4 lg:col-span-2 order-2 min-w-0 flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-black uppercase tracking-wide text-[#134e4a]">
                          Closed · finished · complete
                        </h3>
                        <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                          Completed and cancelled production records. Four-reference conversion summary appears on each
                          row when checks exist for that cutting list (open trace for full coil breakdown).
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                        Sort
                        <select
                          value={productionClosedSortKey}
                          onChange={(e) => setProductionClosedSortKey(e.target.value)}
                          className="max-w-[9.5rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold normal-case text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25"
                        >
                          <option value="attention">Attention</option>
                          <option value="id">Cutting list ID</option>
                          <option value="customer">Customer A–Z</option>
                          <option value="status">Status A–Z</option>
                        </select>
                      </label>
                    </div>

                    <div
                      className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50/90 p-1 gap-1"
                      role="group"
                      aria-label="Filter closed production records"
                    >
                      {(ws?.hasWorkspaceData
                        ? [
                            { id: 'all', label: 'All closed' },
                            { id: 'completed', label: 'Completed' },
                            { id: 'cancelled', label: 'Cancelled' },
                          ]
                        : [
                            { id: 'all', label: 'All' },
                            { id: 'waiting', label: 'Waiting' },
                            { id: 'running', label: 'In progress' },
                            { id: 'needs_review', label: 'Needs review' },
                            { id: 'done', label: 'Done' },
                          ]
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setProductionFilter(f.id)}
                          className={`px-2.5 py-1.5 rounded-md text-[8px] font-semibold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 ${
                            productionFilter === f.id
                              ? 'bg-[#134e4a] text-white shadow-sm'
                              : 'text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {productionQueueRows.length === 0 ? (
                      <div className={WORKSPACE_EMPTY_LIST_CLASS}>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest max-w-lg mx-auto">
                          {productionQueueModel.mode === 'offline'
                            ? 'No lists in queue yet'
                            : 'No rows match this search or filter'}
                        </p>
                        <p className="text-sm text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
                          {productionQueueModel.mode === 'offline'
                            ? 'Create a quotation, post a receipt (50%+ paid), then add a cutting list in Sales.'
                            : productionActiveRows.length > 0
                              ? 'No closed records match this filter — adjust chips or search, or check in-progress on the left.'
                              : 'Try clearing the search box or switching filter chips above.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col w-full">
                        <ul className="space-y-1.5 pr-0.5">
                          {productionClosedPage.slice.map((item) => {
                          const meta2 = [
                            item.spec,
                            item.quantity,
                            ws?.hasWorkspaceData && item.coilLabel ? item.coilLabel : null,
                            item.status,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          const rowTone = item.needsCoil
                            ? 'border-amber-300/80 bg-amber-50/50'
                            : item.managerReviewRequired
                              ? 'border-red-300/80 bg-red-50/45'
                              : item.overdue
                                ? 'border-rose-300/80 bg-rose-50/45'
                                : 'border-slate-200/60 bg-white/40 hover:bg-white/70';
                          const priorityChip =
                            item.priority === 'High'
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : item.priority === 'Done'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : item.priority === 'Cancelled'
                                  ? 'border-slate-300 bg-slate-100 text-slate-700'
                                  : item.priority === 'Waiting' || item.priority === 'Wait'
                                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-slate-200 bg-slate-50 text-slate-600';
                          return (
                            <li
                              key={`${item.queueKind}-${item.id}`}
                              className={`rounded-lg border py-1.5 px-2.5 shadow-sm backdrop-blur-md transition-colors ${rowTone}`}
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => openProductionQueueRow(item)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openProductionQueueRow(item);
                                  }
                                }}
                                className="min-w-0 leading-tight cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 -m-0.5 p-0.5"
                              >
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                    <span className="font-mono">{item.id}</span>
                                    <span className="font-medium text-slate-600"> · {item.customer}</span>
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${priorityChip}`}
                                    >
                                      {item.priority}
                                    </span>
                                    <span className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 px-2 py-1 rounded-md">
                                      Trace
                                    </span>
                                  </div>
                                </div>
                                <p
                                  className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                  title={meta2}
                                >
                                  {meta2}
                                </p>
                                {ws?.hasWorkspaceData
                                  ? (() => {
                                      const clId = String(item.cuttingListId || item.id || '').trim();
                                      const chk = clId ? conversionChecksByCuttingListId.get(clId) : null;
                                      const sum = chk?.length
                                        ? summarizeConversionChecksForCuttingList(chk, formatVariancePct)
                                        : null;
                                      if (!sum) return null;
                                      const w = String(sum.worst || 'OK');
                                      const alertTone =
                                        w === 'High'
                                          ? 'border-red-200 bg-red-50 text-red-800'
                                          : w === 'Low'
                                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                                            : w === 'Watch'
                                              ? 'border-sky-200 bg-sky-50 text-sky-900'
                                              : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                                      return (
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100/90 pt-1.5">
                                          <span className="text-[7px] font-bold uppercase tracking-wide text-slate-400">
                                            4-ref
                                          </span>
                                          <span
                                            className={`text-[7px] font-semibold uppercase px-1.5 py-0.5 rounded border ${alertTone}`}
                                          >
                                            {sum.worst}
                                          </span>
                                          <span className="text-[8px] text-slate-600 tabular-nums">{sum.deltaLabel}</span>
                                          <span className="text-[8px] text-slate-500">
                                            · {sum.count} coil line{sum.count === 1 ? '' : 's'}
                                          </span>
                                        </div>
                                      );
                                    })()
                                  : null}
                              </div>
                              {!item.completed ? (
                                <div className="flex flex-wrap gap-1.5 pt-1.5 mt-1 border-t border-dashed border-slate-200">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTraceWithHint(item, 'Open coil assignment inside traceability.');
                                    }}
                                    className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
                                  >
                                    Assign coil
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTraceWithHint(item, 'Open run log and start production for this job.');
                                    }}
                                    className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
                                  >
                                    Start run
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestMarkComplete(item);
                                    }}
                                    className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/35"
                                  >
                                    Mark complete
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <AppTablePager
                        showingFrom={productionClosedPage.showingFrom}
                        showingTo={productionClosedPage.showingTo}
                        total={productionClosedPage.total}
                        hasPrev={productionClosedPage.hasPrev}
                        hasNext={productionClosedPage.hasNext}
                        onPrev={productionClosedPage.goPrev}
                        onNext={productionClosedPage.goNext}
                        pageSize={PRODUCTION_TABLE_PAGE_SIZE}
                      />
                      </div>
                    )}
                  </section>
                </div>
              ) : null}

            </div>
          </MainPanel>
        </div>
        ) : null}
      </div>

      <ModalFrame isOpen={showStockAdjust} onClose={closeStockAdjustModal}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Adjust stock</h3>
              <button
                type="button"
                onClick={closeStockAdjustModal}
                className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              >
                <X size={22} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={applyStockAdjust}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Item
                </label>
                <select
                  required
                  value={stockAdjust.productID}
                  onChange={(e) => {
                    setStockAdjustCoilPrompt(false);
                    setStockAdjustCoilAck(false);
                    setStockAdjustCoilCount(null);
                    setStockAdjust((s) => ({ ...s, productID: e.target.value }));
                  }}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select item…</option>
                  {inventoryRows.map((r) => (
                    <option key={r.productID} value={r.productID}>
                      {r.name} ({r.productID})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Adjustment type
                  </label>
                  <select
                    value={stockAdjust.type}
                    onChange={(e) => {
                      setStockAdjustCoilPrompt(false);
                      setStockAdjustCoilAck(false);
                      setStockAdjustCoilCount(null);
                      setStockAdjust((s) => ({ ...s, type: e.target.value }));
                    }}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  >
                    <option value="Increase">Increase</option>
                    <option value="Decrease">Decrease</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Quantity
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={stockAdjust.qty}
                    onChange={(e) =>
                      setStockAdjust((s) => ({ ...s, qty: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Reason code
                </label>
                <select
                  value={stockAdjust.reasonCode}
                  onChange={(e) =>
                    setStockAdjust((s) => ({ ...s, reasonCode: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  {ADJUST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Notes {stockAdjust.reasonCode === 'Other' ? '(required)' : '(optional)'}
                </label>
                <textarea
                  rows={2}
                  value={stockAdjust.reasonNote}
                  onChange={(e) =>
                    setStockAdjust((s) => ({ ...s, reasonNote: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={stockAdjust.date}
                  onChange={(e) =>
                    setStockAdjust((s) => ({ ...s, date: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              {stockAdjustCoilPrompt && stockAdjust.type === 'Decrease' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 text-sm text-amber-950">
                  <p className="font-medium flex gap-2 items-start">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <span>
                      This SKU has{' '}
                      {stockAdjustCoilCount != null
                        ? `${stockAdjustCoilCount} coil lot(s)`
                        : 'coil lot(s)'}{' '}
                      in this branch. Prefer <strong>Coil control</strong> (split / scrap / return) so tags match the
                      floor.
                    </span>
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-amber-300"
                      checked={stockAdjustCoilAck}
                      onChange={(e) => setStockAdjustCoilAck(e.target.checked)}
                    />
                    <span>I need a book-only decrease anyway (SKU only; coil rows stay unchanged).</span>
                  </label>
                </div>
              ) : null}
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Post adjustment
              </button>
            </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showCoilRequest} onClose={() => setShowCoilRequest(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Request coils</h3>
            <button
              type="button"
              onClick={() => setShowCoilRequest(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-4">
            Submit one or more coil lines. Requests appear on the operations dashboard for MD/procurement follow-up.
          </p>
          <form className="space-y-4" onSubmit={submitCoilRequest}>
            <div className="space-y-3">
              {coilRequestForm.rows.map((row, idx) => (
                <div key={`rq-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Request line {idx + 1}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={row.gauge}
                      onChange={(e) =>
                        setCoilRequestForm((f) => ({
                          ...f,
                          rows: f.rows.map((x, i) => (i === idx ? { ...x, gauge: e.target.value } : x)),
                        }))
                      }
                      placeholder="Gauge (mm)"
                      className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                    />
                    <input
                      value={row.colour}
                      onChange={(e) =>
                        setCoilRequestForm((f) => ({
                          ...f,
                          rows: f.rows.map((x, i) => (i === idx ? { ...x, colour: e.target.value } : x)),
                        }))
                      }
                      placeholder="Colour / finish"
                      className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={row.materialType}
                      onChange={(e) =>
                        setCoilRequestForm((f) => ({
                          ...f,
                          rows: f.rows.map((x, i) => (i === idx ? { ...x, materialType: e.target.value } : x)),
                        }))
                      }
                      placeholder="Material type"
                      className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                    />
                    <input
                      value={row.requestedKg}
                      onChange={(e) =>
                        setCoilRequestForm((f) => ({
                          ...f,
                          rows: f.rows.map((x, i) => (i === idx ? { ...x, requestedKg: e.target.value } : x)),
                        }))
                      }
                      placeholder="Approx kg"
                      className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    {coilRequestForm.rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCoilRequestForm((f) => ({ ...f, rows: f.rows.filter((_, i) => i !== idx) }))
                        }
                        className="text-[10px] font-semibold text-rose-700 hover:text-rose-900"
                      >
                        Remove line
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setCoilRequestForm((f) => ({
                  ...f,
                  rows: [...f.rows, { gauge: '', colour: '', materialType: '', requestedKg: '' }],
                }))
              }
              className="z-btn-secondary w-full justify-center"
            >
              <Plus size={14} /> Add another line
            </button>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Note (optional)
              </label>
              <textarea
                rows={2}
                value={coilRequestForm.note}
                onChange={(e) =>
                  setCoilRequestForm((f) => ({ ...f, note: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-medium outline-none resize-none"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Submit requests
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={completeChecklistModal != null}
        onClose={() => setCompleteChecklistModal(null)}
      >
        <div className="z-modal-panel max-w-lg p-8">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xl font-bold text-[#134e4a]">Complete job checklist</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Confirm all production postings before completion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCompleteChecklistModal(null)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>
          <div className="space-y-3">
            {[
              { key: 'transferPosted', label: 'Material transfer to production is posted' },
              { key: 'runLogPosted', label: 'Run log / output meters are recorded' },
              { key: 'conversionChecked', label: 'Conversion check reviewed (including variance)' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#134e4a] focus:ring-[#134e4a]/20"
                  checked={completeChecklist[item.key]}
                  onChange={(e) =>
                    setCompleteChecklist((s) => ({ ...s, [item.key]: e.target.checked }))
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={confirmMarkCompleteChecklist}
              className="z-btn-primary flex-1 justify-center"
            >
              Continue to mark complete
            </button>
            <button
              type="button"
              onClick={() => setCompleteChecklistModal(null)}
              className="z-btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={productionTraceModal != null}
        onClose={() => setProductionTraceModal(null)}
      >
        <div className="z-modal-panel w-full min-w-0 max-w-[min(36rem,calc(100dvw-1.25rem))] sm:max-w-[min(40rem,calc(100dvw-2rem))] max-h-[min(92dvh,900px)] flex flex-col p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-xl sm:rounded-[28px]">
          {productionTraceModal?.type === 'trace' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-y-contain p-2 sm:p-3">
                <LiveProductionMonitor
                  focusCuttingListId={productionTraceModal.cuttingListId}
                  hideJobSidebar
                  inModal
                  viewOnly={Boolean(productionTraceModal.completed)}
                  onModalClose={() => setProductionTraceModal(null)}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[#134e4a]">Queued cutting list</h3>
                  {productionTraceModal?.type === 'pending' ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      <span className="font-mono font-semibold text-slate-700">{productionTraceModal.id}</span> — connect
                      the API to send this list to the production line from Sales.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setProductionTraceModal(null)}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-xl shrink-0"
                  aria-label="Close"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {productionTraceModal?.type === 'pending' ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-sm text-slate-600 space-y-3">
                    <p>
                      <span className="font-semibold text-slate-800">Customer:</span> {productionTraceModal.customer}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Spec / ref:</span> {productionTraceModal.spec}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Quantity:</span> {productionTraceModal.quantity}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Priority:</span> {productionTraceModal.priority}
                    </p>
                    <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                      Connect the API server to register this list for production and use full coil allocation, run logging,
                      and conversion checks in traceability.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={productMovementModal != null}
        onClose={() => setProductMovementModal(null)}
      >
        <div className="z-modal-panel max-w-lg w-full max-h-[85vh] flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#134e4a]">Stock movements</h3>
              <p className="text-[10px] text-slate-500 mt-1 font-mono break-all">
                {productMovementModal?.productID}
              </p>
              <p className="text-xs text-slate-700 mt-0.5 line-clamp-2">{productMovementModal?.name}</p>
            </div>
            <button
              type="button"
              onClick={() => setProductMovementModal(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg">
            {productMovementsLoading ? (
              <p className="text-xs text-slate-500 p-4">Loading…</p>
            ) : productMovementsRows.length === 0 ? (
              <p className="text-xs text-slate-500 p-4">No movements recorded for this SKU.</p>
            ) : (
              <div className="flex flex-col min-h-0">
                <AppTableWrap className="shadow-none rounded-none border-0">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">When</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productMovementsPage.slice.map((m) => {
                        const typeTitle = [m.type, m.ref, m.detail].filter(Boolean).join(' · ');
                        return (
                          <tr key={m.id} className="hover:bg-teal-50/30">
                            <td className="py-2 px-3 text-slate-700 whitespace-nowrap font-mono text-[13px]">
                              {m.dateISO || m.atISO?.slice(0, 10) || '—'}
                            </td>
                            <td className="max-w-0 py-2 px-3 text-slate-600 whitespace-nowrap truncate" title={typeTitle}>
                              <span className="font-semibold">{m.type}</span>
                              {m.ref ? <span className="text-slate-500"> · {m.ref}</span> : null}
                            </td>
                            <td className="py-2 px-3 text-right font-bold tabular-nums text-[#134e4a]">
                              {m.qty != null ? Number(m.qty).toLocaleString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </AppTableWrap>
                <div className="shrink-0 border-t border-slate-100 bg-white px-2 py-2">
                  <AppTablePager
                    showingFrom={productMovementsPage.showingFrom}
                    showingTo={productMovementsPage.showingTo}
                    total={productMovementsPage.total}
                    hasPrev={productMovementsPage.hasPrev}
                    hasNext={productMovementsPage.hasNext}
                    onPrev={productMovementsPage.goPrev}
                    onNext={productMovementsPage.goNext}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Operations;
