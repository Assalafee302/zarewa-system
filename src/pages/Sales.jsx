import React, { useCallback, useEffect, useMemo, useState, createPortal } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  FileText,
  Scissors,
  Receipt as ReceiptIcon,
  Clock,
  MoreVertical,
  RotateCcw,
  Banknote,
  Wallet,
  Pencil,
  Package,
  Eye,
  PencilLine,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCircle,
  Printer,
} from 'lucide-react';

import SalesCustomersTab from '../components/sales/SalesCustomersTab';
import {
  ReceiptsTransactionsPanel,
  ReceiptsAdvancesPanel,
} from '../components/sales/SalesReceiptsSidebar';
import { mergeReceiptRowsForSales } from '../lib/salesReceiptsList';
import LinkAdvanceModal from '../components/sales/LinkAdvanceModal';
import { ModalFrame } from '../components/layout';
import { AdvancePaymentPrintView } from '../components/receipt/ReceiptPrintViews';
import QuotationModal from '../components/QuotationModal';
import ReceiptModal from '../components/ReceiptModal';
import AdvancePaymentModal from '../components/AdvancePaymentModal';
import CuttingListModal from '../components/CuttingListModal';
import RefundModal from '../components/RefundModal';
import { MainPanel, PageHeader, PageShell, PageTabs } from '../components/layout';
import { SALES_MOCK, SALES_YARD_COIL_REGISTER, formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useCustomers } from '../context/CustomersContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { loadSpotPrices } from '../lib/dashboardSpotPrices';
import { apiFetch } from '../lib/apiBase';
import {
  SALES_ROLE_LABELS,
  loadSalesWorkspaceRole,
  canEditQuotation,
  quotationEditBlockedReason,
  canEditReceipt,
  receiptEditBlockedReason,
  canEditCuttingList,
  cuttingListEditBlockedReason,
} from '../lib/salesWorkspaceAccess';
import {
  loadRefunds,
  saveRefunds,
  normalizeRefund,
  refundApprovedAmount,
  refundOutstandingAmount,
} from '../lib/refundsStore';

const TAB_LABELS = {
  quotations: 'Quotations',
  receipts: 'Receipts',
  cuttinglist: 'Cutting list',
  refund: 'Refunds',
  customers: 'Customers',
};

/** Match dashboard list rows — slate surfaces, teal accents */
const TABLE_HEAD =
  'hidden sm:grid grid-cols-12 px-4 text-[9px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2 mb-2 gap-1';

const ROW_SHELL =
  'grid grid-cols-12 items-center gap-y-3 px-4 py-3.5 rounded-xl border border-slate-200/90 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md group';

const PILL = 'inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide';

function firstGaugeNumeric(gaugeStr) {
  const m = String(gaugeStr ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1], 10) : null;
}

/** Rough yield for sales-side planning — not dispatch truth. */
function roughMetersFromKg(kg, gaugeMm) {
  if (kg == null || Number.isNaN(kg) || kg <= 0) return null;
  const g = gaugeMm ?? 0.26;
  const kgPerM = g <= 0.22 ? 2.35 : g <= 0.26 ? 2.65 : g <= 0.3 ? 2.9 : g <= 0.45 ? 3.4 : 3.8;
  return Math.max(0, Math.round(kg / kgPerM));
}

function colourShort(colourStr) {
  const s = String(colourStr ?? '').trim();
  if (!s) return '—';
  const tok = s.split(/[·,]/)[0].trim();
  return tok.length > 8 ? `${tok.slice(0, 7)}…` : tok;
}

function SalesRowMenu({ rowKey, openKey, setOpenKey, onView, onEdit, editDisabled, editTitle }) {
  const open = openKey === rowKey;
  return (
    <div className="relative shrink-0" data-sales-action-menu>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenKey(open ? null : rowKey)}
        className="text-slate-400 hover:text-[#134e4a] p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
      >
        <MoreVertical size={18} strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              onView();
              setOpenKey(null);
            }}
          >
            <Eye size={14} className="text-slate-400 shrink-0" />
            View
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={editDisabled}
            title={editDisabled ? editTitle : undefined}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            onClick={() => {
              if (!editDisabled) {
                onEdit();
                setOpenKey(null);
              }
            }}
          >
            <PencilLine size={14} className="text-slate-400 shrink-0" />
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

