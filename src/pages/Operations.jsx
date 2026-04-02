import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Factory,
  Award,
  ChevronRight,
  Scale,
} from 'lucide-react';

import { WorkspacePanelToolbar } from '../components/workspace';
import { WORKSPACE_TABLE_HEAD, WORKSPACE_EMPTY_LIST_CLASS } from '../lib/workspaceListStyle';
import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import { LiveProductionMonitor } from '../components/LiveProductionMonitor';
import ProductionDeliveriesTab from '../components/operations/ProductionDeliveriesTab';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { productionJobNeedsManagerReviewAttention } from '../lib/productionReview';

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

const PANEL_TITLE = {
  inventory: 'Stock records',
  production: 'Production queue',
  deliveries: 'Deliveries',
};

/** Matches `confirmStoreReceipt` — POs store can post GRN against */
const PO_RECEIVABLE_STATUSES = ['Approved', 'On loading', 'In Transit'];

const ADJUST_REASONS = [
  'Damage',
  'Overstock',
  'Count correction',
  'Loss / shrinkage',
  'Other',
];

/** Reasons for coil scrap posting (kg off the physical roll). */
const COIL_SCRAP_REASONS = [
  'Off-cut removed',
  'Damage',
  'Production error / trim',
  'Return — unusable',
  'Other',
];

const COIL_RETURN_REASONS = [
  'Weighbridge / count correction',
  'Material returned from shop floor',
  'Returned unused from job',
  'Other',
];

