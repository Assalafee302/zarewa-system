import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Scissors,
  Search,
  Plus,
  Truck,
  AlertTriangle,
  TrendingUp,
  MoreVertical,
  Package,
  X,
  Factory,
  Trophy,
  Award,
  ChevronRight,
  Scale,
} from 'lucide-react';

import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import { SALES_MOCK } from '../Data/mockData';
import { LiveProductionMonitor } from '../components/LiveProductionMonitor';
import ProductionDeliveriesTab from '../components/operations/ProductionDeliveriesTab';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';

function firstGaugeNumeric(gaugeStr) {
  const m = String(gaugeStr ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1], 10) : null;
}

/** Planning estimate — same heuristic as Sales coil register. */
function roughMetersFromKg(kg, gaugeMm) {
  if (kg == null || Number.isNaN(kg) || kg <= 0) return null;
  const g = gaugeMm ?? 0.26;
  const kgPerM = g <= 0.22 ? 2.35 : g <= 0.26 ? 2.65 : g <= 0.3 ? 2.9 : g <= 0.45 ? 3.4 : 3.8;
  return Math.max(0, Math.round(kg / kgPerM));
}

function attrsForStockRow(p) {
  return (
    p.dashboardAttrs ?? {
      gauge: '—',
      colour: '—',
      materialType: p.name,
    }
  );
}

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

