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
  Pencil,
  Trash2,
  Info,
  Building2,
  Users,
  Paperclip,
} from 'lucide-react';

import { MainPanel, PageHeader, PageShell, PageTabs, ModalFrame } from '../components/layout';
import { AiAskButton } from '../components/AiAskButton';
import CoilPurchaseOrderModal from '../components/procurement/CoilPurchaseOrderModal';
import StonePurchaseOrderModal from '../components/procurement/StonePurchaseOrderModal';
import AccessoryPurchaseOrderModal from '../components/procurement/AccessoryPurchaseOrderModal';
import StoneAccessoryReceiptModal from '../components/procurement/StoneAccessoryReceiptModal';
import { ProcurementFormSection } from '../components/procurement/ProcurementFormSection';
import { PriceListPanel } from '../components/procurement/PriceListPanel';
import { MaterialPricingWorkbookModal } from '../components/procurement/MaterialPricingWorkbookModal';
import { CONVERSION_FLAG_RATIO, formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch, apiUrl } from '../lib/apiBase';
import { liveTopSalesPerformersByMaterial, purchaseOrderOrderedValueNgn } from '../lib/liveAnalytics';
import { procurementKindFromPo } from '../lib/procurementPoKind';
import { EditSecondApprovalInline } from '../components/EditSecondApprovalInline';
import { editMutationNeedsSecondApprovalRole } from '../lib/editApprovalUi';
import {
  SalesListSearchInput,
  SalesListSortBar,
  SalesListTableFrame,
} from '../components/sales/SalesListTableFrame';
import {
  ProcurementPayablePreviewSlideOver,
  ProcurementPoPreviewSlideOver,
} from '../components/procurement/ProcurementPreviewSlideOvers';
import { PROCUREMENT_PO_SORT_FIELDS, sortPurchaseOrdersList } from '../lib/procurementPoListSorting';
import { defaultTransportAgentProfile, mergeTransportAgentProfile } from '../lib/transportAgentIntel';
import { PAYABLES_SORT_FIELDS, sortAccountsPayableList } from '../lib/procurementPayablesSorting';
import { useAppTablePaging } from '../lib/appDataTable';
import { AppTablePager } from '../components/ui/AppDataTable';
import {
  defaultSupplierExtendedForm,
  extendedFormFromSupplier,
  padBankAccounts,
  padContacts,
  readFileAsBase64Data,
  SUPPLIER_BANK_ROW_TEMPLATE,
  SUPPLIER_CONTACT_ROW_TEMPLATE,
} from '../lib/supplierProfileForm';

/** Rows per column for Coil / Stone-coated / Accessories lists on Purchases. */
const PROCUREMENT_PURCHASES_COLUMN_PAGE_SIZE = 10;
const PAYABLES_TABLE_PAGE_SIZE = 10;

const TAB_LABELS = {
  purchases: 'Purchases',
  payables: 'Payments',
  suppliers: 'Suppliers',
  conversion: 'Conversion',
};

/** Kg coil SKUs below this on-hand level count as low stock on the Procurement KPI row. */
const PROCUREMENT_LOW_STOCK_KG_FLOOR = 700;

/** Coil materials for density-based standard conversion (maps to stock product_id). Stonecoated is excluded — different product class. */
const PROCUREMENT_COIL_MATERIALS = [
  { key: 'alu', label: 'Aluminium', productID: 'COIL-ALU', defaultCatalogLabel: 'Aluminium' },
  { key: 'aluzinc', label: 'Aluzinc (PPGI)', productID: 'PRD-102', defaultCatalogLabel: 'Aluzinc (PPGI)' },
];

function procurementCoilMaterialByKey(key) {
  return PROCUREMENT_COIL_MATERIALS.find((m) => m.key === key) ?? PROCUREMENT_COIL_MATERIALS[0];
}

/** Standard gauges (mm) used in yard / procurement. */
const STANDARD_COIL_GAUGES_MM = ['0.18', '0.20', '0.22', '0.24', '0.28', '0.30', '0.40', '0.45', '0.50', '0.55'];

/** Strip width for theoretical mass per metre (metres). */
const PROCUREMENT_STRIP_WIDTH_M = 1.2;

/** Mass density in g/cm³ (×1000 → kg/m³). Values confirmed with operations. */
const DENSITY_ALUMINIUM_G_CM3 = 2.7;
const DENSITY_ALUZINC_G_CM3 = 7.8;

function densityKgPerM3ForProcurementKey(materialKey) {
  if (materialKey === 'alu') return DENSITY_ALUMINIUM_G_CM3 * 1000;
  if (materialKey === 'aluzinc') return DENSITY_ALUZINC_G_CM3 * 1000;
  return null;
}

/** Theoretical kg/m: ρ (kg/m³) × strip width (m) × thickness (m); gaugeMm is thickness in mm. */
function kgPerMFromStripDensity(materialKey, gaugeMm) {
  const rho = densityKgPerM3ForProcurementKey(materialKey);
  if (rho == null || !Number.isFinite(gaugeMm) || gaugeMm <= 0) return null;
  return rho * PROCUREMENT_STRIP_WIDTH_M * (gaugeMm / 1000);
}

function coilMaterialKindFromProductId(productID) {
  if (productID === 'PRD-102') return 'aluzinc';
  if (productID === 'COIL-ALU') return 'aluminium';
  return '';
}

function purchaseOrderToCoilModalDraft(po) {
  return {
    poID: po.poID,
    supplierID: po.supplierID,
    orderDateISO: po.orderDateISO,
    expectedDeliveryISO: po.expectedDeliveryISO || '',
    lines: (po.lines || []).map((l) => ({
      lineKey: l.lineKey,
      materialKind: coilMaterialKindFromProductId(l.productID),
      color: l.color || '',
      gauge: l.gauge || '',
      kg: l.qtyOrdered,
      meters: l.metersOffered,
      pricePerKg: l.unitPricePerKgNgn ?? l.unitPriceNgn,
    })),
  };
}

function purchaseOrderToStoneModalDraft(po, products) {
  return {
    poID: po.poID,
    supplierID: po.supplierID,
    orderDateISO: po.orderDateISO,
    expectedDeliveryISO: po.expectedDeliveryISO || '',
    lines: (po.lines || []).map((l) => {
      const p = products.find((x) => x.productID === l.productID);
      const da = p?.dashboardAttrs || {};
      return {
        rowUid: l.lineKey,
        existingLineKey: l.lineKey,
        designLabel: da.stoneDesign || '',
        colourLabel: da.stoneColour || l.color || '',
        gaugeLabel: da.stoneGauge || l.gauge || '',
        metres: l.qtyOrdered,
        pricePerM: l.unitPriceNgn,
      };
    }),
  };
}

function purchaseOrderToAccessoryModalDraft(po) {
  return {
    poID: po.poID,
    supplierID: po.supplierID,
    orderDateISO: po.orderDateISO,
    expectedDeliveryISO: po.expectedDeliveryISO || '',
    lines: (po.lines || []).map((l) => ({
      rowUid: l.lineKey,
      existingLineKey: l.lineKey,
      productID: l.productID,
      qty: l.qtyOrdered,
      unitPrice: l.unitPriceNgn,
    })),
  };
}