const Operations = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { show: showToast } = useToast();
  const {
    products: inventoryRows,
    purchaseOrders,
    confirmStoreReceipt,
    adjustStock,
    receiveFinishedGoods,
    coilLots,
    wipByProduct,
  } = useInventory();
  const ws = useWorkspace();

  const [activeTab, setActiveTab] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [productionFilter, setProductionFilter] = useState('all');
  const [deliveriesShellBlur, setDeliveriesShellBlur] = useState(false);

  const [showStockAdjust, setShowStockAdjust] = useState(false);
  const [showFinishedGoods, setShowFinishedGoods] = useState(false);
  const [showCoilRequest, setShowCoilRequest] = useState(false);
  const [showCoilMaterial, setShowCoilMaterial] = useState(false);
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

  const [finishedForm, setFinishedForm] = useState({
    coilNo: '',
    qty: '',
    date: '',
    spoolKg: '35',
    wipSourceProductID: '',
    wipQtyReleased: '',
  });
  const [coilLiveSort, setCoilLiveSort] = useState('recent');

  const [coilMaterialTab, setCoilMaterialTab] = useState('split');
  const [coilMaterialSaving, setCoilMaterialSaving] = useState(false);
  const [coilSplitForm, setCoilSplitForm] = useState({
    coilNo: '',
    splitKg: '',
    newCoilNo: '',
    note: '',
    date: '',
  });
  const [coilScrapForm, setCoilScrapForm] = useState({
    coilNo: '',
    kg: '',
    reason: COIL_SCRAP_REASONS[0],
    note: '',
    creditScrapInventory: true,
    scrapProductID: 'SCRAP-COIL',
    date: '',
  });
  const [coilReturnForm, setCoilReturnForm] = useState({
    coilNo: '',
    kg: '',
    reason: COIL_RETURN_REASONS[0],
    note: '',
    date: '',
  });

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
      const completed = status === 'Completed';
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
        quantity: completed
          ? `${actualM.toLocaleString()}m posted`
          : `${plannedM.toLocaleString()}m planned`,
        status,
        coilCount: nCoils,
        coilLabel: !job
          ? 'Syncing production data…'
          : completed
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
        priority:
          completed
            ? 'Done'
            : !job
              ? 'Wait'
              : nCoils === 0 && status === 'Planned'
                ? 'High'
                : job.managerReviewRequired ||
                    (job.endDateISO && job.endDateISO <= new Date().toISOString().slice(0, 10))
                  ? 'High'
                  : 'Normal',
        managerReviewRequired: Boolean(job?.managerReviewRequired),
        needsCoil: !completed && status === 'Planned' && nCoils === 0,
        dueDateISO: job?.endDateISO || null,
        overdue:
          !completed &&
          Boolean(job?.endDateISO) &&
          String(job.endDateISO) < new Date().toISOString().slice(0, 10),
        completed,
        quotationRef: cl.quotationRef || '',
        cuttingListId: cl.id,
      };
    };

    const rows = registered.map(mapRegistered);
    const active = rows.filter((r) => !r.completed);
    const done = rows.filter((r) => r.completed);

    return {
      mode: 'online',
      sections: [
        { key: 'active', title: 'On the line', rows: active.filter(matches) },
        { key: 'completed', title: 'Completed — view record', rows: done.filter(matches) },
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

  const recentConversionChecks = useMemo(() => {
    if (!productionConversionChecks.length) return [];
    return [...productionConversionChecks].slice(0, 8);
  }, [productionConversionChecks]);

  const productionQueueRows = useMemo(() => {
    const rows = productionQueueModel.sections.flatMap((s) => s.rows || []);
    const filtered = rows.filter((row) => {
      if (productionFilter === 'waiting') {
        return row.priority === 'Waiting' || row.priority === 'Wait' || row.status === 'Planned';
      }
      if (productionFilter === 'running') return row.status === 'Running';
      if (productionFilter === 'needs_review') return Boolean(row.managerReviewRequired);
      if (productionFilter === 'done') return Boolean(row.completed);
      return true;
    });
    const priorityScore = (row) => {
      if (row.completed || row.priority === 'Done') return 9;
      if (row.needsCoil) return 0;
      if (row.managerReviewRequired) return 1;
      if (row.overdue) return 2;
      if (row.priority === 'High') return 3;
      if (row.priority === 'Waiting' || row.priority === 'Wait') return 4;
      return 5;
    };
    return [...filtered].sort((a, b) => {
      const pa = priorityScore(a);
      const pb = priorityScore(b);
      if (pa !== pb) return pa - pb;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [productionQueueModel.sections, productionFilter]);

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
  }, [productionQueueModel.sections]);

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
      { id: 'deliveries', icon: <Package size={16} />, label: 'Deliveries' },
    ],
    []
  );

  const handleOpsTab = (id) => {
    setActiveTab(id);
    setSearchQuery('');
    setProductionFilter('all');
  };

  useEffect(() => {
    const t = location.state?.focusOpsTab;
    if (t !== 'deliveries' && t !== 'production') return;
    setActiveTab(t);
    const highlightId = String(location.state?.highlightCuttingListId || '').trim();
    if (t === 'production' && highlightId) setSearchQuery(highlightId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const transitOrders = useMemo(
    () => purchaseOrders.filter((p) => PO_RECEIVABLE_STATUSES.includes(p.status)),
    [purchaseOrders]
  );

  const coilLotsByReceipt = useMemo(() => {
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

  useEffect(() => {
    setGrnConversionOverride(false);
    const po = purchaseOrders.find((p) => p.poID === receiveDraft.poID);
    if (!po) {
      setGrnLines([]);
      return;
    }
    setGrnLines(
      po.lines
        .filter((l) => l.qtyOrdered > l.qtyReceived)
        .map((l) => ({
          lineKey: l.lineKey,
          productID: l.productID,
          productName: l.productName,
          color: l.color,
          gauge: l.gauge,
          remaining: l.qtyOrdered - l.qtyReceived,
          qtyReceived: '',
          weightKg: '',
          coilNo: '',
        }))
    );
  }, [receiveDraft.poID, purchaseOrders]);

  const applyTransitReceipt = async (e) => {
    e.preventDefault();
    if (!receiveDraft.poID) {
      showToast('Select an incoming order.', { variant: 'error' });
      return;
    }
    const entries = grnLines
      .map((row) => ({
        lineKey: row.lineKey,
        productID: row.productID,
        qtyReceived: Number(row.qtyReceived),
        weightKg: row.weightKg,
        coilNo: row.coilNo,
        location: receiveDraft.location,
      }))
      .filter((x) => x.qtyReceived > 0 && !Number.isNaN(x.qtyReceived));
    if (!entries.length) {
      showToast('Enter receive qty (kg) for at least one open line.', { variant: 'error' });
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

  const submitFinishedGoods = async (e) => {
    e.preventDefault();
    const coilNo = finishedForm.coilNo.trim();
    const sourceCoil = coilLots.find((c) => c.coilNo === coilNo);
    if (!sourceCoil) {
      showToast('Select a valid source coil number.', { variant: 'error' });
      return;
    }
    const liveKg = liveCoilWeightKg(sourceCoil);
    if (liveKg >= 100) {
      showToast('Only near-finished coils below 100kg can be closed manually.', { variant: 'error' });
      return;
    }
    const spoolKg = Number(finishedForm.spoolKg);
    if (Number.isNaN(spoolKg) || spoolKg < 35 || spoolKg > 100) {
      showToast('Spool weight must be between 35kg and 100kg.', { variant: 'error' });
      return;
    }
    const wipId = finishedForm.wipSourceProductID.trim();
    const wipQtyStr = String(finishedForm.wipQtyReleased ?? '').trim();
    if ((wipId && !wipQtyStr) || (!wipId && wipQtyStr)) {
      showToast('Link WIP: select both raw material and consumed qty, or leave both empty.', {
        variant: 'error',
      });
      return;
    }
    const wipOpts = wipId
      ? { wipSourceProductID: wipId, wipQtyReleased: wipQtyStr }
      : null;
    const res = await receiveFinishedGoods(
      sourceCoil.productID,
      finishedForm.qty,
      0,
      coilNo,
      finishedForm.date,
      wipOpts,
      { spoolKg, sourceCoilNo: coilNo, markSourceCoilFinished: true }
    );
    if (!res.ok) {
      showToast(res.error, { variant: 'error' });
      return;
    }
    setFinishedForm({
      coilNo: '',
      qty: '',
      date: '',
      spoolKg: '35',
      wipSourceProductID: '',
      wipQtyReleased: '',
    });
    setShowFinishedGoods(false);
    showToast('Manual finished-goods receipt posted — use Production traceability to close live jobs.');
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
    showFinishedGoods ||
    showCoilRequest ||
    showCoilMaterial ||
    completeChecklistModal != null ||
    productionTraceModal != null;

  useEffect(() => {
    if (activeTab !== 'inventory') return undefined;
    if (!ws?.hasWorkspaceData) return undefined;
    const t = window.setInterval(() => {
      void ws.refresh?.();
    }, 15000);
    return () => window.clearInterval(t);
  }, [activeTab, ws]);

  useEffect(() => {
    if (!showCoilMaterial) return;
    const d = new Date().toISOString().slice(0, 10);
    setCoilSplitForm((s) => ({ ...s, date: s.date || d }));
    setCoilScrapForm((s) => ({ ...s, date: s.date || d }));
    setCoilReturnForm((s) => ({ ...s, date: s.date || d }));
  }, [showCoilMaterial]);

  const submitCoilSplit = async (e) => {
    e.preventDefault();
    const coilNo = coilSplitForm.coilNo.trim();
    const splitKg = Number(coilSplitForm.splitKg);
    if (!coilNo) {
      showToast('Select or enter a parent coil.', { variant: 'error' });
      return;
    }
    if (!Number.isFinite(splitKg) || splitKg <= 0) {
      showToast('Enter a positive split weight (kg).', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to post coil moves — workspace is read-only.', { variant: 'error' });
      return;
    }
    setCoilMaterialSaving(true);
    try {
      const { ok, data } = await apiFetch(`/api/coil-lots/${encodeURIComponent(coilNo)}/split`, {
        method: 'POST',
        body: JSON.stringify({
          splitKg,
          newCoilNo: coilSplitForm.newCoilNo.trim() || undefined,
          note: coilSplitForm.note.trim(),
          dateISO: coilSplitForm.date || new Date().toISOString().slice(0, 10),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Split failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(`Split OK — new coil ${data.newCoilNo} (${data.splitKg} kg).`);
      setShowCoilMaterial(false);
    } finally {
      setCoilMaterialSaving(false);
    }
  };

  const submitCoilScrap = async (e) => {
    e.preventDefault();
    const coilNo = coilScrapForm.coilNo.trim();
    const kg = Number(coilScrapForm.kg);
    if (!coilNo) {
      showToast('Select a coil.', { variant: 'error' });
      return;
    }
    if (!Number.isFinite(kg) || kg <= 0) {
      showToast('Enter scrap weight (kg).', { variant: 'error' });
      return;
    }
    if (coilScrapForm.reason === 'Other' && !coilScrapForm.note.trim()) {
      showToast('Add a note for “Other”.', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to post coil moves — workspace is read-only.', { variant: 'error' });
      return;
    }
    setCoilMaterialSaving(true);
    try {
      const { ok, data } = await apiFetch(`/api/coil-lots/${encodeURIComponent(coilNo)}/scrap`, {
        method: 'POST',
        body: JSON.stringify({
          kg,
          reason: coilScrapForm.reason,
          note: coilScrapForm.note.trim(),
          dateISO: coilScrapForm.date || new Date().toISOString().slice(0, 10),
          creditScrapInventory: Boolean(coilScrapForm.creditScrapInventory),
          scrapProductID: coilScrapForm.scrapProductID.trim() || 'SCRAP-COIL',
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Scrap posting failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(`Scrap posted — ${kg} kg off ${coilNo}.`);
      setShowCoilMaterial(false);
    } finally {
      setCoilMaterialSaving(false);
    }
  };

  const submitCoilReturn = async (e) => {
    e.preventDefault();
    const coilNo = coilReturnForm.coilNo.trim();
    const kg = Number(coilReturnForm.kg);
    if (!coilNo) {
      showToast('Select a coil.', { variant: 'error' });
      return;
    }
    if (!Number.isFinite(kg) || kg <= 0) {
      showToast('Enter returned weight (kg).', { variant: 'error' });
      return;
    }
    if (coilReturnForm.reason === 'Other' && !coilReturnForm.note.trim()) {
      showToast('Add a note for “Other”.', { variant: 'error' });
      return;
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to post coil moves — workspace is read-only.', { variant: 'error' });
      return;
    }
    setCoilMaterialSaving(true);
    try {
      const { ok, data } = await apiFetch(`/api/coil-lots/${encodeURIComponent(coilNo)}/return-material`, {
        method: 'POST',
        body: JSON.stringify({
          kg,
          reason: coilReturnForm.reason,
          note: coilReturnForm.note.trim(),
          dateISO: coilReturnForm.date || new Date().toISOString().slice(0, 10),
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Return-to-stock failed.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast(`Return posted — ${kg} kg added back on ${coilNo}.`);
      setShowCoilMaterial(false);
    } finally {
      setCoilMaterialSaving(false);
    }
  };

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
    <PageShell blurred={isAnyModalOpen || deliveriesShellBlur}>
      <PageHeader
        title="Store & production"
        subtitle="Receive in-transit coils into stock, adjustments, finished goods & coil requests — aligned with Sales / Procurement."
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:max-w-3xl">
            <PageTabs tabs={opsTabs} value={activeTab} onChange={handleOpsTab} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
        {activeTab === 'inventory' ? (
        <div className="col-span-full w-full order-2">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-stretch lg:min-h-[50vh]">
            <section className="z-soft-panel overflow-hidden w-full lg:w-1/2 lg:flex-1 min-w-0 flex flex-col min-h-[280px] lg:min-h-0">
            <div className="h-1 bg-teal-500 shrink-0 opacity-80" />
            <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0">
              <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Truck size={14} className="text-sky-700" />
                Goods in transit — receive
              </h3>
              <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                Store sees spec & quantities only (no amounts). Enter coil # and kg received; stock updates when you
                confirm.
              </p>
              {transitOrders.length === 0 ? (
                <p className="text-[10px] font-medium text-slate-400">Nothing on road or loading.</p>
              ) : (
                <ul className="space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1">
                  {transitOrders.map((p) => (
                    <li
                      key={p.poID}
                      className="rounded-xl border border-slate-200/60 bg-white/40 p-3 shadow-sm backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-[#134e4a]">{p.poID}</p>
                          <p className="text-[9px] text-slate-600 font-medium truncate">{p.supplierName}</p>
                          <p className="text-[8px] text-slate-500 mt-0.5">
                            {p.status}
                            {p.transportAgentName ? ` · ${p.transportAgentName}` : ''}
                            {p.expectedDeliveryISO ? ` · ETA ${p.expectedDeliveryISO}` : ''}
                          </p>
                        </div>
                        {expandedReceivePoId !== p.poID ? (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedReceivePoId(p.poID);
                              setReceiveDraft((d) => ({ ...d, poID: p.poID }));
                            }}
                            className="text-[9px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2.5 py-1.5 rounded-md shrink-0"
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
                            className="text-[9px] font-semibold text-slate-500 hover:text-slate-800 uppercase"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 text-[9px] text-slate-500 border-t border-slate-100 pt-1.5">
                        {p.lines.length} line(s) ·{' '}
                        {p.lines
                          .reduce((sum, l) => sum + Math.max(0, Number(l.qtyOrdered) - Number(l.qtyReceived)), 0)
                          .toLocaleString()}{' '}
                        kg open
                      </p>
                      {expandedReceivePoId === p.poID ? (
                        <form className="mt-3 space-y-3 border-t border-dashed border-slate-200 pt-3" onSubmit={applyTransitReceipt}>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                              Location (optional)
                            </label>
                            <input
                              value={receiveDraft.location}
                              onChange={(e) =>
                                setReceiveDraft((s) => ({ ...s, location: e.target.value }))
                              }
                              placeholder="Bay / rack"
                              className="w-full rounded-lg border border-slate-200 py-2 px-2 text-xs font-medium"
                            />
                          </div>
                          {grnLines.length === 0 ? (
                            <p className="text-[10px] text-amber-700">No open lines on this order.</p>
                          ) : (
                            grnLines.map((row, idx) => (
                              <div
                                key={row.lineKey || idx}
                                className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:p-4 space-y-2"
                              >
                                <p className="text-[10px] font-bold text-[#134e4a]">{row.productName}</p>
                                <p className="text-[9px] text-slate-500">
                                  Max {row.remaining.toLocaleString()} kg
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">
                                      Kg in
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      max={row.remaining}
                                      value={row.qtyReceived}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setGrnLines((prev) =>
                                          prev.map((r, i) => (i === idx ? { ...r, qtyReceived: v } : r))
                                        );
                                      }}
                                      className="w-full rounded border border-slate-200 py-2 px-2 text-xs font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">
                                      Wt kg
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={row.weightKg}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setGrnLines((prev) =>
                                          prev.map((r, i) => (i === idx ? { ...r, weightKg: v } : r))
                                        );
                                      }}
                                      className="w-full rounded border border-slate-200 py-2 px-2 text-xs font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">
                                      Coil #
                                    </label>
                                    <input
                                      value={row.coilNo}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setGrnLines((prev) =>
                                          prev.map((r, i) => (i === idx ? { ...r, coilNo: v } : r))
                                        );
                                      }}
                                      placeholder="Auto"
                                      className="w-full rounded border border-slate-200 py-2 px-2 text-xs font-bold"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                          {grnLines.length > 0 && ws?.hasPermission?.('purchase_orders.manage') ? (
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-[10px] font-medium text-amber-950">
                              <input
                                type="checkbox"
                                checked={grnConversionOverride}
                                onChange={(e) => setGrnConversionOverride(e.target.checked)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-amber-400"
                              />
                              <span>
                                Override GRN conversion checks (PO kg/m vs entry, weight vs metres×conversion). Use only
                                with documented variance — logged to audit.
                              </span>
                            </label>
                          ) : null}
                          {grnLines.length > 0 ? (
                            <button
                              type="submit"
                              className="w-full rounded-lg bg-[#134e4a] text-white text-[10px] font-bold uppercase tracking-wide py-2.5 hover:bg-[#0f3d39]"
                            >
                              Confirm receipt → inventory
                            </button>
                          ) : null}
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

            <section className="z-soft-panel overflow-hidden w-full lg:w-1/2 lg:flex-1 min-w-0 flex flex-col min-h-[280px] lg:min-h-0">
              <div className="h-1 bg-[#134e4a] shrink-0 opacity-80" />
              <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0">
                <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Scale size={14} className="text-[#134e4a]" />
                  Received coils — live weight
                </h3>
                <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                  Every coil from store GRN. <strong>Current kg</strong> is the live weight left on the coil
                  (after production has used material).
                </p>
                {coilLotsByReceipt.length === 0 ? (
                  <p className="text-[10px] font-medium text-slate-400">
                    No coils yet — confirm a receipt in the panel on the left.
                  </p>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Sort</p>
                      <select
                        value={coilLiveSort}
                        onChange={(e) => setCoilLiveSort(e.target.value)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700"
                      >
                        <option value="recent">Newest receipt</option>
                        <option value="kgDesc">Current kg (high → low)</option>
                        <option value="kgAsc">Current kg (low → high)</option>
                        <option value="coilAsc">Coil no (A → Z)</option>
                        <option value="gaugeAsc">Gauge</option>
                        <option value="materialAsc">Material</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.8fr] gap-2 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                      <span>Coil no</span>
                      <span>Colour</span>
                      <span>Gauge</span>
                      <span>Material</span>
                      <span className="text-right">Current kg</span>
                    </div>
                    <ul>
                      {coilLotsByReceipt.map((c) => {
                        const live = liveCoilWeightKg(c);
                        return (
                          <li key={`${c.coilNo}-${c.poID || ''}-${c.lineKey || ''}`}>
                            <button
                              type="button"
                              onClick={() => navigate(`/operations/coils/${encodeURIComponent(c.coilNo)}`)}
                              className="w-full text-left grid grid-cols-[1.2fr_0.8fr_0.8fr_1fr_0.8fr] gap-2 px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 border-b border-slate-100"
                            >
                              <span className="font-bold text-[#134e4a] truncate">{c.coilNo}</span>
                              <span className="truncate">{c.colour || '—'}</span>
                              <span className="truncate">{c.gaugeLabel || '—'}</span>
                              <span className="truncate">{c.materialTypeName || c.productID || '—'}</span>
                              <span className="text-right font-bold tabular-nums text-[#134e4a]">
                                {live.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
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
              onClick={() => setShowFinishedGoods(true)}
              className="z-btn-secondary"
            >
                  <Factory size={16} /> Finish coil
            </button>
            <button
              type="button"
              onClick={() => setShowCoilMaterial(true)}
              className="z-btn-secondary"
            >
              <Scissors size={16} /> Coil split / scrap / return
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
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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
            ) : null}

            <div className="space-y-4">
              {activeTab === 'deliveries' ? (
                <ProductionDeliveriesTab onShellBlur={setDeliveriesShellBlur} />
              ) : null}


              {activeTab === 'production' ? (
                <p className="text-[11px] text-slate-500 -mt-3 mb-5 max-w-3xl leading-relaxed">
                  Queue shows <strong className="font-semibold text-slate-600">cutting lists</strong> you have sent from
                  Sales (<strong className="font-semibold text-slate-600">Send to production line</strong>). Click a row
                  for traceability — coils, run log, and conversion checks.
                </p>
              ) : null}

              {activeTab === 'production' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                  <div className="space-y-4 lg:col-span-2 order-1">
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Jobs waiting</p>
                        <p className="mt-1 text-xl font-black text-[#134e4a] tabular-nums">{productionQueueStats.waiting}</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">No coil assigned</p>
                        <p className="mt-1 text-xl font-black text-amber-700 tabular-nums">{productionQueueStats.noCoil}</p>
                      </div>
                      <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-red-700">Manager review</p>
                        <p className="mt-1 text-xl font-black text-red-700 tabular-nums">{productionQueueStats.needsReview}</p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-rose-700">Overdue &gt;24h</p>
                        <p className="mt-1 text-xl font-black text-rose-700 tabular-nums">{productionQueueStats.overdue}</p>
                      </div>
                    </div>

                    <div
                      className="inline-flex flex-wrap rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1.5 gap-1 mb-1"
                      role="group"
                      aria-label="Filter production queue"
                    >
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'waiting', label: 'Waiting' },
                        { id: 'running', label: 'In progress' },
                        { id: 'needs_review', label: 'Needs review' },
                        { id: 'done', label: 'Done' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setProductionFilter(f.id)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 ${
                            productionFilter === f.id
                              ? 'bg-[#134e4a] text-white shadow-sm'
                              : 'text-slate-600 hover:bg-white/90 hover:text-slate-900'
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
                            : 'Try clearing the search box or switching filter chips above.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className={WORKSPACE_TABLE_HEAD}>
                          <div className="col-span-3">List / job</div>
                          <div className="col-span-3">Customer</div>
                          <div className="col-span-3">Specification</div>
                          <div className="col-span-1 tabular-nums">Qty</div>
                          <div className="col-span-2 text-right sm:pr-1">Coil &amp; status</div>
                        </div>
                        {productionQueueRows.map((item) => (
                          <div
                            key={`${item.queueKind}-${item.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openProductionQueueRow(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openProductionQueueRow(item);
                              }
                            }}
                            className={`z-list-row grid grid-cols-12 items-center gap-y-2 gap-x-1 text-[11px] cursor-pointer !shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 ${
                              item.needsCoil
                                ? '!border-amber-300 !bg-amber-50/60'
                                : item.managerReviewRequired
                                  ? '!border-red-300 !bg-red-50/50'
                                  : item.overdue
                                    ? '!border-rose-300 !bg-rose-50/50'
                                    : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <div className="col-span-12 sm:col-span-3 font-semibold text-[#134e4a] min-w-0">
                              <span className="font-mono font-bold truncate block">{item.id}</span>
                            </div>
                            <div className="col-span-12 sm:col-span-3 font-medium text-slate-800 truncate min-w-0">
                              {item.customer}
                            </div>
                            <div className="col-span-12 sm:col-span-3 font-normal text-slate-600 truncate min-w-0">
                              {item.spec}
                            </div>
                            <div className="col-span-12 sm:col-span-1 font-semibold text-[#134e4a] tabular-nums truncate">
                              {item.quantity}
                            </div>
                            <div className="col-span-12 sm:col-span-2 flex flex-wrap justify-start sm:justify-end items-center gap-2 sm:pt-0">
                              {ws?.hasWorkspaceData && item.coilLabel ? (
                                <span
                                  className={`hidden lg:inline text-[10px] truncate max-w-[10rem] ${
                                    item.status === 'Planned' && item.coilCount === 0
                                      ? 'text-amber-800 font-semibold'
                                      : 'text-slate-500'
                                  }`}
                                  title={item.coilLabel}
                                >
                                  {item.coilLabel}
                                </span>
                              ) : null}
                              <span
                                className={`z-status-pill ${
                                  item.priority === 'High'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : item.priority === 'Done'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                      : item.priority === 'Waiting' || item.priority === 'Wait'
                                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                                        : 'border-slate-200 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {item.priority}
                              </span>
                            </div>
                            {!item.completed ? (
                              <div className="col-span-12 flex flex-wrap gap-2 pt-1 border-t border-slate-100/90 mt-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTraceWithHint(item, 'Open coil assignment inside traceability.');
                                  }}
                                  className="inline-flex items-center justify-center rounded-xl border border-gray-100 bg-white px-3 py-1.5 text-[10px] font-bold text-[#134e4a] shadow-sm hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
                                >
                                  Assign coil
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTraceWithHint(item, 'Open run log and start production for this job.');
                                  }}
                                  className="inline-flex items-center justify-center rounded-xl border border-gray-100 bg-white px-3 py-1.5 text-[10px] font-bold text-[#134e4a] shadow-sm hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
                                >
                                  Start run
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestMarkComplete(item);
                                  }}
                                  className="inline-flex items-center justify-center rounded-xl border border-emerald-200/90 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-900 shadow-sm hover:bg-emerald-100/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
                                >
                                  Mark complete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="space-y-4 lg:col-span-1 order-2">
                    {ws?.hasWorkspaceData && jobsNeedingManagerReview.length > 0 ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-4 text-sm text-red-950 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-800 flex items-center gap-2">
                          <AlertTriangle size={16} className="shrink-0" />
                          Manager review
                        </p>
                        <p className="mt-2 text-xs text-red-900/90">
                          Conversion outside agreed bands. Review and resolve from queue/traceability.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-xs font-semibold">
                          {jobsNeedingManagerReview.map((j) => (
                            <li key={j.jobID} className="font-mono text-red-950">
                              {j.cuttingListId || j.jobID}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {ws?.hasWorkspaceData && recentConversionChecks.length > 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="border-b border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Recent four-reference checks
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">Latest conversion variance checks.</p>
                        </div>
                        <div className="max-h-[32rem] overflow-auto">
                          <table className="min-w-full text-left text-[11px]">
                            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                              <tr>
                                <th className="px-3 py-2">List</th>
                                <th className="px-3 py-2">Δ Std</th>
                                <th className="px-3 py-2">Alert</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentConversionChecks.map((c) => {
                                const v = c.varianceSummary?.variances ?? {};
                                return (
                                  <tr key={c.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-mono font-bold text-[#134e4a]">
                                      {c.cuttingListId || c.jobID}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">{formatVariancePct(v.standardPct)}</td>
                                    <td className="px-3 py-2 font-semibold">{c.alertState}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </aside>
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
              <div className="grid grid-cols-2 gap-4">
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
                      in this branch. Prefer <strong>Coil material</strong> (split / scrap / return) so tags match
                      the floor.
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

      <ModalFrame isOpen={showFinishedGoods} onClose={() => setShowFinishedGoods(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Manual coil finish</h3>
            <button
              type="button"
              onClick={() => setShowFinishedGoods(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={submitFinishedGoods}>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Source coil number
              </label>
              <input
                required
                list="ops-fg-coils"
                value={finishedForm.coilNo}
                onChange={(e) =>
                  setFinishedForm((f) => ({ ...f, coilNo: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                placeholder="e.g. COIL-2026-0012"
              />
              <datalist id="ops-fg-coils">
                {coilLots
                  .filter((c) => c.currentStatus !== 'Consumed' && c.currentStatus !== 'Finished')
                  .filter((c) => liveCoilWeightKg(c) < 100)
                  .map((c) => (
                    <option key={c.coilNo} value={c.coilNo} />
                  ))}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Finished output qty (metres)
              </label>
              <input
                required
                type="number"
                min="1"
                value={finishedForm.qty}
                onChange={(e) => setFinishedForm((f) => ({ ...f, qty: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-500 -mt-1">
              This finish entry is posted against the selected coil.
            </p>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Finish date
              </label>
              <input
                type="date"
                value={finishedForm.date}
                onChange={(e) => setFinishedForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Empty spool weight (kg)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={finishedForm.spoolKg}
                onChange={(e) => setFinishedForm((f) => ({ ...f, spoolKg: e.target.value }))}
                placeholder="Inner reel / holder mass"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Weight of empty spool core. This is recorded for audit.
              </p>
            </div>
            <div className="rounded-xl border border-teal-100/80 bg-teal-50/40 p-4 space-y-3">
              <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-wider">
                WIP link (optional, if used)
              </p>
              <p className="text-[10px] text-gray-600 leading-snug">
                Match released raw material so stock and WIP stay balanced.
              </p>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  WIP source item
                </label>
                <select
                  value={finishedForm.wipSourceProductID}
                  onChange={(e) =>
                    setFinishedForm((f) => ({ ...f, wipSourceProductID: e.target.value }))
                  }
                  className="w-full bg-white border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">None</option>
                  {inventoryRows
                    .filter((r) => !r.productID.startsWith('FG-'))
                    .map((r) => (
                      <option key={r.productID} value={r.productID}>
                        {r.productID} — WIP {wipByProduct[r.productID] ?? 0} {r.unit}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  WIP consumed (kg / units)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={finishedForm.wipQtyReleased}
                  onChange={(e) =>
                    setFinishedForm((f) => ({ ...f, wipQtyReleased: e.target.value }))
                  }
                  placeholder="e.g. coil weight consumed"
                  className="w-full bg-white border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Post coil finish
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showCoilMaterial} onClose={() => !coilMaterialSaving && setShowCoilMaterial(false)}>
        <div className="z-modal-panel max-w-lg max-h-[90vh] p-6 sm:p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-[#134e4a]">Coil material</h3>
            <button
              type="button"
              disabled={coilMaterialSaving}
              onClick={() => setShowCoilMaterial(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl disabled:opacity-40"
            >
              <X size={22} />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 mb-4 leading-relaxed">
            <strong>Split</strong> moves unreserved kg to a new coil tag (off-cut roll).{' '}
            <strong>Scrap</strong> removes kg from the coil and raw SKU stock; optionally credits{' '}
            <span className="font-mono">SCRAP-COIL</span>. <strong>Return</strong> adds kg back onto a coil and raw
            stock (corrections, unused return).
          </p>
          <div className="flex flex-wrap gap-1 mb-4">
            {[
              { id: 'split', label: 'Split' },
              { id: 'scrap', label: 'Scrap' },
              { id: 'return', label: 'Return' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCoilMaterialTab(t.id)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  coilMaterialTab === t.id
                    ? 'bg-[#134e4a] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {coilMaterialTab === 'split' ? (
            <form className="space-y-4" onSubmit={submitCoilSplit}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Parent coil</label>
                <select
                  required
                  value={coilSplitForm.coilNo}
                  onChange={(e) => setCoilSplitForm((s) => ({ ...s, coilNo: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select coil…</option>
                  {[...coilLots]
                    .sort((a, b) => String(a.coilNo).localeCompare(String(b.coilNo)))
                    .map((c) => {
                      const rem = liveCoilWeightKg(c);
                      const res = Number(c.qtyReserved) || 0;
                      const free = Math.max(0, rem - res);
                      return (
                        <option key={c.coilNo} value={c.coilNo}>
                          {c.coilNo} · {rem.toFixed(0)} kg ({free.toFixed(0)} kg splittable)
                          {c.parentCoilNo ? ` · from ${c.parentCoilNo}` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Split weight (kg)
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={coilSplitForm.splitKg}
                  onChange={(e) => setCoilSplitForm((s) => ({ ...s, splitKg: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  New coil no (optional)
                </label>
                <input
                  type="text"
                  value={coilSplitForm.newCoilNo}
                  onChange={(e) => setCoilSplitForm((s) => ({ ...s, newCoilNo: e.target.value }))}
                  placeholder="Auto if empty"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-mono outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Note</label>
                <textarea
                  rows={2}
                  value={coilSplitForm.note}
                  onChange={(e) => setCoilSplitForm((s) => ({ ...s, note: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={coilSplitForm.date}
                  onChange={(e) => setCoilSplitForm((s) => ({ ...s, date: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={coilMaterialSaving}
                className="z-btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {coilMaterialSaving ? 'Posting…' : 'Split coil'}
              </button>
            </form>
          ) : null}

          {coilMaterialTab === 'scrap' ? (
            <form className="space-y-4" onSubmit={submitCoilScrap}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Coil</label>
                <select
                  required
                  value={coilScrapForm.coilNo}
                  onChange={(e) => setCoilScrapForm((s) => ({ ...s, coilNo: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select coil…</option>
                  {[...coilLots]
                    .sort((a, b) => String(a.coilNo).localeCompare(String(b.coilNo)))
                    .map((c) => {
                      const rem = liveCoilWeightKg(c);
                      const res = Number(c.qtyReserved) || 0;
                      const free = Math.max(0, rem - res);
                      return (
                        <option key={c.coilNo} value={c.coilNo}>
                          {c.coilNo} · max scrap {free.toFixed(0)} kg
                        </option>
                      );
                    })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Scrap (kg)</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={coilScrapForm.kg}
                  onChange={(e) => setCoilScrapForm((s) => ({ ...s, kg: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Reason</label>
                <select
                  value={coilScrapForm.reason}
                  onChange={(e) => setCoilScrapForm((s) => ({ ...s, reason: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  {COIL_SCRAP_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Note</label>
                <textarea
                  rows={2}
                  value={coilScrapForm.note}
                  onChange={(e) => setCoilScrapForm((s) => ({ ...s, note: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coilScrapForm.creditScrapInventory}
                  onChange={(e) =>
                    setCoilScrapForm((s) => ({ ...s, creditScrapInventory: e.target.checked }))
                  }
                  className="rounded border-slate-300"
                />
                Credit scrap inventory SKU
              </label>
              {coilScrapForm.creditScrapInventory ? (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                    Scrap product
                  </label>
                  <select
                    value={coilScrapForm.scrapProductID}
                    onChange={(e) =>
                      setCoilScrapForm((s) => ({ ...s, scrapProductID: e.target.value }))
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                  >
                    {inventoryRows.map((r) => (
                      <option key={r.productID} value={r.productID}>
                        {r.productID} — {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={coilScrapForm.date}
                  onChange={(e) => setCoilScrapForm((s) => ({ ...s, date: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={coilMaterialSaving}
                className="z-btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {coilMaterialSaving ? 'Posting…' : 'Post scrap'}
              </button>
            </form>
          ) : null}

          {coilMaterialTab === 'return' ? (
            <form className="space-y-4" onSubmit={submitCoilReturn}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Coil</label>
                <select
                  required
                  value={coilReturnForm.coilNo}
                  onChange={(e) => setCoilReturnForm((s) => ({ ...s, coilNo: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select coil…</option>
                  {[...coilLots]
                    .sort((a, b) => String(a.coilNo).localeCompare(String(b.coilNo)))
                    .map((c) => (
                      <option key={c.coilNo} value={c.coilNo}>
                        {c.coilNo} · {liveCoilWeightKg(c).toFixed(0)} kg on roll
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Return weight (kg)
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={coilReturnForm.kg}
                  onChange={(e) => setCoilReturnForm((s) => ({ ...s, kg: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Reason</label>
                <select
                  value={coilReturnForm.reason}
                  onChange={(e) => setCoilReturnForm((s) => ({ ...s, reason: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  {COIL_RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Note</label>
                <textarea
                  rows={2}
                  value={coilReturnForm.note}
                  onChange={(e) => setCoilReturnForm((s) => ({ ...s, note: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={coilReturnForm.date}
                  onChange={(e) => setCoilReturnForm((s) => ({ ...s, date: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={coilMaterialSaving}
                className="z-btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {coilMaterialSaving ? 'Posting…' : 'Post return to stock'}
              </button>
            </form>
          ) : null}
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
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
        <div className="z-modal-panel w-full max-w-[min(100%,1200px)] max-h-[min(92vh,920px)] flex flex-col p-0 overflow-hidden bg-white rounded-[28px] border border-slate-200 shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 shrink-0">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-[#134e4a]">
                {productionTraceModal?.type === 'trace'
                  ? productionTraceModal.completed
                    ? 'Production record (completed)'
                    : 'Production traceability'
                  : 'Queued cutting list'}
              </h3>
              {productionTraceModal?.type === 'trace' ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  <span className="font-mono font-semibold text-slate-700">
                    {productionTraceModal.cuttingListId}
                  </span>
                  {productionTraceModal.completed ? (
                    <span className="text-slate-400"> · read-only</span>
                  ) : null}
                </p>
              ) : productionTraceModal?.type === 'pending' ? (
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
            {productionTraceModal?.type === 'trace' ? (
              <LiveProductionMonitor
                focusCuttingListId={productionTraceModal.cuttingListId}
                hideJobSidebar
                inModal
                viewOnly={Boolean(productionTraceModal.completed)}
              />
            ) : productionTraceModal?.type === 'pending' ? (
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
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Operations;