/** Kg recorded at store receipt (GRN). */
function grnReceivedWeightKg(lot) {
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
  const [deliveriesShellBlur, setDeliveriesShellBlur] = useState(false);

  const [showStockAdjust, setShowStockAdjust] = useState(false);
  const [showFinishedGoods, setShowFinishedGoods] = useState(false);
  const [showCoilRequest, setShowCoilRequest] = useState(false);
  /** `job` = live API job row; `pending` = offline cutting list queue (no traceability). */
  const [productionTraceModal, setProductionTraceModal] = useState(null);

  const [receiveDraft, setReceiveDraft] = useState({ poID: '', location: '' });
  const [expandedReceivePoId, setExpandedReceivePoId] = useState(null);
  const [grnLines, setGrnLines] = useState([]);
  const [grnConversionOverride, setGrnConversionOverride] = useState(false);

  const [coilRequestForm, setCoilRequestForm] = useState({
    gauge: '',
    colour: '',
    materialType: '',
    requestedKg: '',
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

  const [finishedForm, setFinishedForm] = useState({
    productID: '',
    qty: '',
    productionOrderId: '',
    date: '',
    spoolKg: '',
    wipSourceProductID: '',
    wipQtyReleased: '',
  });

  const inventoryStats = useMemo(() => {
    const lowStock = inventoryRows.filter((r) => r.stockLevel < r.lowStockThreshold).length;
    const kgSkus = inventoryRows.filter((r) => r.unit === 'kg');
    const totalKg = kgSkus.reduce((s, r) => s + r.stockLevel, 0);
    let aluzincKg = 0;
    let aluminiumKg = 0;
    let otherKg = 0;
    for (const r of kgSkus) {
      const mt = `${r.dashboardAttrs?.materialType ?? ''} ${r.name}`.toLowerCase();
      if (mt.includes('aluzinc')) aluzincKg += r.stockLevel;
      else if (mt.includes('alumin')) aluminiumKg += r.stockLevel;
      else otherKg += r.stockLevel;
    }
    const topKg = [...kgSkus].sort((a, b) => b.stockLevel - a.stockLevel)[0];
    const topA = topKg ? attrsForStockRow(topKg) : null;
    return {
      totalKg,
      aluzincKg,
      aluminiumKg,
      otherKg,
      lowStock,
      bestPerforming: topKg
        ? { gauge: topA.gauge, colour: topA.colour, material: topA.materialType, kg: topKg.stockLevel }
        : { gauge: '—', colour: '—', material: '—', kg: 0 },
    };
  }, [inventoryRows]);

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
  const cuttingLists = useMemo(() => {
    if (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.cuttingLists)) return ws.snapshot.cuttingLists;
    return Array.isArray(SALES_MOCK.cuttingLists) ? SALES_MOCK.cuttingLists : [];
  }, [ws]);

  const jobByCuttingListId = useMemo(() => {
    const m = new Map();
    for (const j of productionJobs) {
      if (j.cuttingListId) m.set(j.cuttingListId, j);
    }
    return m;
  }, [productionJobs]);

  const registeredCuttingListIds = useMemo(
    () => cuttingLists.filter((cl) => cl.productionRegistered).map((cl) => cl.id),
    [cuttingLists]
  );

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
    () => productionJobs.filter((j) => j.managerReviewRequired),
    [productionJobs]
  );

  const recentConversionChecks = useMemo(() => {
    if (!productionConversionChecks.length) return [];
    return [...productionConversionChecks].slice(0, 8);
  }, [productionConversionChecks]);

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
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const t = location.state?.focusOpsTab;
    if (t !== 'deliveries') return;
    setActiveTab('deliveries');
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryRows.filter((r) => {
      if (!q) return true;
      const blob = `${r.productID} ${r.name} ${r.stockLevel} ${r.unit}`.toLowerCase();
      return blob.includes(q);
    });
  }, [inventoryRows, searchQuery]);

  const lowStockRows = useMemo(
    () => inventoryRows.filter((r) => r.stockLevel < r.lowStockThreshold),
    [inventoryRows]
  );

  const transitOrders = useMemo(
    () => purchaseOrders.filter((p) => PO_RECEIVABLE_STATUSES.includes(p.status)),
    [purchaseOrders]
  );

  const coilLotsByReceipt = useMemo(() => {
    return [...coilLots].sort((a, b) => {
      const da = String(a.receivedAtISO || '');
      const db = String(b.receivedAtISO || '');
      if (da !== db) return db.localeCompare(da);
      return String(b.coilNo || '').localeCompare(String(a.coilNo || ''));
    });
  }, [coilLots]);

  const stockDisplayRows = useMemo(() => {
    return filteredInventory.map((r, idx) => {
      const a = attrsForStockRow(r);
      const gNum = firstGaugeNumeric(a.gauge);
      let metersDisplay = '—';
      let kgDisplay = '—';
      if (r.unit === 'kg') {
        kgDisplay = `${r.stockLevel.toLocaleString()} kg`;
        const est = roughMetersFromKg(r.stockLevel, gNum);
        metersDisplay = est != null ? `${est.toLocaleString()} m` : '—';
      } else if (r.unit === 'm') {
        metersDisplay = `${r.stockLevel.toLocaleString()} m`;
        kgDisplay = '—';
      } else {
        kgDisplay = `${r.stockLevel.toLocaleString()} ${r.unit}`;
      }
      return {
        rank: idx + 1,
        productID: r.productID,
        colour: a.colour,
        gauge: a.gauge,
        materialType: a.materialType,
        metersDisplay,
        kgDisplay,
        low: r.stockLevel < r.lowStockThreshold,
      };
    });
  }, [filteredInventory]);

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const res = await adjustStock(
      productID,
      type,
      q,
      reasonCode,
      reasonNote.trim(),
      date
    );
    if (!res.ok) {
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
    setShowStockAdjust(false);
    showToast('Stock adjustment applied.');
  };

  const submitFinishedGoods = async (e) => {
    e.preventDefault();
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
      finishedForm.productID,
      finishedForm.qty,
      0,
      finishedForm.productionOrderId.trim() || 'PRO-UNSPEC',
      finishedForm.date,
      wipOpts,
      { spoolKg: finishedForm.spoolKg }
    );
    if (!res.ok) {
      showToast(res.error, { variant: 'error' });
      return;
    }
    setFinishedForm({
      productID: '',
      qty: '',
      productionOrderId: '',
      date: '',
      spoolKg: '',
      wipSourceProductID: '',
      wipQtyReleased: '',
    });
    setShowFinishedGoods(false);
    showToast('Manual finished-goods receipt posted — use Production traceability to close live jobs.');
  };

  const submitCoilRequest = async (e) => {
    e.preventDefault();
    const { gauge, colour, materialType, requestedKg, note } = coilRequestForm;
    if (!gauge.trim() && !colour.trim() && !materialType.trim()) {
      showToast('Enter at least gauge, colour, or material.', { variant: 'error' });
      return;
    }
    const body = {
      gauge: gauge.trim(),
      colour: colour.trim(),
      materialType: materialType.trim(),
      requestedKg: requestedKg.trim() ? Number(requestedKg) || 0 : 0,
      note: note.trim(),
    };
    if (!ws?.canMutate) {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to submit coil requests — read-only cached workspace.'
          : 'Sign in with a live server connection to submit coil requests.',
        { variant: 'info' }
      );
      return;
    }
    const { ok, data } = await apiFetch('/api/coil-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save coil request.', { variant: 'error' });
      return;
    }
    await ws.refresh();
    setCoilRequestForm({ gauge: '', colour: '', materialType: '', requestedKg: '', note: '' });
    setShowCoilRequest(false);
    showToast('Request sent — visible on MD operations dashboard.');
  };

  const isAnyModalOpen =
    showStockAdjust || showFinishedGoods || showCoilRequest || productionTraceModal != null;

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
        <div className="col-span-full w-full">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-stretch lg:min-h-[50vh]">
            <section className="rounded-xl border border-sky-200/90 bg-sky-50/50 shadow-sm overflow-hidden w-full lg:w-1/2 lg:flex-1 min-w-0 flex flex-col min-h-[280px] lg:min-h-0">
            <div className="h-1 bg-sky-500 shrink-0" />
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
                      className="rounded-lg border border-sky-100 bg-white p-4 sm:p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#134e4a]">{p.poID}</p>
                          <p className="text-[10px] text-slate-600 font-medium">{p.supplierName}</p>
                          <p className="text-[9px] text-slate-500 mt-1">
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
                      <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                        {p.lines.map((l) => {
                          const open = l.qtyOrdered - l.qtyReceived;
                          return (
                            <li key={l.lineKey} className="text-[10px] text-slate-700">
                              <span className="font-semibold text-slate-900">{l.productName}</span>
                              <span className="text-slate-500">
                                {' '}
                                · {l.color || '—'} · {l.gauge || '—'} mm
                              </span>
                              <span className="block text-slate-600 tabular-nums">
                                Open {open.toLocaleString()} kg · received {l.qtyReceived.toLocaleString()} kg
                              </span>
                            </li>
                          );
                        })}
                      </ul>
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

            <section className="rounded-xl border border-[#134e4a]/20 bg-[#f0fdfa] shadow-sm overflow-hidden w-full lg:w-1/2 lg:flex-1 min-w-0 flex flex-col min-h-[280px] lg:min-h-0">
              <div className="h-1 bg-[#134e4a] shrink-0" />
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
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1">
                    <ul className="space-y-2">
                      {coilLotsByReceipt.map((c) => {
                        const live = liveCoilWeightKg(c);
                        const atGrn = grnReceivedWeightKg(c);
                        const productName =
                          inventoryRows.find((p) => p.productID === c.productID)?.name ?? c.productID;
                        const showGrnRef = atGrn > 0 && Math.abs(live - atGrn) > 0.01;
                        const specBits = [c.colour, c.gaugeLabel].filter(Boolean);
                        return (
                          <li
                            key={`${c.coilNo}-${c.poID || ''}-${c.lineKey || ''}`}
                            className="rounded-lg border border-slate-200/90 bg-white p-3 sm:p-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-[#134e4a]">{c.coilNo}</p>
                                <p className="text-[10px] font-semibold text-slate-800 mt-0.5 leading-snug">
                                  {productName}
                                </p>
                                <p className="text-[9px] text-slate-500 mt-1">
                                  {specBits.length ? specBits.join(' · ') : '—'}
                                  {c.location ? ` · ${c.location}` : ''}
                                  {c.receivedAtISO ? ` · received ${c.receivedAtISO}` : ''}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">
                                  Current kg
                                </p>
                                <p className="text-lg font-black text-[#134e4a] tabular-nums leading-tight">
                                  {live.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </p>
                                {showGrnRef ? (
                                  <p className="text-[9px] text-slate-500 tabular-nums mt-0.5">
                                    GRN {atGrn.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-slate-500">
                              {c.poID ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                  {c.poID}
                                </span>
                              ) : null}
                              {c.currentStatus ? (
                                <span className="rounded bg-teal-50 px-1.5 py-0.5 font-medium text-[#134e4a]">
                                  {c.currentStatus}
                                </span>
                              ) : null}
                              {c.supplierName ? (
                                <span className="truncate max-w-[12rem]" title={c.supplierName}>
                                  {c.supplierName}
                                </span>
                              ) : null}
                            </div>
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

        <aside className="lg:col-span-1 space-y-5 order-2 lg:order-1">
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5 border-l-4 border-l-[#134e4a]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Package size={14} /> Total stock (kg)
            </p>
            <p className="text-2xl font-bold text-[#134e4a] tabular-nums">
              {inventoryStats.totalKg.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-slate-400">kg</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-[10px] font-medium text-slate-600 border-t border-slate-100 pt-3">
              <li className="flex justify-between gap-2">
                <span>Aluzinc</span>
                <span className="tabular-nums text-[#134e4a] font-semibold">
                  {inventoryStats.aluzincKg.toLocaleString()} kg
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Aluminium</span>
                <span className="tabular-nums text-[#134e4a] font-semibold">
                  {inventoryStats.aluminiumKg.toLocaleString()} kg
                </span>
              </li>
              {inventoryStats.otherKg > 0 ? (
                <li className="flex justify-between gap-2">
                  <span>Other coil</span>
                  <span className="tabular-nums text-slate-700 font-semibold">
                    {inventoryStats.otherKg.toLocaleString()} kg
                  </span>
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5 relative overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Conversion efficiency
            </p>
            <div className="flex justify-between items-end text-emerald-600 gap-3">
              <h3 className="text-xl font-bold tracking-tight tabular-nums">
                {conversionStats.efficiencyPct != null ? `${conversionStats.efficiencyPct}%` : '—'}
              </h3>
              <TrendingUp size={22} className="shrink-0" />
            </div>
            <div
              className="absolute bottom-0 left-0 h-1 rounded-r bg-emerald-500"
              style={{ width: `${conversionStats.efficiencyPct ?? 0}%` }}
            />
            <p className="text-[10px] text-slate-500 mt-2">
              {conversionStats.total > 0
                ? `${conversionStats.flagged} flagged · ${conversionStats.watch} watch-band checks`
                : 'No completed conversion checks yet.'}
            </p>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-5 border-l-4 border-l-amber-500">
            <p className="text-[10px] font-semibold text-amber-900 uppercase tracking-widest mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> Low stock alert
            </p>
            <p className="text-2xl font-bold text-amber-900 tabular-nums">{inventoryStats.lowStock}</p>
            <p className="text-[10px] text-amber-900/80 mt-2">SKUs below minimum</p>
            {lowStockRows.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-amber-200/60 pt-3">
                {lowStockRows.slice(0, 4).map((r) => {
                  const a = attrsForStockRow(r);
                  return (
                    <li key={r.productID} className="text-[10px] text-amber-950/90">
                      <span className="font-semibold text-[#134e4a]">{a.gauge} mm</span>
                      <span className="text-amber-800/80"> · {a.materialType}</span>
                      <span className="block text-amber-800 tabular-nums mt-0.5">
                        {r.stockLevel.toLocaleString()} {r.unit}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-[#134e4a] text-white shadow-sm p-5">
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Award size={14} /> Best performer (stock)
            </p>
            <p className="text-lg font-bold text-white leading-tight">
              {inventoryStats.bestPerforming.gauge} mm · {inventoryStats.bestPerforming.colour}
            </p>
            <p className="text-[10px] text-white/65 mt-1 line-clamp-2">
              {inventoryStats.bestPerforming.material}
            </p>
            <p className="text-xl font-black text-[#5eead4] tabular-nums mt-2">
              {inventoryStats.bestPerforming.kg.toLocaleString()} kg
            </p>
          </div>

          <div className="z-card-muted">
            <h3 className="z-section-title">Scrap log (iron / steel)</h3>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-wide">
                  Current off-cuts
                </p>
                <h4 className="text-lg font-black text-red-900">
                  1,240 <span className="text-[10px] font-bold">kg</span>
                </h4>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed italic">
                Track disposal timing when scrap prices move.
              </p>
            </div>
          </div>

          <div className="z-card-muted">
            <h3 className="z-section-title flex items-center gap-2">
              <Package size={14} />
              Coil / batch tags
            </h3>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar text-[10px]">
              {coilLots.length === 0 ? (
                <p className="text-gray-400 font-bold uppercase">No GRN coils yet</p>
              ) : (
                coilLots.slice(0, 8).map((c) => (
                  <div
                    key={`${c.coilNo}-${c.productID}`}
                    className="p-2 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <p className="font-black text-[#134e4a]">{c.coilNo}</p>
                    <p className="text-gray-500 mt-0.5">
                      {c.productID} · {c.qtyReceived.toLocaleString()} ·{' '}
                      {c.weightKg != null ? `${c.weightKg} kg` : '— wt'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="z-card-muted">
            <h3 className="z-section-title flex items-center gap-2">
              <Factory size={14} />
              WIP (production)
            </h3>
            <div className="space-y-2 text-[10px]">
              {Object.keys(wipByProduct).length === 0 ? (
                <p className="text-gray-400 font-bold uppercase">No WIP quantities</p>
              ) : (
                Object.entries(wipByProduct).map(([pid, q]) => {
                  const name = inventoryRows.find((r) => r.productID === pid)?.name ?? pid;
                  return (
                    <div key={pid} className="flex justify-between gap-2 font-bold text-gray-700">
                      <span className="truncate">{name}</span>
                      <span className="text-[#134e4a] shrink-0">{q.toLocaleString()}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </aside>

        <div className="lg:col-span-3 order-1 lg:order-2">
          <MainPanel>
            {activeTab === 'inventory' ? (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setShowStockAdjust(true)}
                  className="z-btn-secondary"
                >
                  <Box size={16} /> Stock adjustment
                </button>
                <button
                  type="button"
                  onClick={() => setShowFinishedGoods(true)}
                  className="z-btn-secondary"
                >
                  <Factory size={16} /> Manual FG receipt
                </button>
                <button
                  type="button"
                  onClick={() => setShowCoilRequest(true)}
                  className="z-btn-primary"
                >
                  <Plus size={16} /> Request coil (MD)
                </button>
              </div>
            ) : null}

            {activeTab === 'production' ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center min-w-0 w-full sm:flex-1">
                  <h2 className="text-xl font-bold text-[#134e4a] shrink-0">
                    {PANEL_TITLE[activeTab] ?? 'Records'}
                  </h2>
                  <div className="relative flex-1 sm:max-w-xs min-w-0">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={16}
                    />
                    <input
                      type="search"
                      placeholder="Search SKUs…"
                      className="z-input-search"
                      autoComplete="off"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              {activeTab === 'deliveries' ? (
                <ProductionDeliveriesTab onShellBlur={setDeliveriesShellBlur} />
              ) : null}

              {activeTab === 'production' && ws?.hasWorkspaceData && jobsNeedingManagerReview.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-950 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-800 flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    Manager review — conversion escalation
                  </p>
                  <p className="mt-2 text-xs text-red-900/90">
                    These cutting lists have coil-level conversion outside agreed bands (vs standard, supplier, gauge
                    history, or coil history). Open each list from the queue below to resolve traceability before
                    closing the variance.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-xs font-semibold">
                    {jobsNeedingManagerReview.map((j) => (
                      <li key={j.jobID} className="font-mono text-red-950">
                        {j.cuttingListId || j.jobID}{' '}
                        <span className="font-sans text-red-800/80">
                          · {j.customerName || '—'} · alert {j.conversionAlertState || '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activeTab === 'production' && ws?.hasWorkspaceData && recentConversionChecks.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Recent four-reference checks
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Actual kg/m vs standard, supplier, gauge history, and coil history — variance % vs actual.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <tr>
                          <th className="px-4 py-2">Cutting list</th>
                          <th className="px-4 py-2">Coil</th>
                          <th className="px-4 py-2">Actual</th>
                          <th className="px-4 py-2">Δ Std</th>
                          <th className="px-4 py-2">Δ Supp</th>
                          <th className="px-4 py-2">Alert</th>
                          <th className="px-4 py-2">Mgr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentConversionChecks.map((c) => {
                          const v = c.varianceSummary?.variances ?? {};
                          return (
                            <tr key={c.id} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-mono font-bold text-[#134e4a]">
                                {c.cuttingListId || c.jobID}
                              </td>
                              <td className="px-4 py-2 font-mono">{c.coilNo}</td>
                              <td className="px-4 py-2 tabular-nums">
                                {c.actualConversionKgPerM != null && c.actualConversionKgPerM > 0
                                  ? `${Number(c.actualConversionKgPerM).toFixed(3)}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2 tabular-nums">{formatVariancePct(v.standardPct)}</td>
                              <td className="px-4 py-2 tabular-nums">{formatVariancePct(v.supplierPct)}</td>
                              <td className="px-4 py-2 font-semibold">{c.alertState}</td>
                              <td className="px-4 py-2">{c.managerReviewRequired ? 'Yes' : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {activeTab === 'production' ? (
                <p className="text-[11px] text-slate-500 -mt-2 mb-2">
                  Queue shows <strong className="font-semibold text-slate-600">cutting lists</strong> you have sent from
                  Sales (<strong className="font-semibold text-slate-600">Send to production line</strong>). Click a row
                  for traceability — coils, run log, and conversion checks.
                </p>
              ) : null}

              {activeTab === 'production' ? (
                productionQueueModel.sections.every((s) => s.rows.length === 0) ? (
                  <p className="text-sm font-medium text-slate-500 py-6 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                    {productionQueueModel.mode === 'offline'
                      ? 'No cutting lists waiting for production — create a quotation, post a receipt (50%+ paid), then add a cutting list in Sales.'
                      : 'Nothing matches this search — try clearing the search box. Lists appear here after you use Send to production line in Sales (quote must be at least 50% paid).'}
                  </p>
                ) : (
                  <div className="space-y-8">
                    {productionQueueModel.sections.map((section) =>
                      section.rows.length === 0 ? null : (
                        <div key={section.key} className="space-y-2">
                          {section.title ? (
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                              {section.title}
                            </h3>
                          ) : null}
                          <div className="space-y-2">
                            {section.rows.map((item) => (
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
                                className="z-list-row grid grid-cols-12 items-center gap-y-2 !py-4 cursor-pointer rounded-2xl border border-transparent hover:border-[#134e4a]/15 hover:bg-[#134e4a]/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25"
                              >
                                <div className="col-span-12 sm:col-span-2 text-sm font-bold text-[#134e4a]">
                                  <span className="font-mono font-black">{item.id}</span>
                                  {ws?.hasWorkspaceData && item.coilLabel ? (
                                    <p
                                      className={`mt-1 text-xs font-semibold leading-snug ${
                                        item.status === 'Planned' && item.coilCount === 0
                                          ? 'text-amber-800'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      {item.coilLabel}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="col-span-12 sm:col-span-3 text-sm font-semibold text-slate-800">
                                  {item.customer}
                                </div>
                                <div className="col-span-12 sm:col-span-3 text-sm font-medium text-slate-600">
                                  {item.spec}
                                </div>
                                <div className="col-span-12 sm:col-span-2 text-sm font-bold text-[#134e4a] tabular-nums">
                                  {item.quantity}
                                </div>
                                <div className="col-span-12 sm:col-span-2 flex justify-start sm:justify-end items-center gap-3 pt-2 sm:pt-0">
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
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-slate-300 hover:text-[#134e4a] p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
                                    aria-label="Row actions"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )
              ) : null}

              {activeTab === 'inventory' ? (
                <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden -mx-2 sm:mx-0">
                  <div className="p-5 sm:p-6 border-b border-slate-100">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#134e4a]">
                          <Trophy size={20} strokeWidth={2} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                            Stock records
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                            Same layout as dashboard top performers —{' '}
                            <span className="font-medium text-slate-600">#</span>,{' '}
                            <span className="font-medium text-slate-600">colour</span>,{' '}
                            <span className="font-medium text-slate-600">gauge</span>,{' '}
                            <span className="font-medium text-slate-600">material</span>,{' '}
                            <span className="font-medium text-slate-600">meters</span> (est. for kg),{' '}
                            <span className="font-medium text-slate-600">kg</span>.
                          </p>
                        </div>
                      </div>
                      <div className="relative w-full lg:max-w-xs min-w-0">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          size={16}
                        />
                        <input
                          type="search"
                          placeholder="Filter SKUs…"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                          autoComplete="off"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,6.5rem)_minmax(0,5.5rem)] gap-x-3 gap-y-1 px-4 py-2 border-b border-slate-200 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="text-center">#</span>
                    <span>Colour</span>
                    <span>Gauge</span>
                    <span>Material</span>
                    <span className="text-right tabular-nums">Meters</span>
                    <span className="text-right tabular-nums">kg</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {stockDisplayRows.map((row) => (
                      <li key={row.productID}>
                        <div
                          className={`w-full text-left py-3 px-2 sm:px-4 rounded-lg sm:rounded-none transition-colors ${
                            row.low ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="sm:hidden space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#134e4a] text-[10px] font-bold text-white tabular-nums shrink-0">
                                {row.rank}
                              </span>
                              <span className="text-sm font-semibold text-slate-900 tabular-nums truncate">
                                {row.gauge} mm · {row.colour}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 pl-9 line-clamp-2">{row.materialType}</p>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-9 text-[11px] tabular-nums">
                              <span className="text-slate-500">{row.metersDisplay}</span>
                              <span className="font-semibold text-[#134e4a]">{row.kgDisplay}</span>
                            </div>
                          </div>
                          <div className="hidden sm:grid sm:grid-cols-[2.5rem_minmax(0,4.5rem)_minmax(0,5rem)_minmax(0,1fr)_minmax(0,6.5rem)_minmax(0,5.5rem)] gap-x-3 items-center">
                            <span className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-[#134e4a] tabular-nums">
                              {row.rank}
                            </span>
                            <span className="text-sm font-semibold text-slate-900 truncate">{row.colour}</span>
                            <span className="text-sm font-semibold text-slate-800 tabular-nums">{row.gauge} mm</span>
                            <span className="text-[12px] text-slate-600 truncate pr-1">{row.materialType}</span>
                            <span className="text-sm font-semibold text-slate-800 tabular-nums text-right">
                              {row.metersDisplay}
                            </span>
                            <span className="text-sm font-semibold text-[#134e4a] tabular-nums text-right">
                              {row.kgDisplay}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] font-medium text-slate-500 px-4 py-3 border-t border-slate-100 flex items-center gap-1">
                    <span className="font-mono text-slate-400">{filteredInventory.length}</span> line(s) · meters on kg
                    SKUs are planning estimates
                    <ChevronRight size={12} className="opacity-40 text-slate-400 shrink-0 ml-auto" />
                  </p>
                </section>
              ) : null}
            </div>
          </MainPanel>
        </div>
      </div>

      <ModalFrame isOpen={showStockAdjust} onClose={() => setShowStockAdjust(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#134e4a]">Stock adjustment</h3>
              <button
                type="button"
                onClick={() => setShowStockAdjust(false)}
                className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              >
                <X size={22} />
              </button>
            </div>
            <form className="space-y-4" onSubmit={applyStockAdjust}>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Product ID
                </label>
                <select
                  required
                  value={stockAdjust.productID}
                  onChange={(e) =>
                    setStockAdjust((s) => ({ ...s, productID: e.target.value }))
                  }
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">Select product…</option>
                  {inventoryRows.map((r) => (
                    <option key={r.productID} value={r.productID}>
                      {r.productID} — {r.name}
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
                    onChange={(e) =>
                      setStockAdjust((s) => ({ ...s, type: e.target.value }))
                    }
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
                  Date of adjustment
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
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Apply adjustment
              </button>
            </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showFinishedGoods} onClose={() => setShowFinishedGoods(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Manual finished-goods receipt</h3>
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
                Finished product
              </label>
              <select
                required
                value={finishedForm.productID}
                onChange={(e) =>
                  setFinishedForm((f) => ({ ...f, productID: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              >
                <option value="">Select SKU…</option>
                {inventoryRows
                  .filter((r) => r.productID.startsWith('FG-'))
                  .map((r) => (
                    <option key={r.productID} value={r.productID}>
                      {r.productID} — {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Quantity produced (sellable units, e.g. metres)
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
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Cutting list ID (production line)
              </label>
              <input
                required
                list="ops-fg-cutting-lists"
                value={finishedForm.productionOrderId}
                onChange={(e) =>
                  setFinishedForm((f) => ({ ...f, productionOrderId: e.target.value }))
                }
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
              <datalist id="ops-fg-cutting-lists">
                {registeredCuttingListIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Production date
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
                Spool weight (kg)
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
                Mass of the inner part that holds the coil — recorded on the movement log (no pricing on store form).
              </p>
            </div>
            <div className="rounded-xl border border-teal-100/80 bg-teal-50/40 p-4 space-y-3">
              <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-wider">
                WIP link (optional)
              </p>
              <p className="text-[10px] text-gray-600 leading-snug">
                Match material transferred to production so the ledger stays balanced.
              </p>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  WIP source (raw SKU)
                </label>
                <select
                  value={finishedForm.wipSourceProductID}
                  onChange={(e) =>
                    setFinishedForm((f) => ({ ...f, wipSourceProductID: e.target.value }))
                  }
                  className="w-full bg-white border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="">None — FG only (not recommended)</option>
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
                  Consumed from WIP (kg / units)
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
              Post to sellable stock
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showCoilRequest} onClose={() => setShowCoilRequest(false)}>
        <div className="z-modal-panel max-w-lg p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Request coil (MD review)</h3>
            <button
              type="button"
              onClick={() => setShowCoilRequest(false)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
            >
              <X size={22} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-4">
            Store cannot raise purchase orders. Submit a request — it appears on the{' '}
            <strong>operations dashboard</strong> for MD / procurement follow-up.
          </p>
          <form className="space-y-4" onSubmit={submitCoilRequest}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Gauge (mm)
                </label>
                <input
                  value={coilRequestForm.gauge}
                  onChange={(e) =>
                    setCoilRequestForm((f) => ({ ...f, gauge: e.target.value }))
                  }
                  placeholder="e.g. 0.28"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                  Colour / finish
                </label>
                <input
                  value={coilRequestForm.colour}
                  onChange={(e) =>
                    setCoilRequestForm((f) => ({ ...f, colour: e.target.value }))
                  }
                  placeholder="e.g. IV · TB"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Material type
              </label>
              <input
                value={coilRequestForm.materialType}
                onChange={(e) =>
                  setCoilRequestForm((f) => ({ ...f, materialType: e.target.value }))
                }
                placeholder="e.g. Aluzinc coil"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">
                Approx. kg needed
              </label>
              <input
                value={coilRequestForm.requestedKg}
                onChange={(e) =>
                  setCoilRequestForm((f) => ({ ...f, requestedKg: e.target.value }))
                }
                placeholder="e.g. 8000"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold outline-none"
              />
            </div>
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
              Submit request
            </button>
          </form>
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
