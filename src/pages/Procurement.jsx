import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Truck,
  Anchor,
  DollarSign,
  X,
  ChevronDown,
  Banknote,
  AlertTriangle,
  Award,
  Ruler,
  Package,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';

import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import CoilPurchaseOrderModal from '../components/procurement/CoilPurchaseOrderModal';
import { ProcurementFormSection } from '../components/procurement/ProcurementFormSection';
import { CONVERSION_FLAG_RATIO, formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';

const TAB_LABELS = {
  purchases: 'Purchases',
  transport: 'Transport',
  suppliers: 'Suppliers',
  conversion: 'Conversion',
};

const TRANSPORT_SUBS = [
  { id: 'agents', label: 'Agents' },
  { id: 'transit', label: 'Orders on road' },
];

function poTotalNgn(po) {
  return po.lines.reduce((s, l) => s + Number(l.qtyOrdered) * Number(l.unitPriceNgn || 0), 0);
}

const PILL = 'inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide';

/** Bordered chip — matches Stock / Finance compact lists */
const statusChipBorder = (st) => {
  if (st === 'Received') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (st === 'In Transit') return 'border-sky-200 bg-sky-50 text-sky-900';
  if (st === 'On loading') return 'border-violet-200 bg-violet-50 text-violet-900';
  if (st === 'Approved') return 'border-teal-200 bg-teal-50 text-teal-900';
  if (st === 'Rejected') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-900';
};

const CARD_ROW =
  'rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm transition-colors hover:bg-white/70';

const Procurement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const {
    purchaseOrders,
    products: invProducts,
    coilLots,
    createPurchaseOrder,
    setPurchaseOrderStatus,
    attachSupplierInvoice,
    linkTransportToPurchaseOrder,
    postPurchaseOrderTransport,
    markPurchaseTransportPaid,
    recordPurchaseSupplierPayment,
  } = useInventory();
  const canRecordSupplierPayment = ws?.hasPermission?.('finance.pay') ?? true;
  const canRecordTransportTreasury = ws?.hasPermission?.('finance.pay') ?? false;
  const currentActorLabel = ws?.session?.user?.displayName ?? 'Accounts';

  const [activeTab, setActiveTab] = useState('purchases');
  const [transportSubTab, setTransportSubTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = ws?.snapshot;
    if (!s) {
      setAgents([]);
      setSuppliers([]);
      return;
    }
    setAgents(Array.isArray(s.transportAgents) ? s.transportAgents.map((a) => ({ ...a })) : []);
    setSuppliers(Array.isArray(s.suppliers) ? s.suppliers.map((x) => ({ ...x })) : []);
  }, [ws?.snapshot, ws?.refreshEpoch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [showCoilPoModal, setShowCoilPoModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [showPostTransportModal, setShowPostTransportModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showConversionModal, setShowConversionModal] = useState(false);

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    city: '',
    paymentTerms: 'Credit',
    qualityScore: '80',
    notes: '',
  });
  const [agentForm, setAgentForm] = useState({ name: '', phone: '', region: '' });
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [editingAgentId, setEditingAgentId] = useState(null);
  const [editingConversionId, setEditingConversionId] = useState(null);

  const [transportForm, setTransportForm] = useState({
    poID: '',
    agentId: '',
    transportReference: '',
    transportNote: '',
  });
  const [payForm, setPayForm] = useState({
    poID: '',
    amountNgn: '',
    note: '',
    paidBy: currentActorLabel,
    treasuryAccountId: '',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    poID: '',
    invoiceNo: '',
    invoiceDateISO: '',
    deliveryDateISO: '',
  });
  const [postTransportForm, setPostTransportForm] = useState({
    poID: '',
    amountNgn: '',
    treasuryAccountId: '',
    reference: '',
    dateISO: new Date().toISOString().slice(0, 10),
    note: '',
    recordTreasury: false,
  });
  const [conversionForm, setConversionForm] = useState({
    color: '',
    gauge: '',
    productID: '',
    offerKg: '',
    offerMeters: '',
    conversionKgPerM: '',
    label: '',
  });
  const [conversionCalc, setConversionCalc] = useState({
    offerKg: '',
    offerMeters: '',
    pricePerKg: '',
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!location.state?.openPurchaseReceipt) return;
    setActiveTab('purchases');
    setShowInvoiceModal(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const t = location.state?.focusTab;
    if (!t || !TAB_LABELS[t]) return;
    setActiveTab(t);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const procurementTabs = useMemo(
    () => [
      { id: 'purchases', icon: <DollarSign size={16} />, label: 'Purchases' },
      { id: 'transport', icon: <Truck size={16} />, label: 'Transport' },
      { id: 'suppliers', icon: <Anchor size={16} />, label: 'Suppliers' },
      { id: 'conversion', icon: <Ruler size={16} />, label: 'Conversion' },
    ],
    []
  );

  const outstandingSupplierNgn = useMemo(
    () =>
      purchaseOrders.reduce((s, p) => {
        if (p.status === 'Rejected') return s;
        const tot = poTotalNgn(p);
        const paid = Number(p.supplierPaidNgn) || 0;
        return s + Math.max(0, tot - paid);
      }, 0),
    [purchaseOrders]
  );

  const openCommitmentsNgn = useMemo(
    () =>
      purchaseOrders
        .filter((p) => !['Received', 'Rejected'].includes(p.status))
        .reduce((s, p) => s + poTotalNgn(p), 0),
    [purchaseOrders]
  );

  const transitLoadingCount = useMemo(
    () =>
      purchaseOrders.filter((p) => p.status === 'In Transit' || p.status === 'On loading').length,
    [purchaseOrders]
  );

  const bestSupplier = useMemo(() => {
    const byId = {};
    for (const p of purchaseOrders) {
      byId[p.supplierID] = (byId[p.supplierID] || 0) + poTotalNgn(p);
    }
    let top = null;
    for (const s of suppliers) {
      const vol = byId[s.supplierID] || 0;
      const score = (s.qualityScore || 70) * Math.log10(10 + vol / 1e6);
      if (!top || score > top.score) top = { s, score, vol };
    }
    return top;
  }, [purchaseOrders, suppliers]);

  const lowStockCount = useMemo(
    () => invProducts.filter((p) => p.unit === 'kg' && p.stockLevel < p.lowStockThreshold).length,
    [invProducts]
  );
  const procurementCatalog = useMemo(() => {
    const fromMd = ws?.snapshot?.masterData?.procurementCatalog;
    if (ws?.hasWorkspaceData && Array.isArray(fromMd)) return fromMd;
    const snap = ws?.snapshot?.procurementCatalog;
    if (ws?.hasWorkspaceData && Array.isArray(snap)) return snap;
    return [];
  }, [ws?.hasWorkspaceData, ws?.snapshot?.masterData?.procurementCatalog, ws?.snapshot?.procurementCatalog]);
  const treasuryAccounts =
    ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.treasuryAccounts) ? ws.snapshot.treasuryAccounts : [];

  const topCoilStockRows = useMemo(() => {
    return [...invProducts]
      .filter((p) => p.unit === 'kg')
      .sort((a, b) => b.stockLevel - a.stockLevel)
      .slice(0, 5)
      .map((p, i) => {
        const a = p.dashboardAttrs ?? {};
        return {
          rank: i + 1,
          productID: p.productID,
          colour: a.colour || '—',
          gauge: a.gauge || '—',
          materialType: a.materialType || p.name,
          stockKg: p.stockLevel,
        };
      });
  }, [invProducts]);
  const topCoilLots = useMemo(() => {
    return [...(coilLots || [])]
      .sort((a, b) => Number(b.currentWeightKg || b.qtyRemaining || 0) - Number(a.currentWeightKg || a.qtyRemaining || 0))
      .slice(0, 5);
  }, [coilLots]);

  const openSupplierModal = () => {
    setEditingSupplierId(null);
    setSupplierForm({
      name: '',
      city: '',
      paymentTerms: 'Credit',
      qualityScore: '80',
      notes: '',
    });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplierId(s.supplierID);
    setSupplierForm({
      name: s.name || '',
      city: s.city && s.city !== '—' ? s.city : '',
      paymentTerms: s.paymentTerms || 'Credit',
      qualityScore: String(s.qualityScore ?? 80),
      notes: s.notes || '',
    });
    setShowSupplierModal(true);
  };

  const openAgentModal = () => {
    setEditingAgentId(null);
    setAgentForm({ name: '', phone: '', region: '' });
    setShowAgentModal(true);
  };

  const openEditAgent = (a) => {
    setEditingAgentId(a.id);
    setAgentForm({
      name: a.name || '',
      phone: a.phone && a.phone !== '—' ? a.phone : '',
      region: a.region && a.region !== '—' ? a.region : '',
    });
    setShowAgentModal(true);
  };

  const openPrimaryAction = () => {
    if (activeTab === 'purchases') setShowCoilPoModal(true);
    else if (activeTab === 'transport') openAgentModal();
    else if (activeTab === 'suppliers') openSupplierModal();
    else if (activeTab === 'conversion') {
      setEditingConversionId(null);
      setConversionForm({
        color: '',
        gauge: '',
        productID: invProducts.find((p) => p.unit === 'kg')?.productID || '',
        offerKg: '',
        offerMeters: '',
        conversionKgPerM: '',
        label: '',
      });
      setShowConversionModal(true);
    }
  };

  const newButtonLabel =
    activeTab === 'purchases'
      ? 'New coil PO'
      : activeTab === 'transport'
        ? 'New agent'
        : activeTab === 'suppliers'
          ? 'New supplier'
        : activeTab === 'conversion'
          ? 'Add conversion'
          : null;

  const openEditConversion = (row) => {
    setEditingConversionId(row.id);
    setConversionForm({
      color: String(row.color || ''),
      gauge: String(row.gauge || ''),
      productID: String(row.productID || ''),
      offerKg: row.offerKg != null ? String(row.offerKg) : '',
      offerMeters: row.offerMeters != null ? String(row.offerMeters) : '',
      conversionKgPerM: row.conversionKgPerM != null ? String(row.conversionKgPerM) : '',
      label: String(row.label || ''),
    });
    setShowConversionModal(true);
  };

  const removeConversion = async (row) => {
    if (!row?.id) return;
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/setup/procurementCatalog/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not delete conversion row.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      showToast('Conversion row removed.');
      return;
    }
    showToast(
      ws?.usingCachedData
        ? 'Reconnect to delete conversion rows — workspace is read-only.'
        : 'Connect to the API to delete conversion rows.',
      { variant: 'info' }
    );
  };

  const saveConversion = async (e) => {
    e.preventDefault();
    const offerKg = Number(conversionForm.offerKg);
    const offerMeters = Number(conversionForm.offerMeters);
    let conversion = Number(conversionForm.conversionKgPerM);
    if (Number.isFinite(offerKg) && Number.isFinite(offerMeters) && offerKg > 0 && offerMeters > 0) {
      conversion = offerKg / offerMeters;
    }
    if (
      !conversionForm.color.trim() ||
      !conversionForm.gauge.trim() ||
      !conversionForm.productID.trim() ||
      !Number.isFinite(conversion) ||
      conversion <= 0
    ) {
      showToast('Fill colour, gauge, stock item, and a valid conversion.', { variant: 'error' });
      return;
    }
    const payload = {
      ...(editingConversionId ? { id: editingConversionId } : {}),
      color: conversionForm.color.trim(),
      gauge: conversionForm.gauge.trim(),
      productID: conversionForm.productID.trim(),
      offerKg: Number.isFinite(offerKg) && offerKg > 0 ? offerKg : 0,
      offerMeters: Number.isFinite(offerMeters) && offerMeters > 0 ? offerMeters : 0,
      conversionKgPerM: Number(conversion.toFixed(6)),
      label: conversionForm.label.trim() || 'Live conversion row',
    };
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch('/api/setup/procurementCatalog', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save conversion row.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      setShowConversionModal(false);
      showToast(editingConversionId ? 'Conversion row updated.' : 'Conversion row added.');
      return;
    }
    showToast(
      ws?.usingCachedData
        ? 'Reconnect to save conversion rows — workspace is read-only.'
        : 'Connect to the API to save conversion rows.',
      { variant: 'info' }
    );
  };

  const calcOfferKg = Number(conversionCalc.offerKg);
  const calcOfferMeters = Number(conversionCalc.offerMeters);
  const calcPricePerKg = Number(conversionCalc.pricePerKg);
  const calcKgPerM =
    Number.isFinite(calcOfferKg) && Number.isFinite(calcOfferMeters) && calcOfferKg > 0 && calcOfferMeters > 0
      ? calcOfferKg / calcOfferMeters
      : null;
  const calcCostPerM =
    calcKgPerM != null && Number.isFinite(calcPricePerKg) && calcPricePerKg > 0
      ? calcKgPerM * calcPricePerKg
      : null;

  const saveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast('Enter supplier name.', { variant: 'error' });
      return;
    }
    const city = supplierForm.city.trim() || '—';
    const qScore = Number(supplierForm.qualityScore) || 80;
    const notes = supplierForm.notes.trim() || 'Added from procurement.';
    const wasEditSupplier = Boolean(editingSupplierId);

    if (ws?.canMutate) {
      if (editingSupplierId) {
        const { ok, data } = await apiFetch(
          `/api/suppliers/${encodeURIComponent(editingSupplierId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: supplierForm.name.trim(),
              city,
              paymentTerms: supplierForm.paymentTerms,
              qualityScore: qScore,
              notes,
            }),
          }
        );
        if (!ok || !data?.ok) {
          showToast(data?.error || 'Could not update supplier.', { variant: 'error' });
          return;
        }
      } else {
        const { ok, data } = await apiFetch('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify({
            name: supplierForm.name.trim(),
            city,
            paymentTerms: supplierForm.paymentTerms,
            qualityScore: qScore,
            notes,
          }),
        });
        if (!ok || !data?.ok) {
          showToast(data?.error || 'Could not create supplier.', { variant: 'error' });
          return;
        }
      }
      await ws.refresh();
    } else {
      showToast('Reconnect to save suppliers — read-only workspace.', { variant: 'info' });
      return;
    }

    setSupplierForm({
      name: '',
      city: '',
      paymentTerms: 'Credit',
      qualityScore: '80',
      notes: '',
    });
    setEditingSupplierId(null);
    setShowSupplierModal(false);
    showToast(wasEditSupplier ? 'Supplier updated.' : 'Supplier saved.');
  };

  const removeSupplier = async (s) => {
    if (!window.confirm(`Delete supplier “${s.name}”? This cannot be undone.`)) return;
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/suppliers/${encodeURIComponent(s.supplierID)}`, {
        method: 'DELETE',
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not delete supplier.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast('Reconnect to delete suppliers — read-only workspace.', { variant: 'info' });
      return;
    }
    showToast('Supplier removed.');
  };

  const saveAgent = async (e) => {
    e.preventDefault();
    if (!agentForm.name.trim()) {
      showToast('Enter agent name.', { variant: 'error' });
      return;
    }
    const phone = agentForm.phone.trim() || '—';
    const region = agentForm.region.trim() || '—';
    const wasEditAgent = Boolean(editingAgentId);

    if (ws?.canMutate) {
      if (editingAgentId) {
        const { ok, data } = await apiFetch(
          `/api/transport-agents/${encodeURIComponent(editingAgentId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: agentForm.name.trim(),
              phone,
              region,
            }),
          }
        );
        if (!ok || !data?.ok) {
          showToast(data?.error || 'Could not update agent.', { variant: 'error' });
          return;
        }
      } else {
        const { ok, data } = await apiFetch('/api/transport-agents', {
          method: 'POST',
          body: JSON.stringify({
            name: agentForm.name.trim(),
            phone,
            region,
          }),
        });
        if (!ok || !data?.ok) {
          showToast(data?.error || 'Could not create agent.', { variant: 'error' });
          return;
        }
      }
      await ws.refresh();
    } else {
      showToast('Reconnect to save transport agents — read-only workspace.', { variant: 'info' });
      return;
    }

    setAgentForm({ name: '', phone: '', region: '' });
    setEditingAgentId(null);
    setShowAgentModal(false);
    showToast(wasEditAgent ? 'Agent updated.' : 'Agent registered.');
  };

  const removeAgent = async (a) => {
    if (!window.confirm(`Delete transport agent “${a.name}”?`)) return;
    if (ws?.canMutate) {
      const { ok, data } = await apiFetch(`/api/transport-agents/${encodeURIComponent(a.id)}`, {
        method: 'DELETE',
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not delete agent.', { variant: 'error' });
        return;
      }
      await ws.refresh();
    } else {
      showToast('Reconnect to delete transport agents — read-only workspace.', { variant: 'info' });
      return;
    }
    showToast('Agent removed.');
  };

  const filteredPOs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter((p) => {
      const blob = [p.poID, p.supplierName, p.status, ...p.lines.map((l) => l.productID)].join(' ');
      return blob.toLowerCase().includes(q);
    });
  }, [purchaseOrders, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.supplierID, s.name, s.city].join(' ').toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const isAnyModalOpen =
    showCoilPoModal ||
    showSupplierModal ||
    showAgentModal ||
    showTransportModal ||
    showPayModal ||
    showInvoiceModal;

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        eyebrow="Procurement"
        title="Purchases"
        subtitle="Coil procurement (KG) for MD — suppliers Kano / Abuja / Lagos, transport, conversion (kg/m), Finance-ready payments."
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:max-w-3xl">
            <PageTabs tabs={procurementTabs} value={activeTab} onChange={setActiveTab} />
            {newButtonLabel ? (
              <button
                type="button"
                onClick={openPrimaryAction}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#134e4a] text-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider shadow-sm hover:brightness-105 shrink-0"
              >
                <Plus size={14} strokeWidth={2} /> {newButtonLabel}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:gap-6">
        <div className="col-span-full order-1">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <Package size={12} /> Open commitments
              </p>
              <p className="mt-1 text-xl font-black text-[#134e4a] tabular-nums">{formatNgn(openCommitmentsNgn)}</p>
              <div className="mt-2 border-t border-slate-100 pt-2 space-y-1 text-[10px]">
                <p className="flex items-center justify-between text-slate-600">
                  <span>On road / loading</span>
                  <span className="font-bold tabular-nums text-[#134e4a]">{transitLoadingCount} PO</span>
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <Banknote size={12} /> Outstanding
              </p>
              <p className="mt-1 text-xl font-black text-[#134e4a] tabular-nums">
                {formatNgn(outstandingSupplierNgn)}
              </p>
              <p className="mt-2 text-[10px] text-slate-500 border-t border-slate-100 pt-2">Open PO value less paid</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-teal-700 flex items-center gap-1">
                <Award size={12} /> Best supplier
              </p>
              <p className="mt-1 text-sm font-bold text-[#134e4a] leading-tight line-clamp-2">
                {bestSupplier?.s.name ?? '—'}
              </p>
              <p className="mt-2 text-[10px] text-teal-800/90 border-t border-teal-100/80 pt-2">Quality × volume</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1">
                <AlertTriangle size={12} /> Low stock
              </p>
              <p className="mt-1 text-xl font-black text-amber-800 tabular-nums">{lowStockCount}</p>
              <p className="mt-2 text-[10px] text-amber-800/85 border-t border-amber-100 pt-2">Kg SKUs below reorder</p>
            </div>
          </div>
          {topCoilStockRows.length > 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 shrink-0">Top coil (kg)</p>
              <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                {topCoilStockRows.map((row) => (
                  <button
                    key={row.productID}
                    type="button"
                    onClick={() => navigate('/operations')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-white"
                    title={row.materialType}
                  >
                    <span className="font-bold text-[#134e4a] tabular-nums">{row.rank}.</span>
                    <span className="truncate max-w-[7rem] sm:max-w-[10rem]">
                      {row.colour} · {row.gauge}
                    </span>
                    <span className="font-semibold text-[#134e4a] tabular-nums">{row.stockKg.toLocaleString()}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                className="text-[9px] font-semibold text-[#134e4a] uppercase tracking-wide hover:underline shrink-0 self-start sm:self-auto"
              >
                Store
                <ChevronRight size={11} className="inline opacity-50" />
              </button>
            </div>
          ) : null}
          {topCoilLots.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Coils</span>
              {topCoilLots.slice(0, 5).map((c) => (
                <button
                  key={`${c.coilNo}-${c.poID || ''}`}
                  type="button"
                  onClick={() => navigate(`/operations/coils/${encodeURIComponent(c.coilNo)}`)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-[#134e4a] hover:bg-white"
                >
                  {c.coilNo}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed max-w-4xl">
            <strong className="text-slate-700">Conversion</strong> — kg/m = kg ÷ metres. Flag when actual kg/m is above
            offer or standard by ~{Math.round((CONVERSION_FLAG_RATIO - 1) * 100)}%.
          </p>
        </div>

        <div className="col-span-full min-w-0 order-2">
          <MainPanel className="!rounded-xl !border-slate-200/90 !shadow-sm !bg-white !p-0 overflow-hidden !min-h-0 sm:!min-h-[360px]">
            <div className="h-1 bg-[#134e4a]" />
            <div className="p-4 sm:p-5 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-xl font-bold text-[#134e4a] shrink-0">
                  {TAB_LABELS[activeTab] ?? 'Records'}
                </h2>
                <div className="relative flex-1 w-full sm:max-w-xs min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    size={16}
                  />
                  <input
                    type="search"
                    placeholder="Search…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#134e4a]/10"
                  />
                </div>
              </div>

              {activeTab === 'purchases' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setShowInvoiceModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-[#134e4a]"
                    >
                      Supplier invoice
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {filteredPOs.map((p) => {
                      const meta2 = [
                        p.orderDateISO,
                        `${p.lines.length} coil line(s)`,
                        p.transportAgentName,
                        p.transportReference ? `Ref ${p.transportReference}` : null,
                        p.transportTreasuryMovementId ? `Treasury ${p.transportTreasuryMovementId}` : null,
                        p.transportAmountNgn ? `Haulage ${formatNgn(p.transportAmountNgn)}` : null,
                        p.transportPaid ? 'Haulage settled' : null,
                        `Supplier paid ${formatNgn(p.supplierPaidNgn || 0)}`,
                        p.transportNote ? `Note: ${p.transportNote}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={p.poID} className={CARD_ROW}>
                          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                            <div className="min-w-0 leading-tight flex-1">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                  <span className="font-mono">{p.poID}</span>
                                  <span className="font-medium text-slate-600"> · {p.supplierName}</span>
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                    {formatNgn(poTotalNgn(p))}
                                  </span>
                                  <span
                                    className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${statusChipBorder(p.status)}`}
                                  >
                                    {p.status}
                                  </span>
                                </div>
                              </div>
                              <p
                                className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                title={meta2}
                              >
                                {meta2}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1.5 mt-1 border-t border-dashed border-slate-200">
                            {p.status === 'Pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-[#134e4a] text-white hover:brightness-110"
                                  onClick={async () => {
                                    const r = await setPurchaseOrderStatus(p.poID, 'Approved');
                                    if (r.ok) showToast(`${p.poID} approved.`);
                                    else showToast(r.error || 'Update failed', { variant: 'error' });
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  onClick={async () => {
                                    const r = await setPurchaseOrderStatus(p.poID, 'Rejected');
                                    if (r.ok) showToast(`${p.poID} rejected.`);
                                    else showToast(r.error || 'Update failed', { variant: 'error' });
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            ) : null}
                            {p.status === 'Approved' || p.status === 'On loading' ? (
                              <button
                                type="button"
                                className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100"
                                onClick={() => {
                                  setTransportForm({
                                    poID: p.poID,
                                    agentId: p.transportAgentId || '',
                                    transportReference: p.transportReference || '',
                                    transportNote: p.transportNote || '',
                                  });
                                  setShowTransportModal(true);
                                }}
                              >
                                {p.status === 'On loading' ? 'Edit transport' : 'Assign transport'}
                              </button>
                            ) : null}
                            {p.status === 'On loading' ? (
                              <button
                                type="button"
                                className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                                onClick={() => {
                                  setPostTransportForm({
                                    poID: p.poID,
                                    amountNgn: '',
                                    treasuryAccountId: String(treasuryAccounts[0]?.id ?? ''),
                                    reference: p.transportReference || '',
                                    dateISO: new Date().toISOString().slice(0, 10),
                                    note: '',
                                    recordTreasury: false,
                                  });
                                  setShowPostTransportModal(true);
                                }}
                              >
                                Post in transit
                              </button>
                            ) : null}
                            {p.status === 'In Transit' && !p.transportPaid ? (
                              <button
                                type="button"
                                className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200"
                                onClick={async () => {
                                  const r = await markPurchaseTransportPaid(p.poID);
                                  if (r.ok) showToast('Haulage marked settled (no treasury line).');
                                  else showToast(r.error || 'Update failed', { variant: 'error' });
                                }}
                              >
                                Haulage settled
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={!canRecordSupplierPayment}
                              title={
                                canRecordSupplierPayment
                                  ? undefined
                                  : 'Supplier payments are controlled in Finance for signed-in finance roles.'
                              }
                              className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-slate-200 text-[#134e4a] bg-white hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                if (!canRecordSupplierPayment) return;
                                setPayForm({
                                  poID: p.poID,
                                  amountNgn: '',
                                  note: '',
                                  paidBy: currentActorLabel,
                                  treasuryAccountId: String(treasuryAccounts[0]?.id ?? ''),
                                });
                                setShowPayModal(true);
                              }}
                            >
                              Supplier pay
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {activeTab === 'transport' && (
                <div className="space-y-3">
                  <div
                    role="tablist"
                    className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 p-1 bg-slate-50"
                  >
                    {TRANSPORT_SUBS.map((sub) => {
                      const active = transportSubTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTransportSubTab(sub.id)}
                          className={`px-3 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all ${
                            active
                              ? 'bg-[#134e4a] text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-white'
                          }`}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                  {transportSubTab === 'agents' && (
                    agents.length === 0 ? (
                      <p className="text-[11px] text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                        No transport agents yet — add one from the header.
                      </p>
                    ) : (
                    <ul className="space-y-1.5">
                        {agents.map((a) => (
                          <li
                            key={a.id}
                            className={`${CARD_ROW} flex items-start justify-between gap-2`}
                          >
                            <div className="min-w-0 leading-tight flex-1">
                              <p className="text-[11px] font-bold text-[#134e4a] truncate">
                                <span className="font-mono">{a.id}</span>
                                <span className="font-medium text-slate-600"> · {a.name}</span>
                              </p>
                              <p className="text-[8px] text-slate-500 mt-0.5 truncate" title={`${a.region} · ${a.phone}`}>
                                {a.region} · {a.phone}
                              </p>
                            </div>
                            <div className="flex items-center gap-0 shrink-0">
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => openEditAgent(a)}
                                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                onClick={() => void removeAgent(a)}
                                className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                    )
                  )}
                  {transportSubTab === 'transit' && (
                    purchaseOrders.filter((p) => p.status === 'On loading' || p.status === 'In Transit')
                        .length === 0 ? (
                      <p className="text-[11px] text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                        Nothing on loading or in transit.
                      </p>
                    ) : (
                    <ul className="space-y-1.5">
                        {purchaseOrders
                          .filter((p) => p.status === 'On loading' || p.status === 'In Transit')
                          .map((p) => {
                            const meta2 = [
                              `Agent ${p.transportAgentName || '—'}`,
                              p.transportReference ? `Ref ${p.transportReference}` : null,
                              p.transportNote,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <li key={p.poID} className={CARD_ROW}>
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <div className="min-w-0 leading-tight flex-1">
                                    <p className="text-[11px] font-bold text-[#134e4a] truncate">
                                      <span className="font-mono">{p.poID}</span>
                                      <span className="font-medium text-slate-600"> · {p.supplierName}</span>
                                    </p>
                                    <p
                                      className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                      title={meta2}
                                    >
                                      {meta2}
                                    </p>
                                  </div>
                                  <span
                                    className={`text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border shrink-0 ${statusChipBorder(p.status)}`}
                                  >
                                    {p.status}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                    </ul>
                    )
                  )}
                </div>
              )}

              {activeTab === 'suppliers' && (
                filteredSuppliers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                    No suppliers match this search.
                  </p>
                ) : (
                <ul className="space-y-1.5">
                    {filteredSuppliers.map((s) => (
                      <li
                        key={s.supplierID}
                        className={`${CARD_ROW} flex items-stretch gap-0 !p-0 overflow-hidden`}
                      >
                        <Link
                          to={`/procurement/suppliers/${encodeURIComponent(s.supplierID)}`}
                          className="flex-1 min-w-0 py-1.5 px-2.5 hover:bg-[#134e4a]/[0.04] transition-colors leading-tight"
                        >
                          <p className="text-[11px] font-bold text-[#134e4a] truncate">
                            <span className="font-mono">{s.supplierID}</span>
                            <span className="font-medium text-slate-600"> · {s.name}</span>
                          </p>
                          <p className="text-[8px] text-slate-500 mt-0.5">
                            {s.city || '—'} · <span className="font-semibold text-sky-800">Profile →</span>
                          </p>
                        </Link>
                        <div className="flex items-center pr-1 border-l border-slate-200/80 bg-white/60 shrink-0">
                          <button
                            type="button"
                            title="Edit"
                            onClick={(e) => {
                              e.preventDefault();
                              openEditSupplier(s);
                            }}
                            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={(e) => {
                              e.preventDefault();
                              void removeSupplier(s);
                            }}
                            className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
                )
              )}

              {activeTab === 'conversion' && (
                <div className="space-y-3 min-w-0">
                  <ProcurementFormSection letter="C" title="What conversion means" compact>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">Conversion</strong> is kg per metre (kg ÷ m) for a coil or run.
                      Multiply by your <strong className="text-slate-800">₦/kg purchase price</strong> for approximate{' '}
                      <strong className="text-slate-800">cost per metre</strong>. Production compares actual kg/m to the
                      purchase offer; if higher than expected by about{' '}
                      {Math.round((CONVERSION_FLAG_RATIO - 1) * 100)}%+, check waste, gauge drift, or measurement.
                    </p>
                  </ProcurementFormSection>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-2">Live calculator</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Offer kg"
                        value={conversionCalc.offerKg}
                        onChange={(e) => setConversionCalc((x) => ({ ...x, offerKg: e.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Offer metres"
                        value={conversionCalc.offerMeters}
                        onChange={(e) => setConversionCalc((x) => ({ ...x, offerMeters: e.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price per kg (₦)"
                        value={conversionCalc.pricePerKg}
                        onChange={(e) => setConversionCalc((x) => ({ ...x, pricePerKg: e.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`${PILL} bg-teal-100 text-teal-800`}>
                        kg/m: {calcKgPerM == null ? '—' : calcKgPerM.toFixed(6)}
                      </span>
                      <span className={`${PILL} bg-amber-100 text-amber-900`}>
                        Cost/m: {calcCostPerM == null ? '—' : formatNgn(calcCostPerM)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200/60 bg-white/30 backdrop-blur-md p-2 shadow-sm">
                    {procurementCatalog.length === 0 ? (
                      <p className="text-[11px] text-slate-500 py-4 px-2 text-center">
                        No conversion rows — add one from the header.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {procurementCatalog.map((c) => {
                          const meta2 = [
                            `${Number(c.offerKg || 0).toLocaleString()} kg`,
                            `${Number(c.offerMeters || 0).toLocaleString()} m`,
                            c.label,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <li
                              key={c.id}
                              className={`${CARD_ROW} flex items-start justify-between gap-2`}
                            >
                              <div className="min-w-0 leading-tight flex-1">
                                <p className="text-[11px] font-bold text-[#134e4a] truncate">
                                  {c.color}
                                  <span className="font-medium text-slate-600"> · {c.gauge}</span>
                                  <span className="font-mono tabular-nums"> · {c.conversionKgPerM} kg/m</span>
                                </p>
                                <p
                                  className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                                  title={meta2}
                                >
                                  {meta2}
                                </p>
                              </div>
                              <div className="flex items-center gap-0 shrink-0">
                                <button
                                  type="button"
                                  title="Edit conversion"
                                  onClick={() => openEditConversion(c)}
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete conversion"
                                  onClick={() => void removeConversion(c)}
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </MainPanel>
        </div>
      </div>

      <CoilPurchaseOrderModal
        isOpen={showCoilPoModal}
        onClose={() => setShowCoilPoModal(false)}
        suppliers={suppliers}
        masterData={ws?.snapshot?.masterData ?? null}
        onQuickAddSupplier={() => {
          setShowCoilPoModal(false);
          openSupplierModal();
        }}
        onSubmit={async (payload) => {
          const res = await createPurchaseOrder({ ...payload, status: 'Pending' });
          if (!res.ok) {
            showToast(res.error || 'Could not save PO', { variant: 'error' });
            return false;
          }
          showToast(`${res.poID} created — approve, then assign transport.`);
          return true;
        }}
      />

      <ModalFrame isOpen={showTransportModal} onClose={() => setShowTransportModal(false)}>
        <div className="z-modal-panel max-w-md p-8">
          <h3 className="text-lg font-bold text-[#134e4a] mb-4">Link transport agent</h3>
          <p className="text-xs text-slate-500 mb-4">
            Attach the haulier and a waybill or trip reference. The PO moves to <strong>On loading</strong>{' '}
            until you use <strong>Post to in transit</strong> (optionally with a treasury payment linked to
            this PO). Store / Production see it as in transit only after that post.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ag = agents.find((a) => a.id === transportForm.agentId);
              if (!transportForm.poID || !ag) {
                showToast('Select PO and agent.', { variant: 'error' });
                return;
              }
              const r = await linkTransportToPurchaseOrder(transportForm.poID, {
                transportAgentId: ag.id,
                transportAgentName: ag.name,
                transportReference: transportForm.transportReference,
                transportNote: transportForm.transportNote,
              });
              if (!r.ok) {
                showToast(r.error || 'Link failed', { variant: 'error' });
                return;
              }
              setShowTransportModal(false);
              showToast('Transport linked — PO is on loading until you post to in transit.');
            }}
          >
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Agent</label>
              <select
                required
                value={transportForm.agentId}
                onChange={(e) => setTransportForm((f) => ({ ...f, agentId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              >
                <option value="">Select…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.region}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Transport reference
              </label>
              <input
                value={transportForm.transportReference}
                onChange={(e) =>
                  setTransportForm((f) => ({ ...f, transportReference: e.target.value }))
                }
                placeholder="Waybill / trip / transport transaction ref"
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Note
              </label>
              <textarea
                rows={2}
                value={transportForm.transportNote}
                onChange={(e) => setTransportForm((f) => ({ ...f, transportNote: e.target.value }))}
                placeholder="Pickup split, shared Abuja route, special instruction..."
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-medium resize-none"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Save link
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showPostTransportModal} onClose={() => setShowPostTransportModal(false)}>
        <div className="z-modal-panel max-w-md p-8">
          <h3 className="text-lg font-bold text-[#134e4a] mb-2">Post to in transit</h3>
          <p className="text-xs text-slate-500 mb-4">
            Confirms the PO is on the road for Operations / GRN. Optionally record the haulage payment as a
            treasury outflow linked to this PO (source <span className="font-mono">PURCHASE_ORDER</span>).
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const poID = postTransportForm.poID;
              if (!poID) return;
              if (postTransportForm.recordTreasury) {
                if (!canRecordTransportTreasury) {
                  showToast('Treasury haulage posting requires a finance role.', { variant: 'error' });
                  return;
                }
                const amt = Number(postTransportForm.amountNgn);
                if (!postTransportForm.treasuryAccountId || Number.isNaN(amt) || amt <= 0) {
                  showToast('Select account and enter haulage amount.', { variant: 'error' });
                  return;
                }
                const r = await postPurchaseOrderTransport(poID, {
                  treasuryAccountId: postTransportForm.treasuryAccountId,
                  amountNgn: amt,
                  reference: postTransportForm.reference,
                  dateISO: postTransportForm.dateISO,
                  note: postTransportForm.note,
                });
                if (!r.ok) showToast(r.error || 'Post failed', { variant: 'error' });
                else {
                  showToast('Posted in transit with treasury movement.');
                  setShowPostTransportModal(false);
                }
                return;
              }
              const r2 = await postPurchaseOrderTransport(poID, {
                reference: postTransportForm.reference,
                dateISO: postTransportForm.dateISO,
                note: postTransportForm.note,
              });
              if (!r2.ok) showToast(r2.error || 'Post failed', { variant: 'error' });
              else {
                showToast('PO marked in transit (no treasury line).');
                setShowPostTransportModal(false);
              }
            }}
          >
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Reference (waybill / trip)
              </label>
              <input
                value={postTransportForm.reference}
                onChange={(e) =>
                  setPostTransportForm((f) => ({ ...f, reference: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Posting date
              </label>
              <input
                type="date"
                value={postTransportForm.dateISO}
                onChange={(e) =>
                  setPostTransportForm((f) => ({ ...f, dateISO: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={postTransportForm.recordTreasury}
                onChange={(e) =>
                  setPostTransportForm((f) => ({ ...f, recordTreasury: e.target.checked }))
                }
                className="h-4 w-4 accent-[#134e4a]"
              />
              Record haulage from treasury (links movement to this PO)
            </label>
            {postTransportForm.recordTreasury ? (
              <>
                {!canRecordTransportTreasury ? (
                  <p className="text-[10px] text-amber-700">
                    Sign in with finance access to post treasury movements, or clear the checkbox to mark
                    in transit only.
                  </p>
                ) : null}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Haulage amount ₦
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={postTransportForm.amountNgn}
                    onChange={(e) =>
                      setPostTransportForm((f) => ({ ...f, amountNgn: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Pay from account
                  </label>
                  <select
                    value={postTransportForm.treasuryAccountId}
                    onChange={(e) =>
                      setPostTransportForm((f) => ({ ...f, treasuryAccountId: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                  >
                    <option value="">Select account…</option>
                    {treasuryAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatNgn(a.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Note</label>
              <input
                value={postTransportForm.note}
                onChange={(e) => setPostTransportForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm"
                placeholder="Optional"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Confirm post
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showPayModal} onClose={() => setShowPayModal(false)}>
        <div className="z-modal-panel max-w-md p-8">
          <h3 className="text-lg font-bold text-[#134e4a] mb-2">Supplier payment</h3>
          <p className="text-xs text-slate-500 mb-4">
            Finance records amount paid against the PO and updates the live payable balance.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await recordPurchaseSupplierPayment(
                payForm.poID,
                payForm.amountNgn,
                payForm.note,
                {
                  treasuryAccountId: payForm.treasuryAccountId,
                  reference: payForm.note,
                  createdBy: payForm.paidBy,
                }
              );
              if (!r.ok) showToast(r.error, { variant: 'error' });
              else {
                showToast('Payment recorded.');
                setShowPayModal(false);
              }
            }}
          >
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Amount ₦</label>
              <input
                required
                type="number"
                min="1"
                value={payForm.amountNgn}
                onChange={(e) => setPayForm((f) => ({ ...f, amountNgn: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Recorded by</label>
              <select
                value={payForm.paidBy}
                onChange={(e) => setPayForm((f) => ({ ...f, paidBy: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              >
                <option value="MD">MD</option>
                <option value="Accounts">Accounts</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Pay from account
              </label>
              <select
                required
                value={payForm.treasuryAccountId}
                onChange={(e) => setPayForm((f) => ({ ...f, treasuryAccountId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              >
                <option value="">Select account…</option>
                {treasuryAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatNgn(a.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Note</label>
              <input
                value={payForm.note}
                onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm"
                placeholder="Bank ref…"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Record payment
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showSupplierModal}
        onClose={() => {
          setShowSupplierModal(false);
          setEditingSupplierId(null);
        }}
      >
        <div className="z-modal-panel max-w-md p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">
              {editingSupplierId ? 'Edit supplier' : 'New supplier'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowSupplierModal(false);
                setEditingSupplierId(null);
              }}
              className="p-2 text-slate-400"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={saveSupplier}>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Name *</label>
              <input
                required
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">City</label>
              <input
                value={supplierForm.city}
                onChange={(e) => setSupplierForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Kano / Lagos / Abuja"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Terms</label>
              <select
                value={supplierForm.paymentTerms}
                onChange={(e) => setSupplierForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold"
              >
                <option value="Credit">Credit</option>
                <option value="Advance">Advance</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">
                Quality score (0–100)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={supplierForm.qualityScore}
                onChange={(e) => setSupplierForm((f) => ({ ...f, qualityScore: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Notes</label>
              <textarea
                value={supplierForm.notes}
                onChange={(e) => setSupplierForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Internal notes…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              {editingSupplierId ? 'Update supplier' : 'Save supplier'}
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showAgentModal}
        onClose={() => {
          setShowAgentModal(false);
          setEditingAgentId(null);
        }}
      >
        <div className="z-modal-panel max-w-md p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">
              {editingAgentId ? 'Edit transport agent' : 'New transport agent'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAgentModal(false);
                setEditingAgentId(null);
              }}
              className="p-2 text-slate-400"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={saveAgent}>
            <input
              required
              placeholder="Agent name"
              value={agentForm.name}
              onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold"
            />
            <input
              placeholder="Phone"
              value={agentForm.phone}
              onChange={(e) => setAgentForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm"
            />
            <input
              placeholder="Region / route"
              value={agentForm.region}
              onChange={(e) => setAgentForm((f) => ({ ...f, region: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm"
            />
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              {editingAgentId ? 'Update agent' : 'Save agent'}
            </button>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)}>
        <div className="z-modal-panel max-w-md p-8">
          <h3 className="text-lg font-bold text-[#134e4a] mb-4">Attach supplier invoice</h3>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await attachSupplierInvoice(invoiceForm.poID, {
                invoiceNo: invoiceForm.invoiceNo,
                invoiceDateISO: invoiceForm.invoiceDateISO,
                deliveryDateISO: invoiceForm.deliveryDateISO,
              });
              if (!r.ok) {
                showToast(r.error || 'Save failed', { variant: 'error' });
                return;
              }
              setShowInvoiceModal(false);
              showToast('Invoice details saved on PO.');
            }}
          >
            <select
              required
              value={invoiceForm.poID}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, poID: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-bold"
            >
              <option value="">Select PO…</option>
              {purchaseOrders.map((p) => (
                <option key={p.poID} value={p.poID}>
                  {p.poID}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Invoice no"
              value={invoiceForm.invoiceNo}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceNo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm"
            />
            <input
              type="date"
              value={invoiceForm.invoiceDateISO}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceDateISO: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm"
            />
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              Save
            </button>
          </form>
        </div>
      </ModalFrame>
      <ModalFrame isOpen={showConversionModal} onClose={() => setShowConversionModal(false)}>
        <div className="z-modal-panel max-w-lg p-8">
          <h3 className="text-lg font-bold text-[#134e4a] mb-4">
            {editingConversionId ? 'Edit conversion row' : 'Add conversion row'}
          </h3>
          <form className="space-y-4" onSubmit={saveConversion}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Colour</label>
                <input
                  required
                  value={conversionForm.color}
                  onChange={(e) => setConversionForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Gauge</label>
                <input
                  required
                  value={conversionForm.gauge}
                  onChange={(e) => setConversionForm((f) => ({ ...f, gauge: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Stock item</label>
              <select
                required
                value={conversionForm.productID}
                onChange={(e) => setConversionForm((f) => ({ ...f, productID: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
              >
                <option value="">Select item…</option>
                {invProducts.filter((p) => p.unit === 'kg').map((p) => (
                  <option key={p.productID} value={p.productID}>
                    {p.name} ({p.productID})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Offer kg</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={conversionForm.offerKg}
                  onChange={(e) => setConversionForm((f) => ({ ...f, offerKg: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Offer m</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={conversionForm.offerMeters}
                  onChange={(e) => setConversionForm((f) => ({ ...f, offerMeters: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">kg/m</label>
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={conversionForm.conversionKgPerM}
                  onChange={(e) => setConversionForm((f) => ({ ...f, conversionKgPerM: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Note</label>
              <input
                value={conversionForm.label}
                onChange={(e) => setConversionForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-semibold"
                placeholder="Supplier / offer note"
              />
            </div>
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              {editingConversionId ? 'Update conversion' : 'Save conversion'}
            </button>
          </form>
        </div>
      </ModalFrame>
    </PageShell>
  );
};

export default Procurement;