function poLineSummaryLabel(kind) {
  if (kind === 'stone') return 'stone line(s)';
  if (kind === 'accessory') return 'accessory line(s)';
  return 'coil line(s)';
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

/** Left column (~⅓ width on large screens): transport agent directory; profiles open as full pages like suppliers. */
function ProcurementTransportAgentsAside({ agents, onEdit, onRemove, onRegister, transitRows, onPreviewTransitPo }) {
  return (
    <aside className="w-full lg:w-1/3 lg:max-w-md lg:shrink-0 rounded-xl border border-slate-200/90 bg-white shadow-sm flex flex-col max-h-[min(72vh,680px)] min-h-[240px]">
      <div className="h-1 bg-[#134e4a] rounded-t-xl shrink-0" />
      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Truck size={16} className="text-[#134e4a]" />
          Transport agents
        </h3>
        <p className="text-[9px] text-slate-500 mt-1 leading-snug">
          Haulage partners. Click a name for the full profile (like a supplier). Use the list below for loads on the road.
        </p>
        <button
          type="button"
          onClick={onRegister}
          className="mt-2 w-full rounded-lg border border-dashed border-[#134e4a]/40 bg-[#134e4a]/[0.04] py-2 text-[10px] font-semibold uppercase tracking-wide text-[#134e4a] hover:bg-[#134e4a]/10"
        >
          Register transport agent
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2">
        {agents.length === 0 ? (
          <p className="text-[10px] text-slate-500 text-center py-6 px-2 leading-relaxed">
            No agents yet. Register one here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {agents.map((a) => (
              <li key={a.id} className={`${CARD_ROW} flex items-start justify-between gap-2`}>
                <div className="min-w-0 leading-tight flex-1">
                  <p className="text-[10px] font-mono text-slate-500 truncate">{a.id}</p>
                  <Link
                    to={`/procurement/transport-agents/${encodeURIComponent(a.id)}`}
                    className="block text-[11px] font-bold text-[#134e4a] truncate hover:underline"
                  >
                    {a.name}
                  </Link>
                  <p
                    className="text-[8px] text-slate-500 mt-0.5 truncate"
                    title={`${a.region} · ${a.phone}`}
                  >
                    {a.region} · {a.phone}
                  </p>
                </div>
                <div className="flex items-center gap-0 shrink-0">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => onEdit(a)}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => void onRemove(a)}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {transitRows && transitRows.length > 0 ? (
        <div className="border-t border-slate-200/90 bg-slate-50/50 shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-3 pt-2.5 pb-1">
            On loading / in transit
          </p>
          <ul className="max-h-36 overflow-y-auto custom-scrollbar px-3 pb-2 space-y-1">
            {transitRows.map((p) => {
              const meta2 = [
                p.transportAgentName ? `Agent ${p.transportAgentName}` : null,
                p.transportReference ? `Ref ${p.transportReference}` : null,
                p.transportNote,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={p.poID}>
                  <button
                    type="button"
                    onClick={() => onPreviewTransitPo?.(p.poID)}
                    className={`w-full text-left ${CARD_ROW} !py-1.5 cursor-pointer`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 leading-tight flex-1">
                        <p className="text-[10px] font-bold text-[#134e4a] truncate">
                          <span className="font-mono">{p.poID}</span>
                          <span className="font-medium text-slate-600"> · {p.supplierName}</span>
                        </p>
                        <p
                          className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2"
                          title={meta2}
                        >
                          {meta2 || '—'}
                        </p>
                      </div>
                      <span
                        className={`text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border shrink-0 ${statusChipBorder(p.status)}`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

const Procurement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const {
    purchaseOrders,
    inTransitLoads,
    products: invProducts,
    createPurchaseOrder,
    updatePurchaseOrder,
    setPurchaseOrderStatus,
    linkTransportToPurchaseOrder,
  } = useInventory();
  const canRecordSupplierPayment = ws?.hasPermission?.('finance.pay') ?? true;
  const currentActorLabel = ws?.session?.user?.displayName ?? 'Accounts';
  const canAccessPriceList =
    (ws?.hasPermission?.('pricing.manage') || ws?.hasPermission?.('md.price_exception.approve')) ?? false;

  const [activeTab, setActiveTab] = useState('purchases');
  const [agents, setAgents] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [payablesOpenSearchQuery, setPayablesOpenSearchQuery] = useState('');
  const [payablesSettledSearchQuery, setPayablesSettledSearchQuery] = useState('');
  const [payablesOpenSort, setPayablesOpenSort] = useState({ field: 'due', dir: 'desc' });
  const [payablesSettledSort, setPayablesSettledSort] = useState({ field: 'due', dir: 'desc' });
  const [previewPo, setPreviewPo] = useState(null);
  const [previewAp, setPreviewAp] = useState(null);
  const [poListSort, setPoListSort] = useState({ field: 'date', dir: 'desc' });

   
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
   

  const [showMaterialPricingWorkbook, setShowMaterialPricingWorkbook] = useState(false);
  const [showCoilPoModal, setShowCoilPoModal] = useState(false);
  const [coilPoEditDraft, setCoilPoEditDraft] = useState(null);
  const [showStonePoModal, setShowStonePoModal] = useState(false);
  const [stonePoEditDraft, setStonePoEditDraft] = useState(null);
  const [showAccessoryPoModal, setShowAccessoryPoModal] = useState(false);
  const [accessoryPoEditDraft, setAccessoryPoEditDraft] = useState(null);
  const [showStoneAccessoryReceiptModal, setShowStoneAccessoryReceiptModal] = useState(false);
  /** Single-use token for PATCH on a PO (server consumes per request). */
  const [procurementPoEditApprovalId, setProcurementPoEditApprovalId] = useState('');
  /** PO id for list-level second-approval strip (Approve / Reject / transport actions). */
  const [procurementPoForApprovalUi, setProcurementPoForApprovalUi] = useState('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [showApPayModal, setShowApPayModal] = useState(false);
  const [selectedAp, setSelectedAp] = useState(null);
  const [apPayForm, setApPayForm] = useState({
    amountNgn: '',
    paymentMethod: 'Bank Transfer',
    debitAccountId: '',
  });
  const [supplierForm, setSupplierForm] = useState(() => ({
    name: '',
    city: '',
    paymentTerms: 'Credit',
    qualityScore: '80',
    notes: '',
    ...defaultSupplierExtendedForm(),
  }));
  const [supplierPendingFiles, setSupplierPendingFiles] = useState([]);
  const [agentForm, setAgentForm] = useState(() => ({
    name: '',
    phone: '',
    region: '',
    ...defaultTransportAgentProfile(),
  }));
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supplierEditApprovalId, setSupplierEditApprovalId] = useState('');
  const [editingAgentId, setEditingAgentId] = useState(null);
  const [agentEditApprovalId, setAgentEditApprovalId] = useState('');
  const [transportForm, setTransportForm] = useState({
    poID: '',
    agentId: '',
    transportReference: '',
    transportNote: '',
    transportFinanceAdvice: '',
    transportAmountNgn: '',
    transportAdvanceNgn: '',
  });
  /** Inline Conversion tab: standard kg/m by material (coil product) + gauge */
  const [standardConversionForm, setStandardConversionForm] = useState({
    materialKey: 'alu',
    gauge: STANDARD_COIL_GAUGES_MM.includes('0.24') ? '0.24' : STANDARD_COIL_GAUGES_MM[0] || '',
    color: PROCUREMENT_COIL_MATERIALS[0].defaultCatalogLabel,
    conversionKgPerM: '',
    label: '',
  });
  const [standardConversionSaving, setStandardConversionSaving] = useState(false);

   
  useEffect(() => {
    const t = location.state?.focusTab;
    if (!t || !TAB_LABELS[t]) return;
    setActiveTab(t);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const procurementTabs = useMemo(
    () => [
      { id: 'purchases', icon: <DollarSign size={16} />, label: 'Purchases' },
      { id: 'payables', icon: <Banknote size={16} />, label: 'Payments' },
      { id: 'suppliers', icon: <Anchor size={16} />, label: 'Suppliers' },
      { id: 'conversion', icon: <Ruler size={16} />, label: 'Conversion' },
    ],
    []
  );

  const outstandingSupplierNgn = useMemo(
    () =>
      purchaseOrders.reduce((s, p) => {
        if (p.status === 'Rejected') return s;
        const tot = purchaseOrderOrderedValueNgn(p);
        const paid = Number(p.supplierPaidNgn) || 0;
        return s + Math.max(0, tot - paid);
      }, 0),
    [purchaseOrders]
  );

  const openCommitmentsNgn = useMemo(
    () =>
      purchaseOrders
        .filter((p) => !['Received', 'Rejected'].includes(p.status))
        .reduce((s, p) => s + purchaseOrderOrderedValueNgn(p), 0),
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
      byId[p.supplierID] = (byId[p.supplierID] || 0) + purchaseOrderOrderedValueNgn(p);
    }
    let top = null;
    for (const s of suppliers) {
      const vol = byId[s.supplierID] || 0;
      const score = (s.qualityScore || 70) * Math.log10(10 + vol / 1e6);
      if (!top || score > top.score) top = { s, score, vol };
    }
    return top;
  }, [purchaseOrders, suppliers]);

  const productionJobs = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.productionJobs]
  );
  const quotations = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.quotations) ? ws.snapshot.quotations : []),
    [ws?.hasWorkspaceData, ws?.snapshot?.quotations]
  );

  const lowStockKgProducts = useMemo(
    () =>
      invProducts.filter(
        (p) => p.unit === 'kg' && Number(p.stockLevel) < PROCUREMENT_LOW_STOCK_KG_FLOOR
      ),
    [invProducts]
  );

  const lowStockCount = lowStockKgProducts.length;

  /** Demand = completed production attributed to colour×gauge×profile (rolling 12 months). */
  const lowStockHotLines = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    const performers = liveTopSalesPerformersByMaterial(productionJobs, quotations, {
      limit: null,
      startIso,
      endIso,
    });

    const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const gaugeNum = (g) => {
      const m = String(g ?? '').match(/(\d+(?:\.\d+)?)/);
      return m ? m[1] : '';
    };
    const colourMatch = (a, b) => {
      const x = norm(a);
      const y = norm(b);
      if (!x || !y) return false;
      return x === y || x.includes(y) || y.includes(x);
    };
    const gaugeMatch = (a, b) => {
      const x = gaugeNum(a);
      const y = gaugeNum(b);
      if (!x && !y) return true;
      return x === y && x !== '';
    };
    const profileMatch = (a, b) => {
      const x = norm(a);
      const y = norm(b);
      if (!x || !y) return true;
      return x === y || x.includes(y) || y.includes(x);
    };

    const demandForAttrs = (attrs) => {
      let best = 0;
      for (const perf of performers) {
        if (!colourMatch(attrs.colour, perf.colour)) continue;
        if (!gaugeMatch(attrs.gauge, perf.gaugeRaw)) continue;
        if (!profileMatch(attrs.materialType, perf.materialType)) continue;
        const s = Number(perf.revenueNgn) || 0;
        const m = Number(perf.metresProduced) || 0;
        const score = s > 0 ? s : m;
        if (score > best) best = score;
      }
      return best;
    };

    const rows = lowStockKgProducts.map((p) => {
      const a = p.dashboardAttrs ?? {};
      const colour = a.colour || '—';
      const gauge = a.gauge || '—';
      return {
        productID: p.productID,
        label: `${colour} · ${gauge}`,
        colour,
        gauge,
        stockKg: Number(p.stockLevel) || 0,
        thresholdKg: PROCUREMENT_LOW_STOCK_KG_FLOOR,
        demandScore: demandForAttrs({
          colour,
          gauge,
          materialType: a.materialType || p.name,
        }),
      };
    });

    rows.sort(
      (x, y) =>
        (y.demandScore - x.demandScore) ||
        (x.stockKg - y.stockKg) ||
        x.label.localeCompare(y.label)
    );
    return rows.slice(0, 3);
  }, [lowStockKgProducts, productionJobs, quotations]);
  const treasuryAccounts =
    ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.treasuryAccounts) ? ws.snapshot.treasuryAccounts : [];

  const payables = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.accountsPayable)
        ? ws.snapshot.accountsPayable.map((x) => ({ ...x }))
        : [],
    [ws?.hasWorkspaceData, ws?.snapshot?.accountsPayable, ws?.refreshEpoch]
  );

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const branchOptions = useMemo(
    () => ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [],
    [ws?.snapshot?.workspaceBranches, ws?.session?.branches]
  );
  const branchNameById = useMemo(
    () =>
      Object.fromEntries(
        branchOptions.map((b) => [String(b.id || '').trim(), b.name || b.code || b.id || 'Unknown branch'])
      ),
    [branchOptions]
  );

  const payablesOpenSource = useMemo(
    () =>
      payables.filter((p) => (Number(p.paidNgn) || 0) < (Number(p.amountNgn) || 0)),
    [payables]
  );
  const payablesSettledSource = useMemo(
    () =>
      payables.filter((p) => (Number(p.paidNgn) || 0) >= (Number(p.amountNgn) || 0)),
    [payables]
  );

  const filteredOpenPayables = useMemo(() => {
    const qq = payablesOpenSearchQuery.trim().toLowerCase();
    if (!qq) return payablesOpenSource;
    return payablesOpenSource.filter((p) => {
      const blob = [p.apID, p.supplierName, p.poRef, p.invoiceRef].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [payablesOpenSource, payablesOpenSearchQuery]);

  const filteredSettledPayables = useMemo(() => {
    const qq = payablesSettledSearchQuery.trim().toLowerCase();
    if (!qq) return payablesSettledSource;
    return payablesSettledSource.filter((p) => {
      const blob = [p.apID, p.supplierName, p.poRef, p.invoiceRef].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [payablesSettledSource, payablesSettledSearchQuery]);

  const sortedOpenPayables = useMemo(
    () => sortAccountsPayableList(filteredOpenPayables, payablesOpenSort.field, payablesOpenSort.dir),
    [filteredOpenPayables, payablesOpenSort]
  );
  const sortedSettledPayables = useMemo(
    () => sortAccountsPayableList(filteredSettledPayables, payablesSettledSort.field, payablesSettledSort.dir),
    [filteredSettledPayables, payablesSettledSort]
  );

  const openPayablesPage = useAppTablePaging(
    sortedOpenPayables,
    PAYABLES_TABLE_PAGE_SIZE,
    payablesOpenSort.field,
    payablesOpenSort.dir,
    payablesOpenSearchQuery
  );
  const settledPayablesPage = useAppTablePaging(
    sortedSettledPayables,
    PAYABLES_TABLE_PAGE_SIZE,
    payablesSettledSort.field,
    payablesSettledSort.dir,
    payablesSettledSearchQuery
  );

  const payablesOutstandingNgn = useMemo(
    () => payables.reduce((s, r) => s + Math.max(0, r.amountNgn - (r.paidNgn || 0)), 0),
    [payables]
  );

  const openSupplierModal = () => {
    setEditingSupplierId(null);
    setSupplierPendingFiles([]);
    setSupplierForm({
      name: '',
      city: '',
      paymentTerms: 'Credit',
      qualityScore: '80',
      notes: '',
      ...defaultSupplierExtendedForm(),
    });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplierId(s.supplierID);
    setSupplierEditApprovalId('');
    setSupplierPendingFiles([]);
    setSupplierForm({
      name: s.name || '',
      city: s.city && s.city !== '—' ? s.city : '',
      paymentTerms: s.paymentTerms || 'Credit',
      qualityScore: String(s.qualityScore ?? 80),
      notes: s.notes || '',
      ...extendedFormFromSupplier(s),
    });
    setShowSupplierModal(true);
  };

  const openAgentModal = () => {
    setEditingAgentId(null);
    setAgentEditApprovalId('');
    setAgentForm({
      name: '',
      phone: '',
      region: '',
      ...defaultTransportAgentProfile(),
    });
    setShowAgentModal(true);
  };

  const openEditAgent = (a) => {
    setEditingAgentId(a.id);
    setAgentEditApprovalId('');
    const pr = mergeTransportAgentProfile(a.profile);
    setAgentForm({
      name: a.name || '',
      phone: a.phone && a.phone !== '—' ? a.phone : '',
      region: a.region && a.region !== '—' ? a.region : '',
      ...pr,
    });
    setShowAgentModal(true);
  };

  const openPrimaryAction = () => {
    if (activeTab === 'purchases') {
      setCoilPoEditDraft(null);
      setShowCoilPoModal(true);
    } else if (activeTab === 'suppliers') openSupplierModal();
  };

  const newButtonLabel =
    activeTab === 'purchases' ? null : activeTab === 'suppliers' ? 'New supplier' : null;

  const canManagePo = Boolean(ws?.hasPermission?.('purchase_orders.manage'));

  const saveStandardConversion = async (e) => {
    e.preventDefault();
    const matOpt = procurementCoilMaterialByKey(standardConversionForm.materialKey);
    const colorFallback = matOpt.defaultCatalogLabel;
    const color = standardConversionForm.color.trim() || colorFallback;
    const gauge = standardConversionForm.gauge.trim();
    const gaugeMm = parseFloat(gauge, 10);
    const override = Number(standardConversionForm.conversionKgPerM);
    let conversion = null;
    if (Number.isFinite(override) && override > 0) {
      conversion = override;
    } else {
      conversion = kgPerMFromStripDensity(standardConversionForm.materialKey, gaugeMm);
    }
    if (!matOpt.productID || !gauge || conversion == null || !Number.isFinite(conversion) || conversion <= 0) {
      showToast('Select material and gauge, or enter a valid kg/m override.', { variant: 'error' });
      return;
    }
    const payload = {
      color,
      gauge,
      productID: matOpt.productID,
      offerKg: 0,
      offerMeters: 0,
      conversionKgPerM: Number(conversion.toFixed(6)),
      label:
        standardConversionForm.label.trim() ||
        `Standard (density) · ${matOpt.label} · ${gauge} mm`,
    };
    if (!ws?.canMutate) {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to save — workspace is read-only.'
          : 'Connect to the API to save standard conversion.',
        { variant: 'info' }
      );
      return;
    }
    setStandardConversionSaving(true);
    try {
      const { ok, data } = await apiFetch('/api/setup/procurementCatalog', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save standard conversion.', { variant: 'error' });
        return;
      }
      await ws.refresh();
      const opt = procurementCoilMaterialByKey(standardConversionForm.materialKey);
      setStandardConversionForm((f) => ({
        ...f,
        conversionKgPerM: '',
        label: '',
        color: opt.defaultCatalogLabel,
      }));
      showToast('Standard conversion saved.');
    } finally {
      setStandardConversionSaving(false);
    }
  };

  const stdGaugeMm = parseFloat(standardConversionForm.gauge, 10);
  const stdOverrideKgPerM = Number(standardConversionForm.conversionKgPerM);
  const standardPhysicsKgPerM = kgPerMFromStripDensity(standardConversionForm.materialKey, stdGaugeMm);
  const standardEffectiveKgPerM =
    Number.isFinite(stdOverrideKgPerM) && stdOverrideKgPerM > 0
      ? stdOverrideKgPerM
      : standardPhysicsKgPerM;

  const saveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast('Enter supplier name.', { variant: 'error' });
      return;
    }
    for (const f of supplierPendingFiles) {
      if (f.file.size > 720_000) {
        showToast(`File "${f.file.name}" is too large (max ~700 KB per agreement).`, { variant: 'error' });
        return;
      }
    }
    const city = supplierForm.city.trim() || '—';
    const qScore = Number(supplierForm.qualityScore) || 80;
    const notes = supplierForm.notes.trim() || 'Added from procurement.';
    const wasEditSupplier = Boolean(editingSupplierId);

    const banks = padBankAccounts(supplierForm.bankAccounts, 2, 6).filter(
      (b) => String(b.bankName || '').trim() || String(b.accountNumber || '').trim() || String(b.accountName || '').trim()
    );
    const contacts = padContacts(supplierForm.contacts, 3, 6).filter(
      (c) => String(c.name || '').trim() || String(c.email || '').trim() || String(c.phone || '').trim()
    );
    const removed = new Set(supplierForm.removedAgreementIds || []);
    const keptMeta = (supplierForm.agreementMeta || []).filter((a) => a?.id && !removed.has(a.id));
    const keptAgreements = keptMeta.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType || 'application/octet-stream',
      uploadedAtIso: a.uploadedAtIso || new Date().toISOString(),
    }));
    const newAgreements = [];
    for (const row of supplierPendingFiles) {
      try {
        const dataBase64 = await readFileAsBase64Data(row.file);
        newAgreements.push({
          id: row.id,
          fileName: row.file.name,
          mimeType: row.file.type || 'application/octet-stream',
          uploadedAtIso: new Date().toISOString(),
          dataBase64,
        });
      } catch {
        showToast(`Could not read file "${row.file.name}".`, { variant: 'error' });
        return;
      }
    }

    const supplierProfile = {
      companyEmail: supplierForm.companyEmail.trim(),
      website: supplierForm.website.trim(),
      vatTin: supplierForm.vatTin.trim(),
      rcNumber: supplierForm.rcNumber.trim(),
      registeredAddress: supplierForm.registeredAddress.trim(),
      billingAddress: supplierForm.billingAddress.trim(),
      phoneMain: supplierForm.phoneMain.trim(),
      whatsapp: supplierForm.whatsapp.trim(),
      notesCommercial: supplierForm.notesCommercial.trim(),
      bankAccounts: banks,
      contacts,
      agreements: [...keptAgreements, ...newAgreements],
    };

    if (ws?.canMutate) {
      if (editingSupplierId) {
        const patch = {
          name: supplierForm.name.trim(),
          city,
          paymentTerms: supplierForm.paymentTerms,
          qualityScore: qScore,
          notes,
          supplierProfile,
        };
        if (String(supplierEditApprovalId || '').trim()) {
          patch.editApprovalId = String(supplierEditApprovalId).trim();
        }
        const { ok, data } = await apiFetch(
          `/api/suppliers/${encodeURIComponent(editingSupplierId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(patch),
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
            supplierProfile,
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
      ...defaultSupplierExtendedForm(),
    });
    setSupplierPendingFiles([]);
    setEditingSupplierId(null);
    setSupplierEditApprovalId('');
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
    const profile = {
      vehicleType: String(agentForm.vehicleType ?? '').trim(),
      vehicleReg: String(agentForm.vehicleReg ?? '').trim(),
      typicalRoutes: String(agentForm.typicalRoutes ?? '').trim(),
      paymentPreference: String(agentForm.paymentPreference ?? '').trim(),
      reliabilityNotes: String(agentForm.reliabilityNotes ?? '').trim(),
      emergencyContact: String(agentForm.emergencyContact ?? '').trim(),
    };

    if (ws?.canMutate) {
      if (editingAgentId) {
        const patch = {
          name: agentForm.name.trim(),
          phone,
          region,
          profile,
        };
        if (String(agentEditApprovalId || '').trim()) {
          patch.editApprovalId = String(agentEditApprovalId).trim();
        }
        const { ok, data } = await apiFetch(
          `/api/transport-agents/${encodeURIComponent(editingAgentId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(patch),
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
            profile,
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

    setAgentForm({
      name: '',
      phone: '',
      region: '',
      ...defaultTransportAgentProfile(),
    });
    setEditingAgentId(null);
    setAgentEditApprovalId('');
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

  const coilPOsFiltered = useMemo(
    () => filteredPOs.filter((p) => procurementKindFromPo(p) === 'coil'),
    [filteredPOs]
  );
  const stonePOsFiltered = useMemo(
    () => filteredPOs.filter((p) => procurementKindFromPo(p) === 'stone'),
    [filteredPOs]
  );
  const accessoryPOsFiltered = useMemo(
    () => filteredPOs.filter((p) => procurementKindFromPo(p) === 'accessory'),
    [filteredPOs]
  );

  const coilPOsSorted = useMemo(
    () => sortPurchaseOrdersList(coilPOsFiltered, poListSort.field, poListSort.dir),
    [coilPOsFiltered, poListSort]
  );
  const stonePOsSorted = useMemo(
    () => sortPurchaseOrdersList(stonePOsFiltered, poListSort.field, poListSort.dir),
    [stonePOsFiltered, poListSort]
  );
  const accessoryPOsSorted = useMemo(
    () => sortPurchaseOrdersList(accessoryPOsFiltered, poListSort.field, poListSort.dir),
    [accessoryPOsFiltered, poListSort]
  );

  const coilPoPurchasesPage = useAppTablePaging(
    coilPOsSorted,
    PROCUREMENT_PURCHASES_COLUMN_PAGE_SIZE,
    poListSort.field,
    poListSort.dir,
    searchQuery
  );
  const stonePoPurchasesPage = useAppTablePaging(
    stonePOsSorted,
    PROCUREMENT_PURCHASES_COLUMN_PAGE_SIZE,
    poListSort.field,
    poListSort.dir,
    searchQuery
  );
  const accessoryPoPurchasesPage = useAppTablePaging(
    accessoryPOsSorted,
    PROCUREMENT_PURCHASES_COLUMN_PAGE_SIZE,
    poListSort.field,
    poListSort.dir,
    searchQuery
  );

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const p = s.supplierProfile || {};
      const blob = [
        s.supplierID,
        s.name,
        s.city,
        p.companyEmail,
        p.phoneMain,
        p.vatTin,
        p.rcNumber,
        ...(Array.isArray(p.contacts) ? p.contacts.map((c) => [c.name, c.email, c.phone].join(' ')) : []),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [suppliers, searchQuery]);

  const openPoEditor = (p) => {
    setProcurementPoForApprovalUi(p.poID);
    const kind = procurementKindFromPo(p);
    if (kind === 'stone') {
      setStonePoEditDraft(purchaseOrderToStoneModalDraft(p, invProducts));
      setShowStonePoModal(true);
    } else if (kind === 'accessory') {
      setAccessoryPoEditDraft(purchaseOrderToAccessoryModalDraft(p));
      setShowAccessoryPoModal(true);
    } else {
      setCoilPoEditDraft(purchaseOrderToCoilModalDraft(p));
      setShowCoilPoModal(true);
    }
  };

  const saveApPayment = async (e) => {
    e.preventDefault();
    if (!selectedAp) return;
    const invoiceRef = selectedAp.invoiceRef || selectedAp.poRef || selectedAp.apID;
    const amount = Number(apPayForm.amountNgn);
    const debitId = Number(apPayForm.debitAccountId);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter payment amount.', { variant: 'error' });
      return;
    }
    const remaining = selectedAp.amountNgn - selectedAp.paidNgn;
    const apply = Math.min(amount, remaining);
    if (apply <= 0) {
      showToast('This payable is already fully paid on file.', { variant: 'info' });
      return;
    }
    const acc = treasuryAccounts.find((a) => a.id === debitId);
    if (!acc || acc.balance < apply) {
      showToast('Selected account has insufficient balance.', { variant: 'error' });
      return;
    }
    const method = apPayForm.paymentMethod;
    const newPaidTotal = selectedAp.paidNgn + apply;
    const fullySettled = newPaidTotal >= selectedAp.amountNgn;
    const poRef = selectedAp.poRef?.trim?.() ?? '';
    const shouldAdvancePo = Boolean(
      fullySettled && poRef && purchaseOrders.find((p) => p.poID === poRef)?.status === 'Approved'
    );
    let procurementNote = '';
    if (ws?.canMutate) {
      const pay = await apiFetch(`/api/accounts-payable/${encodeURIComponent(selectedAp.apID)}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          amountNgn: apply,
          paymentMethod: method,
          treasuryAccountId: debitId,
          reference: invoiceRef,
          createdBy: currentActorLabel,
        }),
      });
      if (!pay.ok || !pay.data?.ok) {
        showToast(pay.data?.error || 'Could not record supplier payment.', { variant: 'error' });
        return;
      }
      if (shouldAdvancePo) {
        const st = await setPurchaseOrderStatus(poRef, 'In Transit');
        if (st.ok) procurementNote = ` ${poRef} → In Transit (await GRN in Operations).`;
      }
      await ws.refresh?.();
    } else {
      showToast(
        ws?.usingCachedData
          ? 'Reconnect to record supplier payments — workspace is read-only.'
          : 'Connect to the API to record supplier payments.',
        { variant: 'info' }
      );
      return;
    }
    setShowApPayModal(false);
    setSelectedAp(null);
    setApPayForm({
      amountNgn: '',
      paymentMethod: 'Bank Transfer',
      debitAccountId: String(treasuryAccounts[0]?.id ?? ''),
    });
    showToast(`${formatNgn(apply)} recorded against ${invoiceRef} (${method}).${procurementNote}`);
  };

  const isAnyModalOpen =
    showMaterialPricingWorkbook ||
    showCoilPoModal ||
    showStonePoModal ||
    showAccessoryPoModal ||
    showStoneAccessoryReceiptModal ||
    showSupplierModal ||
    showAgentModal ||
    showTransportModal ||
    showApPayModal;

  const transitRowsForAside = useMemo(() => {
    if (inTransitLoads.length > 0) {
      return inTransitLoads.map((load) => ({
        poID: load.purchaseOrderId || load.referenceNo || load.id,
        supplierName: load.data?.supplierName || 'Linked PO',
        transportAgentName: load.transportAgentName,
        transportReference: load.transportReference,
        transportNote: load.exceptionNote || load.delayReason || '',
        status:
          load.status === 'loading_confirmed'
            ? 'On loading'
            : load.status === 'in_transit'
              ? 'In Transit'
              : load.status,
      }));
    }
    return purchaseOrders
      .filter((p) => p.status === 'On loading' || p.status === 'In Transit')
      .map((p) => ({
        poID: p.poID,
        supplierName: p.supplierName,
        transportAgentName: p.transportAgentName,
        transportReference: p.transportReference,
        transportNote: p.transportNote || '',
        status: p.status,
      }));
  }, [inTransitLoads, purchaseOrders]);

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        title="Purchases"
        subtitle="Coil procurement (KG) for MD — suppliers Kano / Abuja / Lagos, transport, conversion (kg/m), Finance-ready payments."
        tabs={<PageTabs tabs={procurementTabs} value={activeTab} onChange={setActiveTab} />}
        toolbar={
          (activeTab === 'purchases' && canManagePo) ||
          activeTab === 'payables' ||
          activeTab === 'conversion' ||
          newButtonLabel ? (
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
              <AiAskButton
                mode="procurement"
                prompt={
                  activeTab === 'purchases'
                    ? 'Summarize purchase-order pressure, what is in transit, and what procurement should track next.'
                    : activeTab === 'payables'
                      ? 'Summarize open supplier payables, what is overdue, and what should be paid next.'
                      : activeTab === 'suppliers'
                        ? 'Summarize supplier records, transport agents, and where procurement may need action.'
                        : 'Explain the current conversion and material planning issues.'
                }
                pageContext={{
                  source: 'procurement-page',
                  activeTab,
                  searchQuery:
                    activeTab === 'payables'
                      ? `${payablesOpenSearchQuery} ${payablesSettledSearchQuery}`.trim()
                      : searchQuery,
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#134e4a] shadow-sm hover:bg-teal-100/70 shrink-0"
              >
                Ask AI
              </AiAskButton>
              {activeTab === 'purchases' && canManagePo ? (
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setCoilPoEditDraft(null);
                      setShowCoilPoModal(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#134e4a] text-white px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider shadow-sm hover:brightness-105"
                  >
                    <Plus size={12} strokeWidth={2} /> Coil PO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStonePoEditDraft(null);
                      setShowStonePoModal(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-teal-300 bg-teal-50 text-[#134e4a] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider hover:bg-teal-100"
                  >
                    <Plus size={12} strokeWidth={2} /> Stone PO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccessoryPoEditDraft(null);
                      setShowAccessoryPoModal(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white text-[#134e4a] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider hover:bg-slate-50"
                  >
                    <Plus size={12} strokeWidth={2} /> Accessory PO
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStoneAccessoryReceiptModal(true)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-teal-200 bg-white text-[#134e4a] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider hover:bg-teal-50/80"
                  >
                    Stone / accessory receipt
                  </button>
                </div>
              ) : null}
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
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:gap-6">
        <div className="col-span-full order-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {lowStockCount === 0 ? (
                <>
                  <p className="mt-1 text-sm font-bold text-amber-900/80">None</p>
                  <p className="mt-2 text-[10px] text-amber-800/85 border-t border-amber-100 pt-2">
                    Kg SKUs at or above {PROCUREMENT_LOW_STOCK_KG_FLOOR.toLocaleString()} kg
                  </p>
                </>
              ) : (
                <>
                  <ul className="mt-2 space-y-1.5" aria-label="Low stock coil SKUs prioritised by production demand">
                    {lowStockHotLines.map((row) => (
                      <li
                        key={row.productID}
                        className="flex items-start justify-between gap-2 text-[10px] leading-tight"
                      >
                        <span className="font-bold text-amber-950 min-w-0 line-clamp-2">{row.label}</span>
                        <span
                          className="shrink-0 tabular-nums text-amber-800/90 font-semibold"
                          title={`Stock vs ${PROCUREMENT_LOW_STOCK_KG_FLOOR.toLocaleString()} kg floor`}
                        >
                          {row.stockKg.toLocaleString()}/{row.thresholdKg.toLocaleString()} kg
                        </span>
                      </li>
                    ))}
                  </ul>
                  {lowStockCount > 3 ? (
                    <p className="mt-1.5 text-[9px] font-semibold text-amber-800/75">
                      +{lowStockCount - 3} more below {PROCUREMENT_LOW_STOCK_KG_FLOOR.toLocaleString()} kg
                    </p>
                  ) : null}
                  <p className="mt-2 text-[9px] text-amber-800/80 border-t border-amber-100 pt-2 leading-snug">
                    Below {PROCUREMENT_LOW_STOCK_KG_FLOOR.toLocaleString()} kg on hand. Ranked by production volume
                    (12&nbsp;mo) for matching colour / gauge / profile — restock these first.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-full min-w-0 order-2">
          {activeTab === 'payables' ? (
            <div className="flex flex-col gap-4 min-w-0 min-h-[min(60vh,520px)]">
              <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
                <div className="h-1 bg-[#134e4a]" />
                <div className="px-4 sm:px-5 py-4 sm:py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="text-xl font-bold text-[#134e4a] shrink-0">Payments</h2>
                    <p className="w-full sm:max-w-xl text-[10px] text-slate-500 leading-snug">
                      Use the <span className="font-semibold text-slate-600">search</span> in each payables list below
                      (open vs settled). Each list has its own sort and shows 10 rows per page.
                    </p>
                  </div>
                </div>
              </div>
              {!canRecordSupplierPayment ? (
                <p className="text-[10px] text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200/90 shadow-sm">
                  <span className="font-semibold">View only:</span> recording payments requires{' '}
                  <span className="font-mono text-[9px]">finance.pay</span>.
                </p>
              ) : null}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch min-w-0">
                  <div className="min-w-0 flex flex-col min-h-0">
                  <SalesListTableFrame
                    toolbar={
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                              <Banknote size={12} className="text-[#134e4a]" />
                              Pending &amp; partial payment
                            </h3>
                            <p className="text-[11px] text-slate-600 mt-1 leading-snug max-w-2xl">
                              Outstanding or partially paid supplier invoices. Post payments here (
                              <span className="font-semibold text-[#134e4a]">finance.pay</span>).
                            </p>
                          </div>
                          {payablesOutstandingNgn > 0 ? (
                            <p className="text-sm font-black text-[#134e4a] tabular-nums shrink-0">
                              {formatNgn(payablesOutstandingNgn)} outstanding
                            </p>
                          ) : null}
                        </div>
                        <SalesListSearchInput
                          value={payablesOpenSearchQuery}
                          onChange={setPayablesOpenSearchQuery}
                          placeholder="Search AP id, supplier, PO, invoice ref…"
                        />
                        <SalesListSortBar
                          fields={PAYABLES_SORT_FIELDS}
                          field={payablesOpenSort.field}
                          dir={payablesOpenSort.dir}
                          onFieldChange={(field) => setPayablesOpenSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setPayablesOpenSort((s) => ({
                              ...s,
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                        />
                      </div>
                    }
                  >
                    {sortedOpenPayables.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No open or partial payables match your search
                        </p>
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-1.5 max-h-[min(40vh,360px)] overflow-y-auto custom-scrollbar">
                          {openPayablesPage.slice.map((p) => (
                            <ProcurementPayableRow
                              key={p.apID}
                              p={p}
                              todayIso={todayIso}
                              branchNameById={branchNameById}
                              canRecordSupplierPayment={canRecordSupplierPayment}
                              wsCanMutate={ws?.canMutate}
                              onOpenPreview={() => {
                                setPreviewAp(p);
                                setPreviewPo(null);
                              }}
                              onOpenPay={() => {
                                setSelectedAp(p);
                                setApPayForm({
                                  amountNgn: String(p.amountNgn - (Number(p.paidNgn) || 0)),
                                  paymentMethod: 'Bank Transfer',
                                  debitAccountId: String(treasuryAccounts[0]?.id ?? ''),
                                });
                                setShowApPayModal(true);
                              }}
                            />
                          ))}
                        </ul>
                        <div className="mt-3 text-[10px] text-slate-600 [&_button]:rounded-lg [&_button]:px-2 [&_button]:py-1 [&_button]:text-[10px] [&_p]:text-[10px]">
                          <AppTablePager
                            showingFrom={openPayablesPage.showingFrom}
                            showingTo={openPayablesPage.showingTo}
                            total={openPayablesPage.total}
                            hasPrev={openPayablesPage.hasPrev}
                            hasNext={openPayablesPage.hasNext}
                            onPrev={openPayablesPage.goPrev}
                            onNext={openPayablesPage.goNext}
                            pageSize={PAYABLES_TABLE_PAGE_SIZE}
                          />
                        </div>
                      </>
                    )}
                  </SalesListTableFrame>
                  </div>

                  <div className="min-w-0 flex flex-col min-h-0">
                  <SalesListTableFrame
                    toolbar={
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                              <Banknote size={12} className="text-emerald-700" />
                              Fully paid
                            </h3>
                            <p className="text-[11px] text-slate-600 mt-1 leading-snug max-w-2xl">
                              Supplier invoices that are paid in full (including when paid equals invoice amount).
                            </p>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                            {sortedSettledPayables.length} settled
                          </p>
                        </div>
                        <SalesListSearchInput
                          value={payablesSettledSearchQuery}
                          onChange={setPayablesSettledSearchQuery}
                          placeholder="Search AP id, supplier, PO, invoice ref…"
                        />
                        <SalesListSortBar
                          fields={PAYABLES_SORT_FIELDS}
                          field={payablesSettledSort.field}
                          dir={payablesSettledSort.dir}
                          onFieldChange={(field) => setPayablesSettledSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setPayablesSettledSort((s) => ({
                              ...s,
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                        />
                      </div>
                    }
                  >
                    {sortedSettledPayables.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No settled payables match your search
                        </p>
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-1.5 max-h-[min(40vh,360px)] overflow-y-auto custom-scrollbar">
                          {settledPayablesPage.slice.map((p) => (
                            <ProcurementPayableRow
                              key={p.apID}
                              p={p}
                              todayIso={todayIso}
                              branchNameById={branchNameById}
                              canRecordSupplierPayment={canRecordSupplierPayment}
                              wsCanMutate={ws?.canMutate}
                              onOpenPreview={() => {
                                setPreviewAp(p);
                                setPreviewPo(null);
                              }}
                              onOpenPay={() => {
                                setSelectedAp(p);
                                setApPayForm({
                                  amountNgn: String(p.amountNgn - (Number(p.paidNgn) || 0)),
                                  paymentMethod: 'Bank Transfer',
                                  debitAccountId: String(treasuryAccounts[0]?.id ?? ''),
                                });
                                setShowApPayModal(true);
                              }}
                            />
                          ))}
                        </ul>
                        <div className="mt-3 text-[10px] text-slate-600 [&_button]:rounded-lg [&_button]:px-2 [&_button]:py-1 [&_button]:text-[10px] [&_p]:text-[10px]">
                          <AppTablePager
                            showingFrom={settledPayablesPage.showingFrom}
                            showingTo={settledPayablesPage.showingTo}
                            total={settledPayablesPage.total}
                            hasPrev={settledPayablesPage.hasPrev}
                            hasNext={settledPayablesPage.hasNext}
                            onPrev={settledPayablesPage.goPrev}
                            onNext={settledPayablesPage.goNext}
                            pageSize={PAYABLES_TABLE_PAGE_SIZE}
                          />
                        </div>
                      </>
                    )}
                  </SalesListTableFrame>
                  </div>
                  </div>
                </div>
          ) : (
          <MainPanel className="!rounded-xl !border-slate-200/90 !shadow-sm !bg-white !p-0 overflow-hidden !min-h-0 sm:!min-h-[360px]">
            <div className="h-1 bg-[#134e4a]" />
            <div className="p-4 sm:p-5 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-xl font-bold text-[#134e4a] shrink-0">
                  {TAB_LABELS[activeTab] ?? 'Records'}
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end flex-1 w-full min-w-0">
                  <div className="relative flex-1 w-full sm:max-w-xs min-w-0">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      size={16}
                    />
                    <input
                      type="search"
                      placeholder="Search purchase orders & suppliers…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#134e4a]/10"
                    />
                  </div>
                  {activeTab === 'purchases' || activeTab === 'conversion' ? (
                    <div className="flex justify-end sm:justify-center shrink-0">
                      <details className="relative shrink-0">
                        <summary
                          className="list-none cursor-pointer rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 [&::-webkit-details-marker]:hidden"
                          aria-label="About kg per metre conversion and variance flags"
                        >
                          <Info className="size-3.5" strokeWidth={2.25} aria-hidden />
                        </summary>
                        <div
                          role="note"
                          className="absolute right-0 top-full z-20 mt-1.5 w-[min(calc(100vw-2rem),20rem)] rounded-lg border border-slate-200 bg-white p-2.5 text-[10px] leading-snug text-slate-700 shadow-lg ring-1 ring-black/5"
                        >
                          <strong className="text-slate-800">Conversion</strong> — kg/m = kg ÷ metres. Flag when actual
                          kg/m is above offer or standard by ~{Math.round((CONVERSION_FLAG_RATIO - 1) * 100)}%.
                        </div>
                      </details>
                    </div>
                  ) : null}
                </div>
              </div>

              {activeTab === 'purchases' && (
                <div className="space-y-3">
                  {editMutationNeedsSecondApprovalRole(ws?.session?.user?.roleKey) && procurementPoForApprovalUi ? (
                    <div className="mb-2">
                      <EditSecondApprovalInline
                        entityKind="purchase_order"
                        entityId={procurementPoForApprovalUi}
                        value={procurementPoEditApprovalId}
                        onChange={setProcurementPoEditApprovalId}
                      />
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3 sm:px-4">
                    <SalesListSortBar
                      fields={PROCUREMENT_PO_SORT_FIELDS}
                      field={poListSort.field}
                      dir={poListSort.dir}
                      onFieldChange={(field) => setPoListSort((s) => ({ ...s, field }))}
                      onDirToggle={() =>
                        setPoListSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
                      }
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    Click a PO row to open the side panel — approve, reject, transport, transport fee, and edit
                    actions are there (fewer buttons on each row keeps the list lighter).
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
                    {[
                      {
                        title: 'Coil (kg)',
                        list: coilPOsSorted,
                        page: coilPoPurchasesPage,
                        empty: 'No coil purchase orders.',
                      },
                      {
                        title: 'Stone-coated (m)',
                        list: stonePOsSorted,
                        page: stonePoPurchasesPage,
                        empty: 'No stone-coated POs.',
                      },
                      {
                        title: 'Accessories',
                        list: accessoryPOsSorted,
                        page: accessoryPoPurchasesPage,
                        empty: 'No accessory POs.',
                      },
                    ].map((col) => (
                      <div key={col.title} className="min-w-0 flex flex-col">
                        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-2 border-b border-slate-200 pb-1">
                          {col.title}
                        </h3>
                        {col.list.length === 0 ? (
                          <p className="text-[10px] text-slate-400 py-3">{col.empty}</p>
                        ) : (
                          <>
                          <ul className="space-y-1.5 flex-1 min-h-0">
                            {col.page.slice.map((p) => {
                              const pk = procurementKindFromPo(p);
                              const meta2 = [
                                p.orderDateISO,
                                `${p.lines.length} ${poLineSummaryLabel(pk)}`,
                                p.transportAgentName,
                                p.transportReference ? `Ref ${p.transportReference}` : null,
                                p.transportTreasuryMovementId ? `Treasury ${p.transportTreasuryMovementId}` : null,
                                p.transportAmountNgn ? `Transport fee ${formatNgn(p.transportAmountNgn)}` : null,
                                p.transportPaid ? 'Transport fee paid' : null,
                                `Supplier paid ${formatNgn(p.supplierPaidNgn || 0)}`,
                                p.transportNote ? `Note: ${p.transportNote}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ');
                              return (
                        <li
                          key={p.poID}
                          className={`${CARD_ROW} cursor-pointer`}
                          onClick={() => {
                            setPreviewPo(p);
                            setPreviewAp(null);
                          }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                            <div className="min-w-0 leading-tight flex-1">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                  <span className="font-mono">{p.poID}</span>
                                  <span className="font-medium text-slate-600"> · {p.supplierName}</span>
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className="text-[11px] font-black text-[#134e4a] tabular-nums"
                                    title="Ordered value: each line uses ₦/m (stone), ₦/unit or ₦/kg (accessory), or ₦/kg (coil), including legacy rows with only per-kg price."
                                  >
                                    {formatNgn(purchaseOrderOrderedValueNgn(p))}
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
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-2 text-[10px] text-slate-600 [&_button]:rounded-lg [&_button]:px-2 [&_button]:py-1 [&_button]:text-[10px] [&_p]:text-[10px]">
                            <AppTablePager
                              showingFrom={col.page.showingFrom}
                              showingTo={col.page.showingTo}
                              total={col.page.total}
                              hasPrev={col.page.hasPrev}
                              hasNext={col.page.hasNext}
                              onPrev={col.page.goPrev}
                              onNext={col.page.goNext}
                              pageSize={PROCUREMENT_PURCHASES_COLUMN_PAGE_SIZE}
                            />
                          </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'suppliers' && (
                <div className="flex flex-col lg:flex-row gap-4 items-stretch min-h-[min(52vh,480px)]">
                  <ProcurementTransportAgentsAside
                    agents={agents}
                    onEdit={openEditAgent}
                    onRemove={removeAgent}
                    onRegister={openAgentModal}
                    transitRows={transitRowsForAside}
                    onPreviewTransitPo={(poId) => {
                      const fullPo = purchaseOrders.find((po) => po.poID === poId);
                      if (fullPo) {
                        setPreviewPo(fullPo);
                        setPreviewAp(null);
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                {filteredSuppliers.length === 0 ? (
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
                )}
                  </div>
                </div>
              )}

              {activeTab === 'conversion' && (
                <div
                  className={`grid grid-cols-1 gap-4 min-w-0 items-stretch ${
                    canAccessPriceList ? 'lg:grid-cols-2' : ''
                  }`}
                >
                  <div className="rounded-xl border border-slate-200/90 bg-white/90 shadow-sm p-4 sm:p-5 min-w-0 flex flex-col">
                    <ProcurementFormSection letter="S" title="Standard conversion (density & gauges)" compact>
                    <p className="text-[10px] text-slate-600 mb-2 leading-relaxed">
                      Theoretical <strong className="text-slate-800">kg/m</strong> for{' '}
                      <strong className="text-slate-800">1.2 m</strong> strip width:{' '}
                      <span className="font-mono">ρ × 1.2 × (gauge_mm ÷ 1000)</span>.
                      Densities (as you specified):{' '}
                      <strong className="text-slate-800">Aluminium 2.7 g/cm³</strong>,{' '}
                      <strong className="text-slate-800">Aluzinc (PPGI) 7.8 g/cm³</strong>.                       Stonecoated is not included
                      here — different material / build-up. Saved rows are matched to coils by stock product and gauge
                      (and colour when listed) and used as the <strong className="text-slate-800">standard kg/m</strong> in
                      production conversion checks.
                    </p>
                    <div className="z-scroll-x mb-3 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                            <th className="py-2.5 px-3">Gauge (mm)</th>
                            <th className="py-2.5 px-3">Aluminium kg/m</th>
                            <th className="py-2.5 px-3">Aluzinc (PPGI) kg/m</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {STANDARD_COIL_GAUGES_MM.map((gLabel) => {
                            const mm = parseFloat(gLabel, 10);
                            const alu = kgPerMFromStripDensity('alu', mm);
                            const az = kgPerMFromStripDensity('aluzinc', mm);
                            return (
                              <tr key={gLabel} className="hover:bg-teal-50/30">
                                <td className="py-2.5 px-3 font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                  {gLabel}
                                </td>
                                <td className="py-2.5 px-3 font-mono tabular-nums text-[#134e4a] whitespace-nowrap">
                                  {alu == null ? '—' : alu.toFixed(4)}
                                </td>
                                <td className="py-2.5 px-3 font-mono tabular-nums text-[#134e4a] whitespace-nowrap">
                                  {az == null ? '—' : az.toFixed(4)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <form className="space-y-3" onSubmit={saveStandardConversion}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Material</label>
                          <select
                            required
                            value={standardConversionForm.materialKey}
                            onChange={(e) => {
                              const key = e.target.value;
                              const opt = procurementCoilMaterialByKey(key);
                              setStandardConversionForm((f) => ({
                                ...f,
                                materialKey: key,
                                color: opt.defaultCatalogLabel,
                              }));
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                          >
                            {PROCUREMENT_COIL_MATERIALS.map((m) => (
                              <option key={m.key} value={m.key}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Gauge (mm)</label>
                          <select
                            required
                            value={standardConversionForm.gauge}
                            onChange={(e) =>
                              setStandardConversionForm((f) => ({ ...f, gauge: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                          >
                            {STANDARD_COIL_GAUGES_MM.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                          Catalogue label (colour / grade)
                        </label>
                        <input
                          value={standardConversionForm.color}
                          onChange={(e) =>
                            setStandardConversionForm((f) => ({ ...f, color: e.target.value }))
                          }
                          placeholder="Defaults from material; override e.g. IV, GB, HMB"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                          Override kg/m (optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.000001"
                          value={standardConversionForm.conversionKgPerM}
                          onChange={(e) =>
                            setStandardConversionForm((f) => ({ ...f, conversionKgPerM: e.target.value }))
                          }
                          placeholder="Leave empty to use density calculation"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold tabular-nums"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`${PILL} bg-sky-100 text-sky-900`}>
                          Density kg/m:{' '}
                          {standardPhysicsKgPerM == null ? '—' : standardPhysicsKgPerM.toFixed(6)}
                        </span>
                        <span className={`${PILL} border border-slate-200 bg-white text-slate-700`}>
                          Will save:{' '}
                          {standardEffectiveKgPerM == null ? '—' : standardEffectiveKgPerM.toFixed(6)} kg/m
                        </span>
                        {Number.isFinite(stdOverrideKgPerM) && stdOverrideKgPerM > 0 ? (
                          <span className={`${PILL} bg-amber-100 text-amber-900`}>Using override</span>
                        ) : null}
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Note</label>
                        <input
                          value={standardConversionForm.label}
                          onChange={(e) =>
                            setStandardConversionForm((f) => ({ ...f, label: e.target.value }))
                          }
                          placeholder="Optional (defaults to Standard (density) · material · gauge mm)"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={standardConversionSaving || !ws?.canMutate}
                        className="z-btn-primary w-full sm:w-auto justify-center py-2.5 px-4 text-xs disabled:opacity-50"
                      >
                        {standardConversionSaving ? 'Saving…' : 'Save standard conversion'}
                      </button>
                    </form>
                  </ProcurementFormSection>
                  </div>

                  {canAccessPriceList ? (
                    <div className="rounded-xl border border-slate-200/90 bg-white/90 shadow-sm p-4 sm:p-5 min-w-0 flex flex-col">
                      <ProcurementFormSection letter="P" title="Price list (minimum ₦/m)" compact>
                        <p className="text-[10px] text-slate-600 mb-2 leading-relaxed">
                          Minimum price per metre by gauge and design. Production can be blocked when a quotation is
                          below list until the MD records a price exception.
                        </p>
                        <div className="flex flex-wrap justify-end gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setShowMaterialPricingWorkbook(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#134e4a]/30 bg-[#134e4a]/5 px-3 py-2 text-[10px] font-black uppercase text-[#134e4a] hover:bg-[#134e4a]/10"
                          >
                            Material pricing workbook
                          </button>
                        </div>
                        <PriceListPanel embedded />
                      </ProcurementFormSection>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </MainPanel>
          )}
        </div>
      </div>

      <MaterialPricingWorkbookModal
        open={showMaterialPricingWorkbook}
        onClose={() => setShowMaterialPricingWorkbook(false)}
        initialMaterialKey="alu"
      />

      <CoilPurchaseOrderModal
        isOpen={showCoilPoModal}
        editDraft={coilPoEditDraft}
        onClose={() => {
          setShowCoilPoModal(false);
          setCoilPoEditDraft(null);
        }}
        suppliers={suppliers}
        masterData={ws?.snapshot?.masterData ?? null}
        editApprovalSlot={
          coilPoEditDraft?.poID ? (
            <EditSecondApprovalInline
              entityKind="purchase_order"
              entityId={coilPoEditDraft.poID}
              value={procurementPoEditApprovalId}
              onChange={setProcurementPoEditApprovalId}
            />
          ) : null
        }
        onQuickAddSupplier={() => {
          setShowCoilPoModal(false);
          setCoilPoEditDraft(null);
          openSupplierModal();
        }}
        onSubmit={async (payload) => {
          if (payload.poID) {
            const { poID, ...rest } = payload;
            const res = await updatePurchaseOrder({
              poID,
              ...rest,
              editApprovalId: procurementPoEditApprovalId || undefined,
            });
            if (!res.ok) {
              showToast(res.error || 'Could not update PO', { variant: 'error' });
              return false;
            }
            setProcurementPoEditApprovalId('');
            showToast(`${poID} updated.`);
            return true;
          }
          const res = await createPurchaseOrder({ ...payload, status: 'Pending' });
          if (!res.ok) {
            showToast(res.error || 'Could not save PO', { variant: 'error' });
            return false;
          }
          showToast(`${res.poID} created — approve, then assign transport.`);
          return true;
        }}
      />

      <StonePurchaseOrderModal
        isOpen={showStonePoModal}
        editDraft={stonePoEditDraft}
        onClose={() => {
          setShowStonePoModal(false);
          setStonePoEditDraft(null);
        }}
        suppliers={suppliers}
        masterData={ws?.snapshot?.masterData ?? null}
        products={invProducts}
        editApprovalSlot={
          stonePoEditDraft?.poID ? (
            <EditSecondApprovalInline
              entityKind="purchase_order"
              entityId={stonePoEditDraft.poID}
              value={procurementPoEditApprovalId}
              onChange={setProcurementPoEditApprovalId}
            />
          ) : null
        }
        onQuickAddSupplier={() => {
          setShowStonePoModal(false);
          setStonePoEditDraft(null);
          openSupplierModal();
        }}
        onSubmit={async (payload) => {
          if (payload.poID) {
            const { poID, ...rest } = payload;
            const res = await updatePurchaseOrder({
              poID,
              ...rest,
              editApprovalId: procurementPoEditApprovalId || undefined,
            });
            if (!res.ok) {
              showToast(res.error || 'Could not update PO', { variant: 'error' });
              return false;
            }
            setProcurementPoEditApprovalId('');
            showToast(`${poID} updated.`);
            return true;
          }
          const res = await createPurchaseOrder({ ...payload, status: 'Pending' });
          if (!res.ok) {
            showToast(res.error || 'Could not save PO', { variant: 'error' });
            return false;
          }
          showToast(`${res.poID} created — approve, then assign transport.`);
          return true;
        }}
      />

      <AccessoryPurchaseOrderModal
        isOpen={showAccessoryPoModal}
        editDraft={accessoryPoEditDraft}
        onClose={() => {
          setShowAccessoryPoModal(false);
          setAccessoryPoEditDraft(null);
        }}
        suppliers={suppliers}
        products={invProducts}
        editApprovalSlot={
          accessoryPoEditDraft?.poID ? (
            <EditSecondApprovalInline
              entityKind="purchase_order"
              entityId={accessoryPoEditDraft.poID}
              value={procurementPoEditApprovalId}
              onChange={setProcurementPoEditApprovalId}
            />
          ) : null
        }
        onQuickAddSupplier={() => {
          setShowAccessoryPoModal(false);
          setAccessoryPoEditDraft(null);
          openSupplierModal();
        }}
        onSubmit={async (payload) => {
          if (payload.poID) {
            const { poID, ...rest } = payload;
            const res = await updatePurchaseOrder({
              poID,
              ...rest,
              editApprovalId: procurementPoEditApprovalId || undefined,
            });
            if (!res.ok) {
              showToast(res.error || 'Could not update PO', { variant: 'error' });
              return false;
            }
            setProcurementPoEditApprovalId('');
            showToast(`${poID} updated.`);
            return true;
          }
          const res = await createPurchaseOrder({ ...payload, status: 'Pending' });
          if (!res.ok) {
            showToast(res.error || 'Could not save PO', { variant: 'error' });
            return false;
          }
          showToast(`${res.poID} created — approve, then assign transport.`);
          return true;
        }}
      />

      <StoneAccessoryReceiptModal
        isOpen={showStoneAccessoryReceiptModal}
        onClose={() => setShowStoneAccessoryReceiptModal(false)}
        masterData={ws?.snapshot?.masterData ?? null}
        products={invProducts}
        canMutate={canManagePo}
        onPosted={() => {
          showToast('Stone metre receipt posted.', { variant: 'success' });
          void ws?.refresh?.();
        }}
      />

      <ModalFrame
        isOpen={showTransportModal}
        onClose={() => setShowTransportModal(false)}
        title="Link transport"
        description="Assign transporter and transport fee; Finance (cashier) records payment and account elsewhere."
      >
        <form
          className="z-modal-panel w-full max-w-[min(100%,28rem)] max-h-[min(92vh,760px)] flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] overflow-hidden mx-auto"
          onSubmit={async (e) => {
            e.preventDefault();
            const ag = agents.find((a) => a.id === transportForm.agentId);
            if (!transportForm.poID || !ag) {
              showToast('Select PO and agent.', { variant: 'error' });
              return;
            }
            const amt = Number(transportForm.transportAmountNgn);
            const advRaw = String(transportForm.transportAdvanceNgn || '').trim();
            const advNum = advRaw === '' ? null : Number(advRaw);
            const r = await linkTransportToPurchaseOrder(transportForm.poID, {
              transportAgentId: ag.id,
              transportAgentName: ag.name,
              transportReference: transportForm.transportReference,
              transportNote: transportForm.transportNote,
              transportFinanceAdvice: transportForm.transportFinanceAdvice,
              transportAmountNgn: !Number.isNaN(amt) && amt > 0 ? amt : undefined,
              transportAdvanceNgn:
                advNum != null && !Number.isNaN(advNum) && advNum > 0 ? advNum : undefined,
              editApprovalId: procurementPoEditApprovalId || undefined,
            });
            if (!r.ok) {
              showToast(r.error || 'Link failed', { variant: 'error' });
              return;
            }
            setProcurementPoEditApprovalId('');
            setShowTransportModal(false);
            if (!Number.isNaN(amt) && amt > 0) {
              showToast(
                'Transport linked — Finance work queue updated. In transit and settlement follow treasury payments.'
              );
            } else {
              showToast('Transport linked.');
            }
          }}
        >
          <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-[#134e4a]/[0.07] to-transparent px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[#134e4a] text-white flex items-center justify-center shadow-md shadow-[#134e4a]/25 shrink-0">
                <Truck size={22} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[#134e4a] tracking-tight">Link transport</h2>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                  Transporter &amp; transport fee
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTransportModal(false)}
              className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 custom-scrollbar space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5">
              <strong className="text-slate-800">Transport fee</strong> is the cost to move this order (haulage/freight).
              Enter it here for visibility; <strong className="text-slate-800">which account to pay from</strong> is set
              in Finance when the cashier posts payment. Use finance advice for split payments (e.g. advance vs on
              arrival).
            </p>
            {transportForm.poID ? (
              <EditSecondApprovalInline
                entityKind="purchase_order"
                entityId={transportForm.poID}
                value={procurementPoEditApprovalId}
                onChange={setProcurementPoEditApprovalId}
              />
            ) : null}
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
                Transport fee (₦)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={transportForm.transportAmountNgn}
                onChange={(e) =>
                  setTransportForm((f) => ({ ...f, transportAmountNgn: e.target.value }))
                }
                placeholder="0 = not set yet"
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Advance to move in transit (₦)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={transportForm.transportAdvanceNgn}
                onChange={(e) =>
                  setTransportForm((f) => ({ ...f, transportAdvanceNgn: e.target.value }))
                }
                placeholder="Leave blank = full fee (single payment)"
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-bold tabular-nums"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                When cumulative payments reach this amount, the PO becomes In Transit. When they reach the full
                transport fee above, transport is settled.
              </p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Operations note
              </label>
              <textarea
                rows={2}
                value={transportForm.transportNote}
                onChange={(e) => setTransportForm((f) => ({ ...f, transportNote: e.target.value }))}
                placeholder="Pickup split, shared route, loading instruction…"
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-medium resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Finance advice (DAV / cashier)
              </label>
              <textarea
                rows={2}
                value={transportForm.transportFinanceAdvice}
                onChange={(e) =>
                  setTransportForm((f) => ({ ...f, transportFinanceAdvice: e.target.value }))
                }
                placeholder="e.g. Advise pay ₦500k advance to transporter; balance on proof of delivery…"
                className="w-full rounded-xl border border-slate-200 py-3 px-3 text-sm font-medium resize-none"
              />
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 sm:px-6 py-3">
            <button
              type="submit"
              className="z-btn-primary w-full justify-center py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm"
            >
              Save transport
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame
        isOpen={showApPayModal}
        onClose={() => {
          setShowApPayModal(false);
          setSelectedAp(null);
        }}
      >
        <div className="z-modal-panel max-w-md p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">Supplier payment</h3>
            <button
              type="button"
              onClick={() => {
                setShowApPayModal(false);
                setSelectedAp(null);
              }}
              className="p-2 text-gray-400 hover:text-red-500 rounded-xl"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>
          {selectedAp ? (
            <form className="space-y-4" onSubmit={saveApPayment}>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-sm">
                <p className="font-bold text-[#134e4a]">{selectedAp.supplierName}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {selectedAp.invoiceRef ? `${selectedAp.invoiceRef} · ` : ''}PO {selectedAp.poRef || '—'}
                </p>
                <p className="text-xs mt-2">
                  Outstanding:{' '}
                  <span className="font-black">
                    {formatNgn(selectedAp.amountNgn - selectedAp.paidNgn)}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">
                  Amount to pay (₦)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={apPayForm.amountNgn}
                  onChange={(e) => setApPayForm((f) => ({ ...f, amountNgn: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">
                  Payment method
                </label>
                <select
                  value={apPayForm.paymentMethod}
                  onChange={(e) => setApPayForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="POS">POS</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">
                  Pay from account
                </label>
                <select
                  required
                  value={apPayForm.debitAccountId}
                  onChange={(e) => setApPayForm((f) => ({ ...f, debitAccountId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none"
                >
                  {treasuryAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatNgn(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                Record payment
              </button>
            </form>
          ) : null}
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showSupplierModal}
        onClose={() => {
          setShowSupplierModal(false);
          setEditingSupplierId(null);
          setSupplierEditApprovalId('');
          setSupplierPendingFiles([]);
        }}
      >
        <div className="z-modal-panel max-w-3xl w-full max-h-[min(92vh,820px)] flex flex-col p-0">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 shrink-0">
            <div>
              <h3 className="text-lg font-bold text-[#134e4a]">
                {editingSupplierId ? 'Edit supplier' : 'Register supplier'}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Company details, bank accounts, contacts, and agreement uploads (stored securely on your server DB).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSupplierModal(false);
                setEditingSupplierId(null);
                setSupplierEditApprovalId('');
                setSupplierPendingFiles([]);
              }}
              className="p-2 text-slate-400"
            >
              <X size={22} />
            </button>
          </div>
          <form className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-6" onSubmit={saveSupplier}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Legal / trading name *</label>
                <input
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">City / region</label>
                <input
                  value={supplierForm.city}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Kano / Lagos / Abuja"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Main phone</label>
                <input
                  value={supplierForm.phoneMain}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, phoneMain: e.target.value }))}
                  placeholder="+234…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Company email</label>
                <input
                  type="email"
                  value={supplierForm.companyEmail}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, companyEmail: e.target.value }))}
                  placeholder="accounts@vendor.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Website</label>
                <input
                  value={supplierForm.website}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">WhatsApp</label>
                <input
                  value={supplierForm.whatsapp}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="Optional"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">VAT / TIN</label>
                <input
                  value={supplierForm.vatTin}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, vatTin: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">RC / CAC no.</label>
                <input
                  value={supplierForm.rcNumber}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, rcNumber: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Registered address</label>
                <textarea
                  value={supplierForm.registeredAddress}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, registeredAddress: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Billing address (if different)</label>
                <textarea
                  value={supplierForm.billingAddress}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, billingAddress: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
                <Building2 size={14} /> Bank accounts (add all accounts you pay to)
              </p>
              {padBankAccounts(supplierForm.bankAccounts, 2, 6).map((row, idx) => (
                <div
                  key={`bank-${idx}`}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 p-2 rounded-lg bg-white border border-slate-100"
                >
                  <input
                    placeholder="Bank name"
                    value={row.bankName}
                    onChange={(e) => {
                      const next = padBankAccounts(supplierForm.bankAccounts, 2, 6);
                      next[idx] = { ...next[idx], bankName: e.target.value };
                      setSupplierForm((f) => ({ ...f, bankAccounts: next }));
                    }}
                    className="lg:col-span-2 rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                  <input
                    placeholder="Account name"
                    value={row.accountName}
                    onChange={(e) => {
                      const next = padBankAccounts(supplierForm.bankAccounts, 2, 6);
                      next[idx] = { ...next[idx], accountName: e.target.value };
                      setSupplierForm((f) => ({ ...f, bankAccounts: next }));
                    }}
                    className="lg:col-span-2 rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                  <input
                    placeholder="Account no."
                    value={row.accountNumber}
                    onChange={(e) => {
                      const next = padBankAccounts(supplierForm.bankAccounts, 2, 6);
                      next[idx] = { ...next[idx], accountNumber: e.target.value };
                      setSupplierForm((f) => ({ ...f, bankAccounts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs font-mono"
                  />
                  <input
                    placeholder="Sort / routing"
                    value={row.sortCode}
                    onChange={(e) => {
                      const next = padBankAccounts(supplierForm.bankAccounts, 2, 6);
                      next[idx] = { ...next[idx], sortCode: e.target.value };
                      setSupplierForm((f) => ({ ...f, bankAccounts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                </div>
              ))}
              {supplierForm.bankAccounts.length < 6 ? (
                <button
                  type="button"
                  className="text-[10px] font-bold text-orange-700 uppercase flex items-center gap-1"
                  onClick={() =>
                    setSupplierForm((f) => ({
                      ...f,
                      bankAccounts: [...padBankAccounts(f.bankAccounts, 2, 6), SUPPLIER_BANK_ROW_TEMPLATE()],
                    }))
                  }
                >
                  <Plus size={12} /> Add bank row
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              <p className="text-[10px] font-black text-[#134e4a] uppercase tracking-widest flex items-center gap-2">
                <Users size={14} /> Contacts (sales, dispatch, accounts…)
              </p>
              {padContacts(supplierForm.contacts, 3, 6).map((row, idx) => (
                <div
                  key={`contact-${idx}`}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-2 rounded-lg bg-white border border-slate-100"
                >
                  <input
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) => {
                      const next = padContacts(supplierForm.contacts, 3, 6);
                      next[idx] = { ...next[idx], name: e.target.value };
                      setSupplierForm((f) => ({ ...f, contacts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                  <input
                    placeholder="Role"
                    value={row.role}
                    onChange={(e) => {
                      const next = padContacts(supplierForm.contacts, 3, 6);
                      next[idx] = { ...next[idx], role: e.target.value };
                      setSupplierForm((f) => ({ ...f, contacts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                  <input
                    placeholder="Email"
                    value={row.email}
                    onChange={(e) => {
                      const next = padContacts(supplierForm.contacts, 3, 6);
                      next[idx] = { ...next[idx], email: e.target.value };
                      setSupplierForm((f) => ({ ...f, contacts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                  <input
                    placeholder="Phone"
                    value={row.phone}
                    onChange={(e) => {
                      const next = padContacts(supplierForm.contacts, 3, 6);
                      next[idx] = { ...next[idx], phone: e.target.value };
                      setSupplierForm((f) => ({ ...f, contacts: next }));
                    }}
                    className="rounded-lg border border-slate-200 py-2 px-2 text-xs"
                  />
                </div>
              ))}
              {supplierForm.contacts.length < 6 ? (
                <button
                  type="button"
                  className="text-[10px] font-bold text-orange-700 uppercase flex items-center gap-1"
                  onClick={() =>
                    setSupplierForm((f) => ({
                      ...f,
                      contacts: [...padContacts(f.contacts, 3, 6), SUPPLIER_CONTACT_ROW_TEMPLATE()],
                    }))
                  }
                >
                  <Plus size={12} /> Add contact row
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-amber-50/40 p-3 space-y-2">
              <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest flex items-center gap-2">
                <Paperclip size={14} /> Agreements & certificates (PDF, scans — max ~700 KB each, up to 6 files)
              </p>
              {(supplierForm.agreementMeta || []).map((a) =>
                supplierForm.removedAgreementIds?.includes(a.id) ? null : (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-100 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-[#134e4a] truncate">{a.fileName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.hasFile ? (
                        <a
                          href={apiUrl(
                            `/api/suppliers/${encodeURIComponent(editingSupplierId || '')}/agreements/${encodeURIComponent(a.id)}/file`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold text-orange-800 underline"
                          onClick={(ev) => {
                            if (!editingSupplierId) ev.preventDefault();
                          }}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400">No file</span>
                      )}
                      <button
                        type="button"
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Remove from record"
                        onClick={() =>
                          setSupplierForm((f) => ({
                            ...f,
                            removedAgreementIds: [...(f.removedAgreementIds || []), a.id],
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              )}
              {supplierPendingFiles.map((pf) => (
                <div
                  key={pf.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs"
                >
                  <span className="truncate font-medium">{pf.file.name}</span>
                  <button
                    type="button"
                    className="text-red-500 p-1"
                    onClick={() => setSupplierPendingFiles((prev) => prev.filter((x) => x.id !== pf.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <label className="inline-flex items-center gap-2 text-[10px] font-bold text-amber-900 cursor-pointer">
                <span className="rounded-lg border border-amber-300 bg-white px-3 py-2">Add files…</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    setSupplierPendingFiles((prev) => {
                      const next = [...prev];
                      const cap = 6 - (supplierForm.agreementMeta || []).filter((x) => !supplierForm.removedAgreementIds?.includes(x.id)).length;
                      let room = Math.max(0, cap - next.length);
                      for (const file of files) {
                        if (room <= 0) break;
                        next.push({ id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file });
                        room -= 1;
                      }
                      return next;
                    });
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Payment terms</label>
                <select
                  value={supplierForm.paymentTerms}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold"
                >
                  <option value="Credit">Credit</option>
                  <option value="Advance">Advance</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Quality score (0–100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={supplierForm.qualityScore}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, qualityScore: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Commercial / onboarding notes</label>
                <textarea
                  value={supplierForm.notesCommercial}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, notesCommercial: e.target.value }))}
                  rows={2}
                  placeholder="Delivery terms, MOQ, lead times, certifications…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block mb-1">Internal procurement notes</label>
                <textarea
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Visible on supplier card; not shown to vendor."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                />
              </div>
            </div>

            {editingSupplierId ? (
              <EditSecondApprovalInline
                entityKind="supplier"
                entityId={editingSupplierId}
                value={supplierEditApprovalId}
                onChange={setSupplierEditApprovalId}
              />
            ) : null}
            <div className="sticky bottom-0 bg-white pt-2 pb-1 border-t border-slate-100">
              <button type="submit" className="z-btn-primary w-full justify-center py-3">
                {editingSupplierId ? 'Update supplier' : 'Save supplier'}
              </button>
            </div>
          </form>
        </div>
      </ModalFrame>

      <ModalFrame
        isOpen={showAgentModal}
        onClose={() => {
          setShowAgentModal(false);
          setEditingAgentId(null);
          setAgentEditApprovalId('');
        }}
      >
        <div className="z-modal-panel max-w-lg max-h-[min(92vh,720px)] overflow-y-auto custom-scrollbar p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#134e4a]">
              {editingAgentId ? 'Edit transport agent' : 'New transport agent'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAgentModal(false);
                setEditingAgentId(null);
                setAgentEditApprovalId('');
              }}
              className="p-2 text-slate-400"
            >
              <X size={22} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={saveAgent}>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Name</label>
              <input
                required
                placeholder="Agent or company name"
                value={agentForm.name}
                onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Phone</label>
                <input
                  placeholder="Primary phone"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Region / base
                </label>
                <input
                  placeholder="e.g. Kano — Lagos"
                  value={agentForm.region}
                  onChange={(e) => setAgentForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-3 px-4 text-sm"
                />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-3">
              Fleet &amp; operations
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Vehicle type</label>
                <input
                  placeholder="e.g. Flatbed, trailer"
                  value={agentForm.vehicleType}
                  onChange={(e) => setAgentForm((f) => ({ ...f, vehicleType: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Registration</label>
                <input
                  placeholder="Plate / fleet ID"
                  value={agentForm.vehicleReg}
                  onChange={(e) => setAgentForm((f) => ({ ...f, vehicleReg: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Typical routes</label>
              <textarea
                placeholder="Corridors and cities this transporter usually runs"
                value={agentForm.typicalRoutes}
                onChange={(e) => setAgentForm((f) => ({ ...f, typicalRoutes: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm resize-y min-h-[2.5rem]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Payment preference
                </label>
                <select
                  value={agentForm.paymentPreference}
                  onChange={(e) => setAgentForm((f) => ({ ...f, paymentPreference: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-semibold bg-white"
                >
                  <option value="">Not specified</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Mixed (advance + balance)">Mixed (advance + balance)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Emergency contact
                </label>
                <input
                  placeholder="Alt phone / dispatcher"
                  value={agentForm.emergencyContact}
                  onChange={(e) => setAgentForm((f) => ({ ...f, emergencyContact: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Internal notes (reliability, timing)
              </label>
              <textarea
                placeholder="What finance and procurement should know — punctuality, damage history, negotiation notes…"
                value={agentForm.reliabilityNotes}
                onChange={(e) => setAgentForm((f) => ({ ...f, reliabilityNotes: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm resize-y min-h-[3rem]"
              />
            </div>
            {editingAgentId ? (
              <EditSecondApprovalInline
                entityKind="transport_agent"
                entityId={editingAgentId}
                value={agentEditApprovalId}
                onChange={setAgentEditApprovalId}
              />
            ) : null}
            <button type="submit" className="z-btn-primary w-full justify-center py-3">
              {editingAgentId ? 'Update agent' : 'Save agent'}
            </button>
          </form>
        </div>
      </ModalFrame>

      <ProcurementPoPreviewSlideOver
        po={previewPo}
        isOpen={Boolean(previewPo)}
        onClose={() => {
          setPreviewPo(null);
          setPreviewAp(null);
        }}
        onEdit={(po) => {
          setPreviewPo(null);
          setPreviewAp(null);
          openPoEditor(po);
        }}
        canEdit={ws?.hasPermission?.('purchase_orders.manage') ?? true}
        wsCanMutate={ws?.canMutate}
        onApprove={async (p) => {
          setProcurementPoForApprovalUi(p.poID);
          const r = await setPurchaseOrderStatus(p.poID, 'Approved', {
            editApprovalId: procurementPoEditApprovalId || undefined,
          });
          if (r.ok) {
            setProcurementPoEditApprovalId('');
            showToast(`${p.poID} approved.`);
          } else showToast(r.error || 'Update failed', { variant: 'error' });
        }}
        onReject={async (p) => {
          setProcurementPoForApprovalUi(p.poID);
          const r = await setPurchaseOrderStatus(p.poID, 'Rejected', {
            editApprovalId: procurementPoEditApprovalId || undefined,
          });
          if (r.ok) {
            setProcurementPoEditApprovalId('');
            showToast(`${p.poID} rejected.`);
          } else showToast(r.error || 'Update failed', { variant: 'error' });
        }}
        onAssignTransport={(p) => {
          setPreviewPo(null);
          setPreviewAp(null);
          setProcurementPoForApprovalUi(p.poID);
          setTransportForm({
            poID: p.poID,
            agentId: p.transportAgentId || '',
            transportReference: p.transportReference || '',
            transportNote: p.transportNote || '',
            transportFinanceAdvice: p.transportFinanceAdvice || '',
            transportAmountNgn: p.transportAmountNgn > 0 ? String(p.transportAmountNgn) : '',
            transportAdvanceNgn:
              Number(p.transportAdvanceNgn) > 0 ? String(p.transportAdvanceNgn) : '',
          });
          setShowTransportModal(true);
        }}
      />
      <ProcurementPayablePreviewSlideOver
        payable={previewAp}
        isOpen={Boolean(previewAp)}
        onClose={() => {
          setPreviewPo(null);
          setPreviewAp(null);
        }}
        branchNameById={branchNameById}
        todayIso={todayIso}
        canPay={canRecordSupplierPayment}
        wsCanMutate={ws?.canMutate}
        onPay={(ap) => {
          setPreviewPo(null);
          setPreviewAp(null);
          setSelectedAp(ap);
          setApPayForm({
            amountNgn: String(ap.amountNgn - (Number(ap.paidNgn) || 0)),
            paymentMethod: 'Bank Transfer',
            debitAccountId: String(treasuryAccounts[0]?.id ?? ''),
          });
          setShowApPayModal(true);
        }}
      />
    </PageShell>
  );
};

function ProcurementPayableRow({
  p,
  todayIso,
  branchNameById,
  canRecordSupplierPayment,
  wsCanMutate,
  onOpenPreview,
  onOpenPay,
}) {
  const paid = Number(p.paidNgn) || 0;
  const amt = Number(p.amountNgn) || 0;
  const outstanding = Math.max(0, amt - paid);
  const due = p.dueDateISO && String(p.dueDateISO).trim() && p.dueDateISO < todayIso;
  const open = paid < amt;
  const meta2 = [
    `PO ${p.poRef}`,
    p.invoiceRef ? `Ref ${p.invoiceRef}` : null,
    p.dueDateISO ? `Due ${p.dueDateISO}` : null,
    p.branchId ? branchNameById[p.branchId] || p.branchId : null,
    due && open ? 'Past due' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      className={`${CARD_ROW} cursor-pointer`}
      onClick={() => onOpenPreview?.()}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 leading-tight flex-1">
          <p className="text-[11px] font-bold text-[#134e4a] truncate uppercase">
            {p.apID}
            <span className="font-medium text-slate-600 normal-case"> · {p.supplierName}</span>
          </p>
          <p className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={meta2}>
            {meta2}
          </p>
          {open ? (
            <p className="text-[9px] text-slate-600 mt-1 tabular-nums">
              {formatNgn(amt)} · Paid {formatNgn(paid)} ·{' '}
              <span className="font-bold text-amber-900">Due {formatNgn(outstanding)}</span>
            </p>
          ) : (
            <p className="text-[9px] text-emerald-800 mt-1 tabular-nums font-semibold">
              Settled · {formatNgn(amt)} paid in full
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-black text-[#134e4a] tabular-nums text-right">
            {open ? (
              <>
                <span className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wide">
                  Outstanding
                </span>
                {formatNgn(outstanding)}
              </>
            ) : (
              formatNgn(amt)
            )}
          </span>
          {open ? (
            <button
              type="button"
              disabled={!wsCanMutate || !canRecordSupplierPayment}
              onClick={(e) => {
                e.stopPropagation();
                if (!canRecordSupplierPayment) return;
                onOpenPay();
              }}
              className="text-[8px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded-md disabled:opacity-40"
            >
              Pay
            </button>
          ) : (
            <span className="text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
              Paid
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export default Procurement;