const Sales = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const { customers: customerRecords } = useCustomers();
  const { products: invProducts, coilLots } = useInventory();
  const ws = useWorkspace();

  const [activeTab, setActiveTab] = useState('quotations');
  const [searchQuery, setSearchQuery] = useState('');

  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showCuttingModal, setShowCuttingModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundModalMode, setRefundModalMode] = useState('create');
  const [refundModalKey, setRefundModalKey] = useState(0);

  const [selectedItem, setSelectedItem] = useState(null);
  const [actionMenuKey, setActionMenuKey] = useState(null);
  const [quotationAccessMode, setQuotationAccessMode] = useState('edit');
  const [receiptAccessMode, setReceiptAccessMode] = useState('edit');
  const [cuttingAccessMode, setCuttingAccessMode] = useState('edit');
  const [customerAddOpen, setCustomerAddOpen] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [linkAdvanceEntry, setLinkAdvanceEntry] = useState(null);
  const [advanceViewEntry, setAdvanceViewEntry] = useState(null);
  const [advancePrintEntry, setAdvancePrintEntry] = useState(null);
  const [ledgerNonce, setLedgerNonce] = useState(0);
  const salesRole = loadSalesWorkspaceRole(ws?.session?.user?.roleKey);
  const salesRoleLabel = ws?.session?.user?.roleLabel ?? SALES_ROLE_LABELS[salesRole] ?? salesRole;
  const canApproveRefunds = ws?.hasPermission?.('refunds.approve') || ws?.hasPermission?.('finance.approve');

  const bumpLedger = useCallback(() => setLedgerNonce((n) => n + 1), []);

  const quotations = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.quotations)
          ? ws.snapshot.quotations
          : []
        : SALES_MOCK.quotations,
    [ws]
  );
  const receipts = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.receipts)
          ? ws.snapshot.receipts
          : []
        : SALES_MOCK.receipts,
    [ws]
  );
  const cuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData
        ? Array.isArray(ws?.snapshot?.cuttingLists)
          ? ws.snapshot.cuttingLists
          : []
        : SALES_MOCK.cuttingLists,
    [ws]
  );
  const yardRegister = useMemo(
    () =>
      ws?.snapshot?.yardCoilRegister?.length > 0 ? ws.snapshot.yardCoilRegister : SALES_YARD_COIL_REGISTER,
    [ws]
  );

  const ledgerSyncKey = ledgerNonce + (ws?.refreshEpoch ?? 0);

  const onLedgerSynced = useCallback(async () => {
    bumpLedger();
    if (ws?.canMutate) await ws.refresh();
  }, [bumpLedger, ws]);

  const coilInventoryRows = useMemo(() => {
    const seenIds = new Set();
    const rows = [];

    const pushRow = (row) => {
      if (seenIds.has(row.id)) return;
      seenIds.add(row.id);
      rows.push(row);
    };

    if (coilLots.length > 0) {
      coilLots.forEach((lot) => {
        const p = invProducts.find((x) => x.productID === lot.productID);
        const attrs = p?.dashboardAttrs;
        const gaugeLabel = attrs?.gauge ?? '—';
        const gNum = firstGaugeNumeric(attrs?.gauge);
        const kgNum =
          lot.weightKg != null && !Number.isNaN(Number(lot.weightKg))
            ? Number(lot.weightKg)
            : p?.unit === 'kg'
              ? Number(lot.qtyReceived)
              : null;
        const estM = roughMetersFromKg(kgNum, gNum);
        pushRow({
          id: lot.coilNo,
          colour: colourShort(attrs?.colour),
          gaugeLabel,
          materialType: attrs?.materialType ?? p?.name ?? lot.productID,
          kg: kgNum,
          kgDisplay: kgNum != null ? `${kgNum.toLocaleString()} kg` : '—',
          estMeters: estM,
          loc: lot.location?.trim() || null,
          low: p ? p.stockLevel < p.lowStockThreshold : false,
        });
      });
    } else {
      invProducts
        .filter((p) => p.unit === 'kg')
        .forEach((p) => {
          const attrs = p.dashboardAttrs;
          const gaugeLabel = attrs?.gauge ?? '—';
          const gNum = firstGaugeNumeric(attrs?.gauge);
          const kgTotal = Number(p.stockLevel);
          const tokens = String(attrs?.colour ?? '')
            .split(/[·,]/)
            .map((t) => t.trim())
            .filter(Boolean);
          const low = p.stockLevel < p.lowStockThreshold;
          if (tokens.length === 0) {
            const estM = roughMetersFromKg(kgTotal, gNum);
            pushRow({
              id: p.productID,
              colour: colourShort(attrs?.colour),
              gaugeLabel,
              materialType: attrs?.materialType ?? p.name,
              kg: kgTotal,
              kgDisplay: `${kgTotal.toLocaleString()} kg`,
              estMeters: estM,
              loc: 'Store total',
              low,
            });
            return;
          }
          const n = tokens.length;
          const share = Math.max(0, Math.round(kgTotal / n));
          tokens.forEach((tok, i) => {
            const estM = roughMetersFromKg(share, gNum);
            pushRow({
              id: `${p.productID}-${i + 1}`,
              colour: colourShort(tok),
              gaugeLabel,
              materialType: attrs?.materialType ?? p.name,
              kg: share,
              kgDisplay: `${share.toLocaleString()} kg`,
              estMeters: estM,
              loc: 'Est. by colour split',
              low,
            });
          });
        });
    }

    yardRegister.forEach((y) => {
      if (seenIds.has(y.id)) return;
      const gNum = firstGaugeNumeric(y.gaugeLabel);
      const estM = roughMetersFromKg(y.weightKg, gNum);
      pushRow({
        id: y.id,
        colour: y.colour,
        gaugeLabel: y.gaugeLabel,
        materialType: y.materialType,
        kg: y.weightKg,
        kgDisplay: `${y.weightKg.toLocaleString()} kg`,
        estMeters: estM,
        loc: y.loc ?? 'Yard register',
        low: false,
      });
    });

    return rows;
  }, [coilLots, invProducts, yardRegister]);

  const [stockMatType, setStockMatType] = useState('');
  const [stockGaugeFilter, setStockGaugeFilter] = useState('');
  const [stockColourFilter, setStockColourFilter] = useState('');

  const stockSearchOptions = useMemo(() => {
    const types = [...new Set(coilInventoryRows.map((r) => r.materialType))].sort((a, b) =>
      a.localeCompare(b)
    );
    const gauges = [...new Set(coilInventoryRows.map((r) => String(r.gaugeLabel)))].sort((a, b) => {
      const na = parseFloat(String(a).replace(/[^\d.]/g, '')) || 0;
      const nb = parseFloat(String(b).replace(/[^\d.]/g, '')) || 0;
      if (na !== nb) return na - nb;
      return String(a).localeCompare(String(b));
    });
    const colours = [
      ...new Set(
        coilInventoryRows.map((r) => String(r.colour).trim()).filter((c) => c && c !== '—')
      ),
    ].sort((a, b) => a.localeCompare(b));
    return { types, gauges, colours };
  }, [coilInventoryRows]);

  const stockSearchActive = Boolean(stockMatType || stockGaugeFilter || stockColourFilter);

  const stockSearchMatches = useMemo(() => {
    if (!stockSearchActive) return [];
    return coilInventoryRows.filter((r) => {
      if (stockMatType && r.materialType !== stockMatType) return false;
      if (stockGaugeFilter && String(r.gaugeLabel) !== stockGaugeFilter) return false;
      if (
        stockColourFilter &&
        String(r.colour).trim().toLowerCase() !== stockColourFilter.trim().toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [coilInventoryRows, stockMatType, stockGaugeFilter, stockColourFilter, stockSearchActive]);

  const stockVerdict = useMemo(() => {
    if (!stockSearchActive) return null;
    if (stockSearchMatches.length === 0) {
      return {
        kind: 'none',
        title: 'Not available',
        detail: 'No matching coil or stock line for this combination.',
      };
    }
    const totalKg = stockSearchMatches.reduce((s, r) => s + (Number(r.kg) || 0), 0);
    const estM = stockSearchMatches.reduce((s, r) => s + (r.estMeters ?? 0), 0);
    const anyLow = stockSearchMatches.some((r) => r.low);
    const allLow = stockSearchMatches.every((r) => r.low);
    if (totalKg <= 0) {
      return {
        kind: 'none',
        title: 'Not available',
        detail: 'Matches on file show zero kg — check Operations for receipts.',
      };
    }
    const summary = `${stockSearchMatches.length} line(s) · ${totalKg.toLocaleString()} kg · ~${estM.toLocaleString()} m est.`;
    if (allLow) {
      return { kind: 'low', title: 'Low stock', detail: summary };
    }
    if (anyLow) {
      return { kind: 'mixed', title: 'Available (some lines below reorder)', detail: summary };
    }
    return { kind: 'ok', title: 'Available', detail: summary };
  }, [stockSearchActive, stockSearchMatches]);

  const [refunds, setRefunds] = useState(() => loadRefunds());
  const [spotPrices, setSpotPrices] = useState(() => loadSpotPrices());

  useEffect(() => {
    saveRefunds(refunds);
  }, [refunds]);

  const filteredQuotations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quotations.filter((row) => {
      if (!q) return true;
      const blob = [
        row.id,
        row.customer,
        row.customerID,
        row.date,
        row.total,
        row.status,
        row.paymentStatus,
        row.paidNgn,
        row.totalNgn,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [quotations, searchQuery]);

  const mergedReceiptRows = useMemo(
    () => mergeReceiptRowsForSales(receipts, quotations, ledgerSyncKey),
    [receipts, quotations, ledgerSyncKey]
  );

  const filteredMergedReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mergedReceiptRows;
    return mergedReceiptRows.filter((row) => {
      const blob = [
        row.id,
        row.customer,
        row.quotationRef,
        row.date,
        row.dateISO,
        row.amount,
        row.source,
        row._payBadge,
        row._subLabel,
        row._detailNote,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [mergedReceiptRows, searchQuery]);

  const filteredCuttingLists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cuttingLists.filter((row) => {
      if (!q) return true;
      const blob = `${row.id} ${row.customer} ${row.date} ${row.total} ${row.status}`.toLowerCase();
      return blob.includes(q);
    });
  }, [cuttingLists, searchQuery]);

  const filteredRefunds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return refunds.filter((row) => {
      if (!q) return true;
      const blob = [
        row.refundID,
        row.customer,
        row.quotationRef,
        row.product,
        row.reason,
        row.reasonCategory,
        row.status,
        row.amountNgn,
        row.approvedAmountNgn,
        row.paidAmountNgn,
        row.paymentNote,
        row.managerComments,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [refunds, searchQuery]);

  const filteredCustomersCount = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customerRecords.length;
    return customerRecords.filter((c) => {
      const blob = [
        c.customerID,
        c.name,
        c.phoneNumber,
        c.email,
        c.tier,
        c.paymentTerms,
        c.addressShipping,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    }).length;
  }, [customerRecords, searchQuery]);

  const listStats = useMemo(
    () => ({
      quotations: {
        shown: filteredQuotations.length,
        pendingApproval: filteredQuotations.filter((x) => x.status !== 'Approved').length,
      },
      receipts: { shown: filteredMergedReceipts.length },
      cuttinglist: { shown: filteredCuttingLists.length },
      refund: {
        shown: filteredRefunds.length,
        pending: filteredRefunds.filter((x) => x.status === 'Pending').length,
        awaitingPay: filteredRefunds.filter((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0).length,
      },
      customers: { shown: filteredCustomersCount, total: customerRecords.length },
    }),
    [
      filteredQuotations,
      filteredMergedReceipts,
      filteredCuttingLists,
      filteredRefunds,
      filteredCustomersCount,
      customerRecords.length,
    ]
  );

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSearchQuery('');
    setCustomerAddOpen(false);
  };

  /**
   * Command center (Dashboard) sends `navigate('/sales', { state: { openSalesAction } })`.
   * Consume once, then clear router state so back/refresh does not reopen modals.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const st = location.state ?? {};
    const action = st.openSalesAction;
    const tab = st.focusSalesTab;
    const gsq = st.globalSearchQuery;
    const openCustomerCreate = st.openCustomerCreate === true;

    if (action) {
      setSelectedItem(null);
      setSearchQuery('');
      if (action === 'quotation') {
        setActiveTab('quotations');
        setQuotationAccessMode('edit');
        setShowQuotationModal(true);
      } else if (action === 'receipt') {
        setActiveTab('receipts');
        setReceiptAccessMode('edit');
        setShowReceiptModal(true);
      } else if (action === 'cutting') {
        setActiveTab('cuttinglist');
        setCuttingAccessMode('edit');
        setShowCuttingModal(true);
      }
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const hasTab = tab && Object.prototype.hasOwnProperty.call(TAB_LABELS, tab);
    const hasSearch = typeof gsq === 'string' && gsq.trim();
    if (!openCustomerCreate && !hasTab && !hasSearch) return;

    if (openCustomerCreate) {
      setActiveTab('customers');
      setCustomerAddOpen(true);
    } else if (hasTab) {
      setActiveTab(tab);
    }
    if (hasSearch) setSearchQuery(gsq.trim());
    else if (hasTab || openCustomerCreate) setSearchQuery('');

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSpotPrices(loadSpotPrices());
  }, [location.pathname, location.key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!actionMenuKey) return;
    const onDown = (e) => {
      if (e.target.closest?.('[data-sales-action-menu]')) return;
      setActionMenuKey(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [actionMenuKey]);

  const openRefundModal = (item) => {
    setSelectedItem(item);
    setRefundModalMode(item.status === 'Pending' && canApproveRefunds ? 'approve' : 'view');
    setRefundModalKey((k) => k + 1);
    setShowRefundModal(true);
  };

  const openRefundViewOnly = (item) => {
    setSelectedItem(item);
    setRefundModalMode('view');
    setRefundModalKey((k) => k + 1);
    setShowRefundModal(true);
  };

  // Logic to handle opening modals for "New"
  const openNewModal = () => {
    setSelectedItem(null);
    if (activeTab === 'quotations') {
      setQuotationAccessMode('edit');
      setShowQuotationModal(true);
    }
    if (activeTab === 'receipts') {
      setReceiptAccessMode('edit');
      setShowReceiptModal(true);
    }
    if (activeTab === 'cuttinglist') {
      setCuttingAccessMode('edit');
      setShowCuttingModal(true);
    }
    if (activeTab === 'refund') {
      if (!ws?.hasPermission?.('refunds.request')) {
        showToast('Your role cannot submit refund requests.', { variant: 'error' });
        return;
      }
      setRefundModalMode('create');
      setRefundModalKey((k) => k + 1);
      setShowRefundModal(true);
    }
    if (activeTab === 'customers') {
      setCustomerAddOpen(true);
    }
  };

  const persistRefund = async (payload) => {
    const normalized = normalizeRefund(payload);
    if (ws?.canMutate) {
      const isCreate = refundModalMode === 'create';
      const path = isCreate
        ? '/api/refunds'
        : `/api/refunds/${encodeURIComponent(normalized.refundID)}/decision`;
      const body = isCreate
        ? normalized
        : {
            status: normalized.status,
            approvalDate: normalized.approvalDate,
            managerComments: normalized.managerComments,
            approvedAmountNgn:
              normalized.status === 'Approved' ? refundApprovedAmount(normalized) : 0,
            calculationLines: normalized.calculationLines,
            calculationNotes: normalized.calculationNotes,
            suggestedLines: normalized.suggestedLines,
          };
      const { ok, data } = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not save refund request.', { variant: 'error' });
        return { ok: false };
      }
      await ws.refresh();
      showToast(
        isCreate
          ? `Refund request ${data.refundID || normalized.refundID} submitted for approval.`
          : `Refund ${normalized.refundID} marked ${normalized.status}.`
      );
      return { ok: true };
    }
    if (refundModalMode === 'create') {
      setRefunds((prev) => [normalized, ...prev]);
      showToast(`Refund request ${normalized.refundID} submitted for approval.`);
    } else {
      setRefunds((prev) =>
        prev.map((r) => (r.refundID === normalized.refundID ? normalized : r))
      );
      showToast(
        refundModalMode === 'approve'
          ? `Refund ${normalized.refundID} marked ${normalized.status}.`
          : 'Refund record updated.'
      );
    }
    return { ok: true };
  };

  const persistCuttingList = async (payload) => {
    if (!ws?.canMutate) {
      return {
        ok: false,
        error: ws?.usingCachedData
          ? 'Reconnect to save — workspace is read-only (cached data).'
          : 'Start the API server to save cutting lists to the database.',
      };
    }
    const isEdit = Boolean(payload.id);
    const path = isEdit
      ? `/api/cutting-lists/${encodeURIComponent(payload.id)}`
      : '/api/cutting-lists';
    const { ok, data } = await apiFetch(path, {
      method: isEdit ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    if (!ok || !data?.ok) {
      return { ok: false, error: data?.error || 'Could not save cutting list.' };
    }
    await ws.refresh();
    showToast(`${isEdit ? 'Updated' : 'Created'} cutting list ${data.cuttingList?.id || data.id}.`);
    return { ok: true };
  };

  const isAnyModalOpen =
    showQuotationModal ||
    showReceiptModal ||
    showCuttingModal ||
    showRefundModal ||
    customerAddOpen ||
    showAdvanceModal;

  const salesTabs = useMemo(
    () => [
      { id: 'quotations', icon: <FileText size={16} />, label: 'Quotations' },
      { id: 'receipts', icon: <ReceiptIcon size={16} />, label: 'Receipts' },
      { id: 'cuttinglist', icon: <Scissors size={16} />, label: 'Cutting list' },
      { id: 'refund', icon: <RotateCcw size={16} />, label: 'Refunds' },
      { id: 'customers', icon: <UserCircle size={16} />, label: 'Customers' },
    ],
    []
  );

  const primaryActionBtnClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-[#134e4a] text-white px-4 py-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm hover:brightness-105 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/30 focus-visible:ring-offset-2 shrink-0';

  return (
    <PageShell blurred={isAnyModalOpen}>
      <PageHeader
        title="Sales"
        subtitle="Quotations, receipts, cutting lists, refunds & customers — yard pricing matches the dashboard spot list; stock check is in the sidebar."
        actions={
          <div className="flex flex-col gap-3 items-stretch w-full lg:max-w-none xl:max-w-5xl">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-[#134e4a]">
                {salesRoleLabel}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${
                  ws?.apiOnline
                    ? 'bg-emerald-100 text-emerald-800'
                    : ws?.usingCachedData
                      ? 'bg-sky-100 text-sky-900'
                      : 'bg-amber-100 text-amber-900'
                }`}
              >
                {ws?.apiOnline
                  ? 'Live database'
                  : ws?.usingCachedData
                    ? 'Cached — read-only'
                    : 'Demo data'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-start lg:justify-end">
              <PageTabs tabs={salesTabs} value={activeTab} onChange={handleTabChange} />
            </div>
          </div>
        }
      />

      <div
        className={`grid grid-cols-1 gap-6 lg:gap-8 min-w-0 ${
          activeTab === 'receipts' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
        }`}
      >
        {activeTab === 'receipts' ? (
          <>
            <ReceiptsTransactionsPanel
              receipts={filteredMergedReceipts}
              ledgerNonce={ledgerSyncKey}
              onOpenReceipt={(r) => {
                setSelectedItem(r);
                setReceiptAccessMode('view');
                setShowReceiptModal(true);
              }}
            />
            <ReceiptsAdvancesPanel
              ledgerNonce={ledgerSyncKey}
              onSelectAdvance={(e) => setAdvanceViewEntry(e)}
              onLinkAdvance={(e) => setLinkAdvanceEntry(e)}
            />
          </>
        ) : (
          <aside className="lg:col-span-1 space-y-5">
          {activeTab === 'quotations' ? (
            <>
          <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="h-1 bg-[#134e4a]" aria-hidden />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <Banknote size={14} className="text-[#134e4a] shrink-0" strokeWidth={2} />
                    Spot price list
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    ₦ per metre — saved in this browser (same as dashboard).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  title="Open dashboard to edit prices"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#134e4a] hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
                >
                  <Pencil size={12} strokeWidth={2} />
                  Edit
                </button>
              </div>
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                {spotPrices.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_auto] gap-x-2 items-start border-b border-slate-100 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-800">{row.gaugeLabel}</span>
                      <span className="text-[9px] text-slate-500 ml-1">{row.productType}</span>
                      {row.note ? (
                        <span className="block text-[9px] text-slate-400 mt-0.5">{row.note}</span>
                      ) : null}
                    </div>
                    <span className="text-xs font-bold text-[#134e4a] tabular-nums text-right whitespace-nowrap pt-0.5">
                      ₦{row.priceNgn.toLocaleString()}/m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="h-1 bg-[#134e4a]" aria-hidden />
            <div className="px-5 pt-4 pb-3 border-b border-slate-100">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Package size={14} className="text-[#134e4a] shrink-0" strokeWidth={2} />
                Stock availability
              </p>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Choose material type, gauge, and/or colour — see if we have matching coil or raw kg on file. Est. metres
                are planning-only; confirm in Operations.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {coilInventoryRows.length === 0 ? (
                <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
                  No stock lines yet — post a store GRN under Production → store receipt.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                      Material type
                    </label>
                    <div className="relative">
                      <select
                        value={stockMatType}
                        onChange={(e) => setStockMatType(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] outline-none focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/10"
                      >
                        <option value="">Any type</option>
                        {stockSearchOptions.types.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                      Gauge
                    </label>
                    <div className="relative">
                      <select
                        value={stockGaugeFilter}
                        onChange={(e) => setStockGaugeFilter(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] outline-none focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/10"
                      >
                        <option value="">Any gauge</option>
                        {stockSearchOptions.gauges.map((g) => (
                          <option key={g} value={g}>
                            {String(g).includes('mm') ? g : `${g} mm`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                      Colour
                    </label>
                    <div className="relative">
                      <select
                        value={stockColourFilter}
                        onChange={(e) => setStockColourFilter(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] outline-none focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/10"
                      >
                        <option value="">Any colour</option>
                        {stockSearchOptions.colours.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </div>

                  {!stockSearchActive ? (
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Select at least one filter to check availability.
                    </p>
                  ) : stockVerdict ? (
                    <div
                      className={`rounded-xl border p-3 ${
                        stockVerdict.kind === 'ok'
                          ? 'border-emerald-200 bg-emerald-50/80'
                          : stockVerdict.kind === 'mixed'
                            ? 'border-amber-200 bg-amber-50/80'
                            : stockVerdict.kind === 'low'
                              ? 'border-amber-300 bg-amber-50/90'
                              : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {stockVerdict.kind === 'ok' ? (
                          <CheckCircle2 className="shrink-0 text-emerald-600 mt-0.5" size={18} />
                        ) : stockVerdict.kind === 'none' ? (
                          <XCircle className="shrink-0 text-slate-500 mt-0.5" size={18} />
                        ) : (
                          <AlertTriangle className="shrink-0 text-amber-600 mt-0.5" size={18} />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">{stockVerdict.title}</p>
                          <p className="text-[10px] font-medium text-slate-600 mt-1 leading-snug">
                            {stockVerdict.detail}
                          </p>
                        </div>
                      </div>
                      {stockSearchMatches.length > 0 ? (
                        <div className="mt-3 max-h-[200px] overflow-y-auto custom-scrollbar border-t border-slate-200/80 pt-2">
                          <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Matching lines
                          </p>
                          <ul className="space-y-1.5">
                            {stockSearchMatches.map((row) => (
                              <li
                                key={row.id}
                                className={`rounded-lg border px-2 py-1.5 text-[9px] ${
                                  row.low
                                    ? 'border-amber-200 bg-white/80'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <span className="font-bold text-[#134e4a] tabular-nums">{row.id}</span>
                                <span className="text-slate-400"> · </span>
                                <span className="font-semibold text-slate-800">{row.colour}</span>
                                <span className="text-slate-400"> · </span>
                                <span className="tabular-nums text-slate-700">{row.gaugeLabel}</span>
                                <span className="block text-slate-500 mt-0.5 truncate" title={row.materialType}>
                                  {row.materialType}
                                </span>
                                <span className="tabular-nums text-slate-600">
                                  {row.kgDisplay}
                                  {row.estMeters != null ? ` · ~${row.estMeters.toLocaleString()} m` : ''}
                                </span>
                                {row.loc ? (
                                  <span className="block text-[8px] text-slate-400">Loc: {row.loc}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setStockMatType('');
                      setStockGaugeFilter('');
                      setStockColourFilter('');
                    }}
                    className="w-full rounded-lg border border-slate-200 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          </section>
            </>
          ) : (
            <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-5">
              <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                <span className="font-semibold text-[#134e4a]">Spot prices</span> and{' '}
                <span className="font-semibold text-[#134e4a]">stock check</span> are on the{' '}
                <strong>Quotations</strong> tab. <span className="font-semibold text-emerald-700">Receipts</span> tools
                (transactions & advances) are on the <strong>Receipts</strong> tab.
              </p>
            </section>
          )}
          </aside>
        )}

        <div
          className={
            activeTab === 'receipts' ? 'min-w-0 min-h-[min(520px,72vh)] flex flex-col' : 'lg:col-span-3 min-w-0'
          }
        >
          <MainPanel
            className={`!rounded-xl !border-slate-200/90 !shadow-sm !bg-white !backdrop-blur-none border !border-solid !p-0 overflow-hidden ${
              activeTab === 'receipts'
                ? 'min-h-[min(520px,72vh)] flex-1 min-h-0'
                : 'min-h-[min(480px,72vh)] sm:min-h-[560px]'
            }`}
          >
            <div className="h-1 bg-[#134e4a]" aria-hidden />
            <div className="p-5 sm:p-6 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div className="shrink-0">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                    {TAB_LABELS[activeTab] ?? 'Records'}
                  </h2>
                  <p className="text-[10px] font-medium text-slate-500 mt-1 tabular-nums">
                    {activeTab === 'quotations' && (
                      <>
                        {listStats.quotations.shown} showing
                        {listStats.quotations.pendingApproval > 0
                          ? ` · ${listStats.quotations.pendingApproval} awaiting approval`
                          : ''}
                      </>
                    )}
                    {activeTab === 'receipts' && <>{listStats.receipts.shown} records</>}
                    {activeTab === 'cuttinglist' && <>{listStats.cuttinglist.shown} records</>}
                    {activeTab === 'refund' && (
                      <>
                        {listStats.refund.shown} records
                        {listStats.refund.pending > 0 ? ` · ${listStats.refund.pending} pending` : ''}
                        {listStats.refund.awaitingPay > 0
                          ? ` · ${listStats.refund.awaitingPay} approved (awaiting Finance)`
                          : ''}
                      </>
                    )}
                    {activeTab === 'customers' && (
                      <>
                        {listStats.customers.shown} showing · {listStats.customers.total} total
                      </>
                    )}
                  </p>
                </div>
                <div className="relative flex-1 w-full sm:max-w-md min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    size={16}
                    strokeWidth={2}
                  />
                  <input
                    type="search"
                    placeholder={
                      activeTab === 'customers'
                        ? 'Search name, phone, ID, tier…'
                        : 'Search ID, customer, date…'
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#134e4a]/35 focus:ring-2 focus:ring-[#134e4a]/10"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-5">
                {activeTab === 'quotations' ? (
                  <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                    <Plus size={16} strokeWidth={2} /> New quotation
                  </button>
                ) : null}
                {activeTab === 'receipts' ? (
                  <>
                    <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                      <Plus size={16} strokeWidth={2} /> New receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdvanceModal(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider shadow-sm hover:bg-amber-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:ring-offset-2 shrink-0"
                      title="Payment before quotation — customer deposit / liability"
                    >
                      <Wallet size={16} strokeWidth={2} /> Advance payment
                    </button>
                  </>
                ) : null}
                {activeTab === 'cuttinglist' ? (
                  <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                    <Plus size={16} strokeWidth={2} /> New cutting list
                  </button>
                ) : null}
                {activeTab === 'refund' ? (
                  <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                    <Plus size={16} strokeWidth={2} /> New refund
                  </button>
                ) : null}
                {activeTab === 'customers' ? (
                  <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                    <Plus size={16} strokeWidth={2} /> Add customer
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                {activeTab === 'quotations' ? (
                  <>
                    <div className={TABLE_HEAD}>
                      <div className="col-span-2">ID</div>
                      <div className="col-span-2">Customer</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-2 text-right tabular-nums">Quote total</div>
                      <div className="col-span-4">Approval & payment</div>
                    </div>
                    {filteredQuotations.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No quotations match your search
                        </p>
                      </div>
                    ) : (
                      filteredQuotations.map((q) => {
                        const paid = q.paidNgn ?? 0;
                        const totalN = q.totalNgn ?? 0;
                        const balance = Math.max(0, totalN - paid);
                        const payClass =
                          q.paymentStatus === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : q.paymentStatus === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600';
                        return (
                          <div key={q.id} className={ROW_SHELL}>
                            <div className="col-span-12 sm:col-span-2 text-xs font-bold text-[#134e4a] tabular-nums">
                              {q.id}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-sm font-semibold text-slate-800">
                              {q.customer}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-xs text-slate-500 flex items-center gap-1 tabular-nums">
                              <Clock size={12} className="shrink-0 opacity-60" /> {q.date}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-right text-sm font-bold text-[#134e4a] tabular-nums">
                              {q.total}
                            </div>
                            <div className="col-span-12 sm:col-span-4 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-col gap-1.5 min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                  <span
                                    className={`${PILL} ${
                                      q.status === 'Approved'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {q.status}
                                  </span>
                                  <span className={`${PILL} ${payClass}`}>{q.paymentStatus}</span>
                                </div>
                                <p className="text-[10px] font-semibold text-slate-500 leading-tight tabular-nums">
                                  Paid {formatNgn(paid)} · Balance {formatNgn(balance)} · Total{' '}
                                  {formatNgn(totalN)}
                                </p>
                              </div>
                              <SalesRowMenu
                                rowKey={`q-${q.id}`}
                                openKey={actionMenuKey}
                                setOpenKey={setActionMenuKey}
                                onView={() => {
                                  setSelectedItem(q);
                                  setQuotationAccessMode('view');
                                  setShowQuotationModal(true);
                                }}
                                onEdit={() => {
                                  setSelectedItem(q);
                                  setQuotationAccessMode('edit');
                                  setShowQuotationModal(true);
                                }}
                                editDisabled={!canEditQuotation(q, salesRole)}
                                editTitle={quotationEditBlockedReason(q, salesRole) ?? ''}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : null}

                {activeTab === 'receipts' ? (
                  <>
                    <div className={TABLE_HEAD}>
                      <div className="col-span-1">Source</div>
                      <div className="col-span-2">ID</div>
                      <div className="col-span-2">Customer</div>
                      <div className="col-span-2">Quotation</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-2 text-right tabular-nums">Amount</div>
                      <div className="col-span-1 text-center"> </div>
                    </div>
                    {filteredMergedReceipts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No receipts match your search
                        </p>
                      </div>
                    ) : (
                      filteredMergedReceipts.map((r) => (
                        <div key={r.id} className={`${ROW_SHELL} cursor-default`}>
                          <div className="col-span-1">
                            <span
                              className={`${PILL} whitespace-nowrap ${
                                r.source === 'ledger'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                              title={r._subLabel || ''}
                            >
                              {r.source === 'ledger' ? 'Ledger' : 'Sample'}
                            </span>
                          </div>
                          <div className="col-span-2 text-xs font-bold text-[#134e4a] tabular-nums">{r.id}</div>
                          <div className="col-span-2 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{r.customer}</p>
                            {r._payBadge ? (
                              <p
                                className="text-[9px] font-medium text-slate-500 mt-0.5 line-clamp-2 leading-tight"
                                title={r._payBadge}
                              >
                                {r._payBadge}
                              </p>
                            ) : null}
                          </div>
                          <div className="col-span-2 text-xs font-semibold text-slate-600 tabular-nums">
                            {r.quotationRef}
                          </div>
                          <div className="col-span-2 text-xs text-slate-500 flex items-center gap-1 tabular-nums">
                            <Clock size={12} className="shrink-0 opacity-60" /> {r.date}
                          </div>
                          <div className="col-span-2 text-right text-sm font-bold text-[#134e4a] tabular-nums">
                            {r.amount}
                          </div>
                          <div className="col-span-1 flex justify-center items-center gap-1">
                            <SalesRowMenu
                              rowKey={`rc-${r.id}`}
                              openKey={actionMenuKey}
                              setOpenKey={setActionMenuKey}
                              onView={() => {
                                setSelectedItem(r);
                                setReceiptAccessMode('view');
                                setShowReceiptModal(true);
                              }}
                              onEdit={() => {
                                setSelectedItem(r);
                                setReceiptAccessMode('edit');
                                setShowReceiptModal(true);
                              }}
                              editDisabled={!canEditReceipt(r, salesRole)}
                              editTitle={receiptEditBlockedReason(r, salesRole) ?? ''}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : null}

                {activeTab === 'cuttinglist' ? (
                  <>
                    <div className={TABLE_HEAD}>
                      <div className="col-span-2">ID</div>
                      <div className="col-span-4">Customer</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-2 text-right tabular-nums">Length</div>
                      <div className="col-span-2 text-center">Status</div>
                    </div>
                    {filteredCuttingLists.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No cutting lists match your search
                        </p>
                      </div>
                    ) : (
                      filteredCuttingLists.map((c) => (
                        <div key={c.id} className={`${ROW_SHELL} cursor-default`}>
                          <div className="col-span-2 text-xs font-bold text-[#134e4a] tabular-nums">{c.id}</div>
                          <div className="col-span-4 text-sm font-semibold text-slate-800">{c.customer}</div>
                          <div className="col-span-2 text-xs text-slate-500 flex items-center gap-1 tabular-nums">
                            <Clock size={12} className="shrink-0 opacity-60" /> {c.date}
                          </div>
                          <div className="col-span-2 text-right text-sm font-bold text-[#134e4a] tabular-nums">
                            {c.total}
                          </div>
                          <div className="col-span-2 flex justify-center items-center gap-3">
                            <span className={`${PILL} bg-sky-100 text-sky-800`}>{c.status}</span>
                            <SalesRowMenu
                              rowKey={`cl-${c.id}`}
                              openKey={actionMenuKey}
                              setOpenKey={setActionMenuKey}
                              onView={() => {
                                setSelectedItem(c);
                                setCuttingAccessMode('view');
                                setShowCuttingModal(true);
                              }}
                              onEdit={() => {
                                setSelectedItem(c);
                                setCuttingAccessMode('edit');
                                setShowCuttingModal(true);
                              }}
                              editDisabled={!canEditCuttingList(c)}
                              editTitle={cuttingListEditBlockedReason(c) ?? ''}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </>
                ) : null}

                {activeTab === 'refund' ? (
                  <>
                    <div className={TABLE_HEAD}>
                      <div className="col-span-2">Refund ID</div>
                      <div className="col-span-2">Customer</div>
                      <div className="col-span-2">Quotation</div>
                      <div className="col-span-2 text-right tabular-nums">Amount</div>
                      <div className="col-span-3">Status</div>
                      <div className="col-span-1 text-right"> </div>
                    </div>
                    {filteredRefunds.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <RotateCcw size={40} className="mx-auto text-slate-200 mb-3" strokeWidth={1.5} />
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No refunds match your search
                        </p>
                      </div>
                    ) : (
                      filteredRefunds.map((r) => {
                        const approvedAmountNgn = refundApprovedAmount(r);
                        const paidAmountNgn = Number(r.paidAmountNgn) || 0;
                        const outstandingAmountNgn = refundOutstandingAmount(r);
                        return (
                          <div key={r.refundID} className={`${ROW_SHELL} gap-y-2`}>
                            <div className="col-span-12 sm:col-span-2 text-xs font-bold text-[#134e4a] tabular-nums">
                              {r.refundID}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-sm font-semibold text-slate-800">
                              {r.customer}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-xs font-semibold text-slate-600 tabular-nums">
                              {r.quotationRef || '—'}
                            </div>
                            <div className="col-span-12 sm:col-span-2 text-right text-sm font-bold text-[#134e4a] tabular-nums">
                              {formatNgn(r.amountNgn)}
                            </div>
                            <div className="col-span-12 sm:col-span-3 flex flex-wrap items-center gap-2">
                              <span
                                className={`${PILL} ${
                                  r.status === 'Paid'
                                    ? 'bg-sky-100 text-sky-900'
                                    : r.status === 'Approved'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : r.status === 'Rejected'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {r.status}
                              </span>
                              {r.approvalDate ? (
                                <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                                  {r.approvalDate}
                                </span>
                              ) : null}
                              {approvedAmountNgn > 0 ? (
                                <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                                  Approved {formatNgn(approvedAmountNgn)}
                                </span>
                              ) : null}
                              {paidAmountNgn > 0 ? (
                                <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                                  Paid {formatNgn(paidAmountNgn)}
                                </span>
                              ) : null}
                              {r.status === 'Approved' && outstandingAmountNgn > 0 ? (
                                <span className="text-[10px] font-semibold text-amber-700 tabular-nums">
                                  Balance {formatNgn(outstandingAmountNgn)}
                                </span>
                              ) : null}
                            </div>
                            <div className="col-span-12 sm:col-span-1 flex sm:justify-end">
                              <SalesRowMenu
                                rowKey={`rf-${r.refundID}`}
                                openKey={actionMenuKey}
                                setOpenKey={setActionMenuKey}
                                onView={() => openRefundViewOnly(r)}
                                onEdit={() => openRefundModal(r)}
                                editDisabled={false}
                                editTitle=""
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : null}

                {activeTab === 'customers' ? (
                  <SalesCustomersTab
                    searchQuery={searchQuery}
                    addOpen={customerAddOpen}
                    onAddClose={() => setCustomerAddOpen(false)}
                    createdByLabel={salesRoleLabel}
                    quotations={quotations}
                    receipts={receipts}
                    cuttingLists={cuttingLists}
                    liveMode={Boolean(ws?.hasWorkspaceData)}
                  />
                ) : null}
              </div>
            </div>
          </MainPanel>
        </div>
      </div>

      {/* --- MODALS --- */}
      <QuotationModal
        isOpen={showQuotationModal}
        editData={selectedItem}
        accessMode={quotationAccessMode}
        onClose={() => setShowQuotationModal(false)}
        ledgerNonce={ledgerSyncKey}
        onLedgerChange={onLedgerSynced}
        useLedgerApi={Boolean(ws?.canMutate)}
        useQuotationApi={Boolean(ws?.canMutate)}
        quotedByStaff={salesRoleLabel}
      />
      <ReceiptModal
        isOpen={showReceiptModal}
        editData={selectedItem}
        accessMode={receiptAccessMode}
        onClose={() => setShowReceiptModal(false)}
        quotations={quotations}
        mockReceiptsForHistory={receipts}
        ledgerNonce={ledgerSyncKey}
        onLedgerChange={onLedgerSynced}
        useLedgerApi={Boolean(ws?.canMutate)}
        handledByLabel={salesRoleLabel}
      />
      <AdvancePaymentModal
        isOpen={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        onPosted={onLedgerSynced}
        useLedgerApi={Boolean(ws?.canMutate)}
        handledByLabel={salesRoleLabel}
      />
      <LinkAdvanceModal
        isOpen={Boolean(linkAdvanceEntry)}
        advanceEntry={linkAdvanceEntry}
        onClose={() => setLinkAdvanceEntry(null)}
        quotations={quotations}
        ledgerNonce={ledgerSyncKey}
        onPosted={onLedgerSynced}
        useLedgerApi={Boolean(ws?.canMutate)}
      />
      <ModalFrame isOpen={Boolean(advanceViewEntry)} onClose={() => setAdvanceViewEntry(null)}>
        <div className="z-modal-panel max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-xl">
          <h3 className="text-base font-bold text-[#134e4a]">Advance payment</h3>
          {advanceViewEntry ? (
            <dl className="mt-4 space-y-2 text-[11px] text-slate-700">
              <div>
                <dt className="font-semibold text-slate-400 uppercase text-[9px]">Customer</dt>
                <dd>{advanceViewEntry.customerName || advanceViewEntry.customerID}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-400 uppercase text-[9px]">Amount</dt>
                <dd className="text-lg font-black text-[#134e4a] tabular-nums">
                  {formatNgn(advanceViewEntry.amountNgn)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-400 uppercase text-[9px]">Date</dt>
                <dd>{(advanceViewEntry.atISO || '').slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-400 uppercase text-[9px]">Method / ref</dt>
                <dd>{advanceViewEntry.paymentMethod || '—'}</dd>
                <dd className="text-slate-500">{advanceViewEntry.bankReference || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-400 uppercase text-[9px]">Purpose</dt>
                <dd>{advanceViewEntry.purpose || advanceViewEntry.note || '—'}</dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => setAdvanceViewEntry(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-[10px] font-semibold uppercase text-slate-600"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                if (advanceViewEntry) setAdvancePrintEntry(advanceViewEntry);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[10px] font-semibold uppercase"
            >
              <Printer size={14} /> Print voucher
            </button>
          </div>
        </div>
      </ModalFrame>
      {advancePrintEntry &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close print preview"
              className="no-print fixed inset-0 z-[10000] bg-black/50"
              onClick={() => setAdvancePrintEntry(null)}
            />
            <div className="no-print fixed inset-0 z-[10001] overflow-y-auto p-4 sm:p-8 pointer-events-none">
              <div className="pointer-events-auto mx-auto max-w-[148mm] pb-16">
                <div className="receipt-print-root overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
                  <AdvancePaymentPrintView
                    customerName={advancePrintEntry.customerName || advancePrintEntry.customerID}
                    amountNgn={advancePrintEntry.amountNgn}
                    dateStr={(advancePrintEntry.atISO || '').slice(0, 10)}
                    accountLabel={advancePrintEntry.paymentMethod || '—'}
                    reference={advancePrintEntry.bankReference || '—'}
                    purpose={advancePrintEntry.purpose || advancePrintEntry.note || '—'}
                    handledBy={salesRoleLabel}
                  />
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-amber-700 px-5 py-2.5 text-[10px] font-semibold uppercase text-white shadow-lg"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancePrintEntry(null)}
                    className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-semibold uppercase text-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      <CuttingListModal
        isOpen={showCuttingModal}
        editData={selectedItem}
        accessMode={cuttingAccessMode}
        onClose={() => setShowCuttingModal(false)}
        quotations={quotations}
        receipts={receipts}
        cuttingLists={cuttingLists}
        onPersist={persistCuttingList}
        onCuttingListUpdated={(cl) => setSelectedItem(cl)}
        handledByLabel={salesRoleLabel}
      />
      <RefundModal
        key={refundModalKey}
        isOpen={showRefundModal}
        mode={refundModalMode}
        record={selectedItem}
        onPersist={persistRefund}
        onClose={() => setShowRefundModal(false)}
        requesterLabel={salesRoleLabel}
        approverLabel={salesRoleLabel}
        quotations={quotations}
        receipts={receipts}
        cuttingLists={cuttingLists}
        availableStock={ws?.snapshot?.salesAvailableStock ?? SALES_MOCK.availableStock}
      />
    </PageShell>
  );
};

export default Sales;