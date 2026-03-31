import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Truck,
  Anchor,
  Clock,
  DollarSign,
  X,
  ChevronDown,
  Banknote,
  AlertTriangle,
  Award,
  Ruler,
  Trophy,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';

import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import CoilPurchaseOrderModal from '../components/procurement/CoilPurchaseOrderModal';
import { ProcurementFormSection } from '../components/procurement/ProcurementFormSection';
import { PROCUREMENT_COIL_CATALOG, CONVERSION_FLAG_RATIO, formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { loadProcurementAgents, saveProcurementAgents } from '../lib/procurementAgentsStore';
import {
  loadProcurementSuppliers,
  saveProcurementSuppliers,
} from '../lib/procurementSuppliersStore';

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

const nextSupplierId = (list) => {
  const nums = list
    .map((s) => parseInt(String(s.supplierID).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `SUP-${String(n).padStart(3, '0')}`;
};

const PILL = 'inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide';

const statusTone = (st) => {
  if (st === 'Received') return 'bg-emerald-100 text-emerald-800';
  if (st === 'In Transit') return 'bg-sky-100 text-sky-900';
  if (st === 'On loading') return 'bg-violet-100 text-violet-900';
  if (st === 'Approved') return 'bg-teal-100 text-teal-900';
  if (st === 'Rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-900';
};

const Procurement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const {
    purchaseOrders,
    products: invProducts,
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
  const [agents, setAgents] = useState(() => loadProcurementAgents());
  const [suppliers, setSuppliers] = useState(() => loadProcurementSuppliers());

  const [searchQuery, setSearchQuery] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = ws?.snapshot;
    if (!ws?.hasWorkspaceData || !s) return;
    if (Array.isArray(s.transportAgents) && s.transportAgents.length > 0) {
      setAgents(s.transportAgents.map((a) => ({ ...a })));
    }
    if (Array.isArray(s.suppliers) && s.suppliers.length > 0) {
      setSuppliers(s.suppliers.map((x) => ({ ...x })));
    }
  }, [ws?.snapshot, ws?.hasWorkspaceData, ws?.refreshEpoch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [showCoilPoModal, setShowCoilPoModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [showPostTransportModal, setShowPostTransportModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

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

  useEffect(() => {
    saveProcurementAgents(agents);
  }, [agents]);

  useEffect(() => {
    saveProcurementSuppliers(suppliers);
  }, [suppliers]);

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
    if (ws?.hasWorkspaceData && Array.isArray(fromMd) && fromMd.length > 0) return fromMd;
    const snap = ws?.snapshot?.procurementCatalog;
    if (ws?.hasWorkspaceData && Array.isArray(snap) && snap.length > 0) return snap;
    return PROCUREMENT_COIL_CATALOG;
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
  };

  const newButtonLabel =
    activeTab === 'purchases'
      ? 'New coil PO'
      : activeTab === 'transport'
        ? 'New agent'
        : activeTab === 'suppliers'
          ? 'New supplier'
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
    } else if (editingSupplierId) {
      setSuppliers((prev) =>
        prev.map((s) =>
          s.supplierID === editingSupplierId
            ? {
                ...s,
                name: supplierForm.name.trim(),
                city,
                paymentTerms: supplierForm.paymentTerms,
                qualityScore: qScore,
                notes,
              }
            : s
        )
      );
    } else {
      setSuppliers((prev) => [
        {
          supplierID: nextSupplierId(prev),
          name: supplierForm.name.trim(),
          city,
          paymentTerms: supplierForm.paymentTerms,
          qualityScore: qScore,
          notes,
        },
        ...prev,
      ]);
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
      setSuppliers((prev) => prev.filter((x) => x.supplierID !== s.supplierID));
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
    } else if (editingAgentId) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === editingAgentId
            ? {
                ...a,
                name: agentForm.name.trim(),
                phone,
                region,
              }
            : a
        )
      );
    } else {
      setAgents((prev) => {
        const nums = prev
          .map((a) => parseInt(String(a.id).replace(/\D/g, ''), 10))
          .filter((n) => !Number.isNaN(n));
        const n = nums.length ? Math.max(...nums) + 1 : 1;
        return [
          {
            id: `AG-${String(n).padStart(3, '0')}`,
            name: agentForm.name.trim(),
            phone,
            region,
          },
          ...prev,
        ];
      });
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
      setAgents((prev) => prev.filter((x) => x.id !== a.id));
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
        title="Purchases"
        subtitle="Coil procurement (KG) for MD — suppliers Kano / Abuja / Lagos, transport, conversion (kg/m), Finance-ready payments."
        actions={
          <div className="flex flex-col gap-3 items-stretch w-full lg:max-w-none xl:max-w-5xl">
            <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-start lg:justify-end">
              <PageTabs tabs={procurementTabs} value={activeTab} onChange={setActiveTab} />
              {newButtonLabel ? (
                <button
                  type="button"
                  onClick={openPrimaryAction}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#134e4a] text-white px-4 py-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm hover:brightness-105 shrink-0"
                >
                  <Plus size={16} strokeWidth={2} /> {newButtonLabel}
                </button>
              ) : null}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
        <aside className="lg:col-span-1 space-y-5">
          <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="h-1 bg-[#134e4a]" />
            <div className="p-5">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Open commitments
              </h3>
              <p className="text-xl font-bold text-[#134e4a] tabular-nums">
                {formatNgn(
                  purchaseOrders
                    .filter((p) => !['Received', 'Rejected'].includes(p.status))
                    .reduce((s, p) => s + poTotalNgn(p), 0)
                )}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">
                {purchaseOrders.filter((p) => p.status === 'In Transit' || p.status === 'On loading').length}{' '}
                PO on road / loading
              </p>
            </div>
          </section>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5 text-left border-l-4 border-l-[#134e4a]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Banknote size={14} /> Outstanding (supplier)
            </p>
            <p className="text-2xl font-bold text-[#134e4a] tabular-nums">{formatNgn(outstandingSupplierNgn)}</p>
            <p className="text-[10px] text-slate-500 mt-2">Open PO value less paid</p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-5 border-l-4 border-l-transparent">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Award size={14} /> Best supplier
            </p>
            <p className="text-lg font-bold text-[#134e4a] leading-tight">{bestSupplier?.s.name ?? '—'}</p>
            <p className="text-[10px] text-slate-500 mt-2">Quality × volume heuristic</p>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-5 border-l-4 border-l-amber-500">
            <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> Low stock (coil SKUs)
            </p>
            <p className="text-2xl font-bold text-amber-900 tabular-nums">{lowStockCount}</p>
            <p className="text-[10px] text-amber-800/80 mt-2">Below reorder on kg lines</p>
          </div>

          <section className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#134e4a]">
                  <Trophy size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-700 leading-snug">
                    Top 5 coil stock (kg)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Same layout as main dashboard performers — by{' '}
                    <span className="font-medium text-slate-600">colour</span> &{' '}
                    <span className="font-medium text-slate-600">gauge</span> from live inventory.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/operations')}
                className="text-[9px] font-semibold text-[#134e4a] uppercase tracking-wide hover:underline shrink-0"
              >
                Stock
              </button>
            </div>
            <div
              className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 mb-3"
              role="group"
              aria-label="Stock view"
            >
              <span className="px-2.5 py-1.5 rounded-md text-[9px] font-semibold uppercase tracking-wide bg-white text-[#134e4a] shadow-sm border border-slate-200/80">
                Live store
              </span>
            </div>
            <div className="hidden min-[400px]:grid grid-cols-[1.75rem_1fr_auto] gap-x-2 gap-y-1 px-1 py-1.5 border-b border-slate-200 text-[8px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="text-center">#</span>
              <span>Colour · gauge</span>
              <span className="text-right">kg</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {topCoilStockRows.length === 0 ? (
                <li className="py-3 text-[10px] text-slate-500">No kg SKUs on file.</li>
              ) : (
                topCoilStockRows.map((row) => (
                  <li key={row.productID}>
                    <button
                      type="button"
                      onClick={() => navigate('/operations')}
                      className="w-full text-left py-2.5 px-1 rounded-lg hover:bg-slate-50/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/15"
                    >
                      <div className="min-[400px]:hidden space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#134e4a] text-[10px] font-bold text-white tabular-nums shrink-0">
                            {row.rank}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 line-clamp-2">
                            {row.gauge} · {row.colour}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 pl-8 line-clamp-2">{row.materialType}</p>
                        <p className="text-[11px] font-semibold text-[#134e4a] tabular-nums pl-8">
                          {row.stockKg.toLocaleString()} kg
                        </p>
                      </div>
                      <div className="hidden min-[400px]:grid grid-cols-[1.75rem_1fr_auto] gap-x-2 items-center text-xs">
                        <span className="flex h-7 w-7 mx-auto items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-[#134e4a] tabular-nums">
                          {row.rank}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 block truncate">
                            {row.colour} · {row.gauge}
                          </span>
                          <span className="text-[10px] text-slate-500 line-clamp-1">{row.materialType}</span>
                        </div>
                        <span className="font-semibold text-[#134e4a] tabular-nums text-right shrink-0">
                          {row.stockKg.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="text-[10px] font-medium text-slate-500 mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
              Open Operations for GRN & adjustments
              <ChevronRight size={12} className="opacity-40 text-slate-400 shrink-0" />
            </p>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-5">
            <h3 className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-widest mb-3">
              Conversion reminder
            </h3>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              <strong>kg/m</strong> = kg ÷ metres. Cost per metre ≈ (kg/m) × (₦/kg). Flag production when
              actual kg/m is above standard or purchase offer by ~{Math.round((CONVERSION_FLAG_RATIO - 1) * 100)}%.
            </p>
          </section>
        </aside>

        <div className="lg:col-span-3 min-w-0">
          <MainPanel className="!rounded-xl !border-slate-200/90 !shadow-sm !bg-white !p-0 overflow-hidden">
            <div className="h-1 bg-[#134e4a]" />
            <div className="p-5 sm:p-6 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                    {TAB_LABELS[activeTab] ?? 'Records'}
                  </h2>
                </div>
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/10"
                  />
                </div>
              </div>

              {activeTab === 'purchases' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setShowInvoiceModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-[#134e4a]"
                    >
                      Supplier invoice
                    </button>
                  </div>
                  <div className="hidden sm:grid grid-cols-12 px-4 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                    <div className="col-span-2">PO</div>
                    <div className="col-span-3">Supplier</div>
                    <div className="col-span-2">Date</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-3">Status / actions</div>
                  </div>
                  {filteredPOs.map((p) => (
                    <div
                      key={p.poID}
                      className="rounded-xl border border-slate-200/90 bg-white shadow-sm px-4 py-3 sm:py-4 space-y-2"
                    >
                      <div className="grid grid-cols-12 gap-y-2 items-center">
                        <div className="col-span-12 sm:col-span-2 font-mono text-xs font-bold text-[#134e4a]">
                          {p.poID}
                        </div>
                        <div className="col-span-12 sm:col-span-3 text-sm font-semibold text-slate-800">
                          {p.supplierName}
                        </div>
                        <div className="col-span-12 sm:col-span-2 text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} /> {p.orderDateISO}
                        </div>
                        <div className="col-span-12 sm:col-span-2 text-right text-sm font-bold text-[#134e4a] tabular-nums">
                          {formatNgn(poTotalNgn(p))}
                        </div>
                        <div className="col-span-12 sm:col-span-3 flex flex-wrap gap-1.5 items-center">
                          <span className={`${PILL} ${statusTone(p.status)}`}>{p.status}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {p.lines.length} coil line(s)
                        {p.transportAgentName ? ` · ${p.transportAgentName}` : ''}
                        {p.transportReference ? ` · Ref ${p.transportReference}` : ''}
                        {p.transportTreasuryMovementId
                          ? ` · Treasury mv ${p.transportTreasuryMovementId}`
                          : ''}
                        {p.transportAmountNgn
                          ? ` · Haulage posted ${formatNgn(p.transportAmountNgn)}`
                          : ''}
                        {p.transportPaid ? ' · Haulage settled' : ''}
                        {' · Supplier paid '}
                        {formatNgn(p.supplierPaidNgn || 0)}
                      </p>
                      {p.transportNote ? (
                        <p className="text-[10px] text-slate-500">Transport note: {p.transportNote}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {p.status === 'Pending' ? (
                          <>
                            <button
                              type="button"
                              className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-[#134e4a] text-white"
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
                              className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg border border-slate-200"
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
                            className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-violet-700 text-white"
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
                            {p.status === 'On loading' ? 'Edit transport link' : 'Assign transport'}
                          </button>
                        ) : null}
                        {p.status === 'On loading' ? (
                          <button
                            type="button"
                            className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-sky-800 text-white"
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
                            Post to in transit
                          </button>
                        ) : null}
                        {p.status === 'In Transit' && !p.transportPaid ? (
                          <button
                            type="button"
                            className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-sky-700 text-white"
                            onClick={async () => {
                              const r = await markPurchaseTransportPaid(p.poID);
                              if (r.ok) showToast('Haulage marked settled (no treasury line).');
                              else showToast(r.error || 'Update failed', { variant: 'error' });
                            }}
                          >
                            Mark haulage settled
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
                          className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg border border-slate-200 text-[#134e4a] disabled:cursor-not-allowed disabled:opacity-40"
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
                          Record supplier payment
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'transport' && (
                <div className="space-y-6">
                  <div
                    role="tablist"
                    className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl border border-slate-200/90 bg-slate-50/90"
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
                          className={`px-4 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide ${
                            active
                              ? 'bg-[#134e4a] text-white shadow-sm'
                              : 'text-slate-500 hover:bg-white'
                          }`}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                  {transportSubTab === 'agents' && (
                    <div className="space-y-2">
                      {agents.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-stretch gap-2 rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden"
                        >
                          <div className="grid grid-cols-12 gap-2 px-4 py-3 flex-1 min-w-0">
                            <div className="col-span-3 text-xs font-bold text-[#134e4a]">{a.id}</div>
                            <div className="col-span-4 text-sm font-semibold truncate">{a.name}</div>
                            <div className="col-span-3 text-xs text-slate-500 truncate">{a.region}</div>
                            <div className="col-span-2 text-xs text-slate-500 truncate">{a.phone}</div>
                          </div>
                          <div className="flex items-center gap-1 pr-2 border-l border-slate-200/80 bg-white/60">
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => openEditAgent(a)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => void removeAgent(a)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {transportSubTab === 'transit' && (
                    <div className="space-y-2">
                      {purchaseOrders
                        .filter((p) => p.status === 'On loading' || p.status === 'In Transit')
                        .map((p) => (
                          <div
                            key={p.poID}
                            className="rounded-xl border border-slate-200 p-4 flex flex-wrap justify-between gap-3"
                          >
                            <div>
                              <p className="font-mono font-bold text-[#134e4a]">{p.poID}</p>
                              <p className="text-sm text-slate-700">{p.supplierName}</p>
                              <p className="text-[10px] text-slate-500">
                                Agent: {p.transportAgentName || '—'}
                                {p.transportReference ? ` · Ref ${p.transportReference}` : ''}
                              </p>
                              {p.transportNote ? <p className="text-[10px] text-slate-500">{p.transportNote}</p> : null}
                            </div>
                            <span className={`${PILL} ${statusTone(p.status)}`}>{p.status}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'suppliers' && (
                <div className="space-y-2">
                  {filteredSuppliers.map((s) => (
                    <div
                      key={s.supplierID}
                      className="flex items-stretch gap-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:border-teal-200/80 overflow-hidden"
                    >
                      <Link
                        to={`/procurement/suppliers/${encodeURIComponent(s.supplierID)}`}
                        className="grid grid-cols-12 gap-2 px-4 py-4 flex-1 min-w-0 items-center hover:bg-white/80 transition-all"
                      >
                        <div className="col-span-3 text-xs font-bold text-[#134e4a]">{s.supplierID}</div>
                        <div className="col-span-5 text-sm font-semibold text-slate-800 truncate">{s.name}</div>
                        <div className="col-span-2 text-xs text-slate-500">{s.city}</div>
                        <div className="col-span-2 text-[10px] font-bold uppercase text-slate-400 text-right">
                          Profile →
                        </div>
                      </Link>
                      <div className="flex items-center gap-1 pr-2 border-l border-slate-200/80 bg-white/60">
                        <button
                          type="button"
                          title="Edit"
                          onClick={(e) => {
                            e.preventDefault();
                            openEditSupplier(s);
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => {
                            e.preventDefault();
                            void removeSupplier(s);
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'conversion' && (
                <div className="space-y-6 max-w-3xl">
                  <ProcurementFormSection letter="C" title="What conversion means">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      <strong>Conversion</strong> is kg per metre (kg ÷ m) for a coil or run. Multiply by your{' '}
                      <strong>₦/kg purchase price</strong> to get approximate <strong>cost per metre</strong>.
                      Production compares actual kg/m to the standard from the purchase offer or coil history;
                      if it is higher than expected by about {Math.round((CONVERSION_FLAG_RATIO - 1) * 100)}% or
                      more, investigate waste, gauge drift, or measurement error.
                    </p>
                  </ProcurementFormSection>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-100 text-[9px] font-semibold text-slate-500 uppercase">
                      <div className="col-span-3">Colour</div>
                      <div className="col-span-2">Gauge</div>
                      <div className="col-span-2 text-right">kg/m</div>
                      <div className="col-span-5">Notes</div>
                    </div>
                    {procurementCatalog.map((c) => (
                      <div
                        key={c.id}
                        className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-slate-100 text-sm"
                      >
                        <div className="col-span-3 font-semibold text-[#134e4a]">{c.color}</div>
                        <div className="col-span-2">{c.gauge}</div>
                        <div className="col-span-2 text-right font-mono tabular-nums">{c.conversionKgPerM}</div>
                        <div className="col-span-5 text-xs text-slate-500">{c.label}</div>
                      </div>
                    ))}
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
    </PageShell>
  );
};

export default Procurement;
