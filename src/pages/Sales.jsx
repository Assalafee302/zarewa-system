import React, { useCallback, useEffect, useMemo, useRef, useState, createPortal } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus,
  FileText,
  Scissors,
  Receipt as ReceiptIcon,
  RotateCcw,
  Banknote,
  Wallet,
  Pencil,
  Package,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCircle,
  Printer,
  Bell,
} from 'lucide-react';

import SalesCustomersTab from '../components/sales/SalesCustomersTab';
import SalesCuttingListMaterialPanel from '../components/sales/SalesCuttingListMaterialPanel';
import { SalesRowMenu } from '../components/sales/SalesRowMenu';
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
import { AiAskButton } from '../components/AiAskButton';
import { formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useCustomers } from '../context/CustomersContext';
import { useInventory } from '../context/InventoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { spotPricesRowsFromMasterData } from '../lib/spotPricesFromMasterData';
import { apiFetch } from '../lib/apiBase';
import { computeCuttingListMaterialReadiness } from '../lib/salesCuttingListMaterialReadiness';
import {
  SALES_TABLE_SORT_FIELD_OPTIONS,
  sortQuotationsList,
  sortReceiptsList,
  sortCuttingLists,
  sortRefundsList,
} from '../lib/salesListSorting';
import {
  SalesListTableFrame,
  SalesListSearchInput,
  SalesListSortBar,
} from '../components/sales/SalesListTableFrame';
import {
  QUOTATION_FOLLOWUP_START_DAY,
  QUOTATION_VALIDITY_DAYS,
  isQuotationArchivedRow,
  quotationNeedsFollowUpAlert,
} from '../lib/quotationLifecycleUi';
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
  normalizeRefund,
  refundApprovedAmount,
  refundOutstandingAmount,
} from '../lib/refundsStore';
import {
  productionJobStatusClosesRefundEligibility,
  quotationVoidPaidRefundEligible,
} from '../lib/refundEligibility';
import {
  buildStockVerdict,
  coilLotRemainingKg,
  colourShort,
  firstGaugeNumeric,
  isCoilLotUnavailableForPlanning,
  roughMetersFromKg,
} from '../lib/salesStockCore';

const TAB_LABELS = {
  quotations: 'Quotations',
  receipts: 'Receipts',
  cuttinglist: 'Cutting list',
  refund: 'Refunds',
  customers: 'Customers',
};

const REFUND_POTENTIAL_SIDEBAR_CAP = 18;

/** Compact rows — aligned with Stock / Ops / Finance / Procurement */
const CARD_ROW =
  'rounded-lg border border-slate-200/60 bg-white/40 backdrop-blur-md py-1.5 px-2.5 shadow-sm transition-colors hover:bg-white/70';

const CHIP =
  'inline-flex items-center text-[8px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border shrink-0';

/** Lift row above following siblings so overflow action menus paint on top (stacking order). */
function salesListItemClass(rowKey, openKey) {
  return openKey === rowKey ? `${CARD_ROW} relative z-50` : CARD_ROW;
}

function quotePayChipBorder(ps) {
  if (ps === 'Paid') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (ps === 'Partial') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function quoteApprovalChipBorder(st) {
  if (st === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (st === 'Expired') return 'border-slate-300 bg-slate-100 text-slate-700';
  if (st === 'Void') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function receiptSourceChipBorder(src) {
  if (src === 'ledger') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function refundStatusChipBorder(st) {
  if (st === 'Paid') return 'border-sky-200 bg-sky-50 text-sky-900';
  if (st === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (st === 'Rejected') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
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
  const [showCount, setShowCount] = useState(20);
  const [showArchivedQuotations, setShowArchivedQuotations] = useState(false);
  const [salesListSort, setSalesListSort] = useState({ field: 'date', dir: 'desc' });
  const salesRole = loadSalesWorkspaceRole(ws?.session?.user?.roleKey);
  const salesRoleLabel = ws?.session?.user?.roleLabel ?? SALES_ROLE_LABELS[salesRole] ?? salesRole;
  /** Branch manager & MD hold refunds.approve; finance holds finance.approve; admin has *. */
  const canApproveRefunds = ws?.hasPermission?.('refunds.approve') || ws?.hasPermission?.('finance.approve');

  const bumpLedger = useCallback(() => setLedgerNonce((n) => n + 1), []);

  const quotations = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.quotations) ? ws.snapshot.quotations : [],
    [ws]
  );
  const importedReceipts = useMemo(
    () => (ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.receipts) ? ws.snapshot.receipts : []),
    [ws]
  );
  const cuttingLists = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.cuttingLists) ? ws.snapshot.cuttingLists : [],
    [ws]
  );
  const yardRegister = useMemo(
    () => (Array.isArray(ws?.snapshot?.yardCoilRegister) ? ws.snapshot.yardCoilRegister : []),
    [ws]
  );

  const spotPrices = useMemo(
    () => spotPricesRowsFromMasterData(ws?.snapshot?.masterData),
    [ws?.snapshot?.masterData]
  );

  const refunds = useMemo(
    () =>
      ws?.hasWorkspaceData && Array.isArray(ws?.snapshot?.refunds)
        ? ws.snapshot.refunds.map((r) => normalizeRefund(r))
        : [],
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
        if (isCoilLotUnavailableForPlanning(lot)) return;
        const kgNum = coilLotRemainingKg(lot);
        if (!(kgNum > 0)) return;
        const p = invProducts.find((x) => x.productID === lot.productID);
        const attrs = p?.dashboardAttrs;
        const gaugeLabel = String(lot.gaugeLabel || '').trim() || attrs?.gauge || '—';
        const gNum = firstGaugeNumeric(gaugeLabel);
        const colourRaw = String(lot.colour || '').trim() || attrs?.colour;
        const materialType =
          String(lot.materialTypeName || '').trim() || attrs?.materialType || p?.name || lot.productID;
        const estM = roughMetersFromKg(kgNum, gNum);
        pushRow({
          id: lot.coilNo,
          colour: colourShort(colourRaw),
          gaugeLabel,
          materialType,
          kg: kgNum,
          kgDisplay: `${kgNum.toLocaleString()} kg`,
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

  /** Book-only kg SKU lines are not receipted coils — exclude from cutting-list “coil match” to avoid false positives. */
  const coilInventoryRowsForMaterialReadiness = useMemo(
    () =>
      coilInventoryRows.filter(
        (r) => r.loc !== 'Store total' && r.loc !== 'Est. by colour split'
      ),
    [coilInventoryRows]
  );

  const cuttingListMaterialReadiness = useMemo(
    () =>
      computeCuttingListMaterialReadiness(
        cuttingLists,
        quotations,
        coilInventoryRowsForMaterialReadiness
      ),
    [cuttingLists, quotations, coilInventoryRowsForMaterialReadiness]
  );

  const openCuttingListFromMaterialAlert = useCallback((cl) => {
    setSelectedItem(cl);
    setCuttingAccessMode('view');
    setShowCuttingModal(true);
  }, []);

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

  const stockVerdict = useMemo(
    () => buildStockVerdict(stockSearchActive, stockSearchMatches),
    [stockSearchActive, stockSearchMatches]
  );

  const quotationsSearchFiltered = useMemo(() => {
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
        row.lifecycleNote,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [quotations, searchQuery]);

  const quotationFollowUpRows = useMemo(
    () =>
      quotationsSearchFiltered.filter((row) => !isQuotationArchivedRow(row) && quotationNeedsFollowUpAlert(row)),
    [quotationsSearchFiltered]
  );

  /** Quotation refs that already have a refund on file (rejected requests do not count). */
  const quotationRefsWithRefundApplied = useMemo(() => {
    const s = new Set();
    for (const r of refunds) {
      const ref = String(r.quotationRef || '').trim();
      if (!ref || r.status === 'Rejected') continue;
      s.add(ref);
    }
    return s;
  }, [refunds]);

  /** Quotation refs with production closed for refunds: Completed or Cancelled job (snapshot when available). */
  const quotationRefsWithCompletedProduction = useMemo(() => {
    const jobs = ws?.snapshot?.productionJobs;
    if (!Array.isArray(jobs) || jobs.length === 0) return null;
    const s = new Set();
    for (const j of jobs) {
      if (!productionJobStatusClosesRefundEligibility(j.status)) continue;
      const ref = String(j.quotationRef || '').trim();
      if (ref) s.add(ref);
    }
    return s;
  }, [ws?.snapshot?.productionJobs]);

  /** Paid, eligible for refund pick (void+cancelled quotes included), no non-rejected refund on file. */
  const quotationsRefundPotentialRows = useMemo(
    () =>
      quotations
        .filter((row) => {
          if (!isQuotationArchivedRow(row)) return true;
          return quotationVoidPaidRefundEligible(row);
        })
        .filter((row) => (Number(row.paidNgn) || 0) > 0)
        .filter((row) => !quotationRefsWithRefundApplied.has(String(row.id).trim()))
        .filter(
          (row) =>
            quotationRefsWithCompletedProduction == null ||
            quotationRefsWithCompletedProduction.has(String(row.id).trim()) ||
            quotationVoidPaidRefundEligible(row)
        )
        .sort((a, b) => (Number(b.paidNgn) || 0) - (Number(a.paidNgn) || 0)),
    [quotations, quotationRefsWithRefundApplied, quotationRefsWithCompletedProduction]
  );

  const filteredQuotations = useMemo(() => {
    const visible = quotationsSearchFiltered.filter(
      (row) => showArchivedQuotations || !isQuotationArchivedRow(row)
    );
    const sorted = sortQuotationsList(visible, salesListSort.field, salesListSort.dir);
    return sorted.slice(0, showCount);
  }, [quotationsSearchFiltered, showArchivedQuotations, showCount, salesListSort]);

  const mergedReceiptRows = useMemo(
    () => mergeReceiptRowsForSales(importedReceipts, quotations, ledgerSyncKey),
    [importedReceipts, quotations, ledgerSyncKey]
  );

  const quotationsRef = useRef(quotations);
  const mergedReceiptRowsRef = useRef(mergedReceiptRows);
  const refundsRef = useRef(refunds);
  const cuttingListsRef = useRef(cuttingLists);

  useEffect(() => {
    quotationsRef.current = quotations;
    mergedReceiptRowsRef.current = mergedReceiptRows;
    refundsRef.current = refunds;
    cuttingListsRef.current = cuttingLists;
  }, [quotations, mergedReceiptRows, refunds, cuttingLists]);

  const filteredMergedReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = mergedReceiptRows.filter((row) => {
      if (!q) return true;
      const blob = [
        row.id, row.customer, row.quotationRef, row.date, row.dateISO, row.amount, row.source, row._payBadge, row._subLabel, row._detailNote,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
    const sorted = sortReceiptsList(filtered, salesListSort.field, salesListSort.dir);
    return sorted.slice(0, showCount);
  }, [mergedReceiptRows, searchQuery, showCount, salesListSort]);

  const filteredCuttingLists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = cuttingLists.filter((row) => {
      if (!q) return true;
      const blob = `${row.id} ${row.customer} ${row.date} ${row.total} ${row.status}`.toLowerCase();
      return blob.includes(q);
    });
    const sorted = sortCuttingLists(filtered, salesListSort.field, salesListSort.dir);
    return sorted.slice(0, showCount);
  }, [cuttingLists, searchQuery, showCount, salesListSort]);

  const filteredRefunds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = refunds.filter((row) => {
      if (!q) return true;
      const blob = [
        row.refundID, row.customer, row.quotationRef, row.product, row.reason, row.reasonCategory, row.status, row.amountNgn, row.approvedAmountNgn, row.paidAmountNgn, row.paymentNote, row.managerComments,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
    const sorted = sortRefundsList(filtered, salesListSort.field, salesListSort.dir);
    return sorted.slice(0, showCount);
  }, [refunds, searchQuery, showCount, salesListSort]);

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
        pendingApproval: filteredQuotations.filter(
          (x) => x.status !== 'Approved' && !isQuotationArchivedRow(x)
        ).length,
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
    setShowCount(20);
    setShowArchivedQuotations(false);
    if (id === 'customers') {
      setSalesListSort({ field: 'name', dir: 'asc' });
    } else {
      setSalesListSort({ field: 'date', dir: 'desc' });
    }
  };

  /**
   * Command center (Dashboard) sends `navigate('/sales', { state: { openSalesAction } })`.
   * Consume once, then clear router state so back/refresh does not reopen modals.
   */
  useEffect(() => {
    const st = location.state ?? {};
    const action = st.openSalesAction;
    const tab = st.focusSalesTab;
    const gsq = st.globalSearchQuery;
    const record = st.openSalesRecord;
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

    const recordId = String(record?.id || '').trim();
    if (record && recordId) {
      if (record.type === 'quotation') {
        const q = quotationsRef.current.find((x) => x.id === recordId);
        setActiveTab('quotations');
        setSearchQuery('');
        if (q) {
          setSelectedItem(q);
          setQuotationAccessMode('view');
          setShowQuotationModal(true);
        } else {
          showToast(`Quotation ${recordId} not found.`, { variant: 'error' });
        }
      } else if (record.type === 'receipt') {
        const r = mergedReceiptRowsRef.current.find((x) => x.id === recordId);
        setActiveTab('receipts');
        setSearchQuery('');
        if (r) {
          setSelectedItem(r);
          setReceiptAccessMode('view');
          setShowReceiptModal(true);
        } else {
          showToast(`Receipt ${recordId} not found.`, { variant: 'error' });
        }
      } else if (record.type === 'refund') {
        const rf = refundsRef.current.find((x) => x.refundID === recordId);
        setActiveTab('refund');
        setSearchQuery('');
        if (rf) {
          setSelectedItem(rf);
          setRefundModalMode('view');
          setRefundModalKey((k) => k + 1);
          setShowRefundModal(true);
        } else {
          showToast(`Refund ${recordId} not found.`, { variant: 'error' });
        }
      } else if (record.type === 'cutting') {
        const cl = cuttingListsRef.current.find((x) => x.id === recordId);
        setActiveTab('cuttinglist');
        setSearchQuery('');
        if (cl) {
          setSelectedItem(cl);
          setCuttingAccessMode('view');
          setShowCuttingModal(true);
        } else {
          showToast(`Cutting list ${recordId} not found.`, { variant: 'error' });
        }
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
  }, [location.state, location.pathname, navigate, showToast]);

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

  /** Sidebar / deep-link: start a new refund request with quotation + customer pre-filled. */
  const openRefundCreateForQuotation = useCallback(
    (q) => {
      setActiveTab('refund');
      setSearchQuery('');
      if (!ws?.hasPermission?.('refunds.request')) {
        showToast('Your role cannot submit refund requests.', { variant: 'error' });
        return;
      }
      setSelectedItem({
        quotationRef: String(q.id ?? '').trim(),
        customerID: String(q.customerID ?? q.customer_id ?? '').trim(),
        customerName: String(q.customer ?? q.customer_name ?? '').trim(),
      });
      setRefundModalMode('create');
      setRefundModalKey((k) => k + 1);
      setShowRefundModal(true);
    },
    [showToast, ws]
  );

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
    showToast(
      ws?.usingCachedData
        ? 'Reconnect to save refunds — workspace is read-only.'
        : 'Sign in and connect to the API to save refund requests.',
      { variant: 'info' }
    );
    return { ok: false };
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
    const { editApprovalId: cuttingAid, ...cuttingBody } = payload;
    const body =
      isEdit && String(cuttingAid || '').trim()
        ? { ...cuttingBody, editApprovalId: String(cuttingAid).trim() }
        : cuttingBody;
    const { ok, data } = await apiFetch(path, {
      method: isEdit ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
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
        tabs={
          <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:items-end">
            <div className="flex w-full min-w-0 justify-start sm:justify-end">
              <PageTabs tabs={salesTabs} value={activeTab} onChange={handleTabChange} />
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
              <AiAskButton
                mode="sales"
                prompt={
                  activeTab === 'quotations'
                    ? 'Which quotations need follow-up now, and what should sales do next?'
                    : activeTab === 'receipts'
                      ? 'Summarize the receipt and settlement issues visible on this page.'
                      : activeTab === 'cuttinglist'
                        ? 'Explain cutting-list readiness and the main blockers for production.'
                        : activeTab === 'refund'
                          ? 'Summarize the refund queue and explain what needs action.'
                          : 'Summarize customer activity and tell me who needs attention.'
                }
                pageContext={{
                  source: 'sales-page',
                  activeTab,
                  searchQuery,
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#134e4a] shadow-sm hover:bg-teal-100/70"
              >
                Ask AI
              </AiAskButton>
              {activeTab === 'quotations' && (
                <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                  <Plus size={16} strokeWidth={2} /> New quotation
                </button>
              )}
              {activeTab === 'receipts' && (
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
              )}
              {activeTab === 'cuttinglist' && (
                <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                  <Plus size={16} strokeWidth={2} /> New cutting list
                </button>
              )}
              {activeTab === 'refund' && (
                <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                  <Plus size={16} strokeWidth={2} /> New refund
                </button>
              )}
              {activeTab === 'customers' && (
                <button type="button" onClick={openNewModal} className={primaryActionBtnClass}>
                  <Plus size={16} strokeWidth={2} /> Add customer
                </button>
              )}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:gap-8 min-w-0 lg:grid-cols-4">
        {activeTab !== 'customers' && (
          <aside className="lg:col-span-1 hidden lg:flex flex-col gap-5 sticky top-6">
            {activeTab === 'quotations' ? (
              <>
                {/* Spot prices */}
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
                          ₦ per metre from Setup → master data.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#134e4a] hover:bg-white transition-colors"
                      >
                        <Pencil size={12} strokeWidth={2} />
                        Edit
                      </button>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                      {spotPrices.length === 0 ? (
                        <p className="text-[11px] text-slate-500 py-2">No prices found.</p>
                      ) : (
                        spotPrices.map((row) => (
                          <div key={row.id} className="grid grid-cols-[1fr_auto] gap-x-2 items-start border-b border-slate-100 py-2.5 last:border-b-0">
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-800">{row.gaugeLabel}</span>
                              <span className="text-[9px] text-slate-500 ml-1">{row.productType}</span>
                            </div>
                            <span className="text-xs font-bold text-[#134e4a] tabular-nums text-right whitespace-nowrap pt-0.5">
                              ₦{row.priceNgn.toLocaleString()}/m
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                {/* Stock check */}
                <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
                  <div className="h-1 bg-[#134e4a]" aria-hidden />
                  <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                      <Package size={14} className="text-[#134e4a] shrink-0" strokeWidth={2} />
                      Stock check
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-2">
                       <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Material</label>
                       <div className="relative">
                         <select 
                           value={stockMatType} 
                           onChange={(e) => setStockMatType(e.target.value)}
                           className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] focus:ring-2 focus:ring-[#134e4a]/10 focus:border-[#134e4a]/30 outline-none"
                         >
                           <option value="">Any type</option>
                           {stockSearchOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                         </select>
                         <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                       </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Gauge</label>
                        <div className="relative">
                          <select 
                            value={stockGaugeFilter} 
                            onChange={(e) => setStockGaugeFilter(e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] outline-none"
                          >
                            <option value="">Any</option>
                            {stockSearchOptions.gauges.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Colour</label>
                        <div className="relative">
                          <select 
                            value={stockColourFilter} 
                            onChange={(e) => setStockColourFilter(e.target.value)}
                            className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-[#134e4a] outline-none"
                          >
                            <option value="">Any</option>
                            {stockSearchOptions.colours.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    </div>

                    {stockSearchActive && stockVerdict && (
                      <div className={`p-3 rounded-lg border ${stockVerdict.kind === 'ok' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                        <p className="text-xs font-bold text-slate-900">{stockVerdict.title}</p>
                        <p className="text-[10px] text-slate-600 mt-1">{stockVerdict.detail}</p>
                      </div>
                    )}

                    <button 
                      onClick={() => { setStockMatType(''); setStockGaugeFilter(''); setStockColourFilter(''); }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      Clear filters
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-amber-200/90 bg-amber-50/40 shadow-sm overflow-hidden">
                  <div className="h-1 bg-amber-500" aria-hidden />
                  <div className="p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-900/80 flex items-center gap-1.5">
                      <Bell size={14} className="shrink-0" strokeWidth={2} />
                      Quote validity
                    </p>
                    <p className="text-[11px] text-amber-950/80 mt-1 leading-snug">
                      Quotes stay open for <strong>{QUOTATION_VALIDITY_DAYS} days</strong> from the quote date. From day{' '}
                      <strong>{QUOTATION_FOLLOWUP_START_DAY}</strong> we flag follow-up if there is still no payment on
                      the quote. Day {QUOTATION_VALIDITY_DAYS}+ with no commitment auto-archives as{' '}
                      <strong>Expired</strong> (revivable). Master list price changes void quotes under 2 days old with
                      no commitment.
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200/80 bg-white/70 px-2.5 py-2 text-[10px] text-amber-950">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-amber-600"
                        checked={showArchivedQuotations}
                        onChange={(e) => setShowArchivedQuotations(e.target.checked)}
                      />
                      <span>Show expired / void (archived) in the list</span>
                    </label>
                    {quotationFollowUpRows.length > 0 ? (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-white/90 p-2.5">
                        <p className="text-[9px] font-bold text-amber-900 uppercase tracking-wider mb-2">
                          Follow-up ({quotationFollowUpRows.length})
                        </p>
                        <ul className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1.5">
                          {quotationFollowUpRows.slice(0, 12).map((q) => (
                            <li key={q.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItem(q);
                                  setQuotationAccessMode('view');
                                  setShowQuotationModal(true);
                                }}
                                className="w-full text-left rounded-md border border-amber-100 bg-amber-50/50 px-2 py-1.5 hover:bg-amber-100/80 transition-colors"
                              >
                                <span className="text-[10px] font-bold text-[#134e4a] tabular-nums">{q.id}</span>
                                <span className="text-[9px] text-slate-600 block truncate">{q.customer}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-800/60 mt-3 italic">No follow-up flags for current search.</p>
                    )}
                  </div>
                </section>
              </>
            ) : activeTab === 'receipts' ? (
              <ReceiptsAdvancesPanel 
                className="!h-auto !min-h-0 shadow-sm"
                ledgerNonce={ledgerNonce}
                onSelectAdvance={setAdvanceViewEntry}
                onLinkAdvance={setLinkAdvanceEntry}
              />
            ) : activeTab === 'cuttinglist' ? (
              <SalesCuttingListMaterialPanel
                ready={cuttingListMaterialReadiness.ready}
                waitingNoMatch={cuttingListMaterialReadiness.waitingNoMatch}
                onOpenCuttingList={openCuttingListFromMaterialAlert}
              />
            ) : (
              <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-5">
                <p className="text-[9px] font-bold text-[#134e4a] uppercase tracking-wider mb-1.5">
                  Potential refunds ({quotationsRefundPotentialRows.length})
                </p>
                <p className="text-[9px] text-slate-500 leading-snug mb-3">
                  Paid quotations with at least one <span className="font-semibold text-slate-600">completed production job</span>,{' '}
                  and <span className="font-semibold text-slate-600">no non-rejected refund on file</span>. Quotes with{' '}
                  <strong>only rejected</strong> refunds stay listed. <strong>Click a row</strong> to start{' '}
                  <strong>New refund</strong>.
                </p>
                {quotationsRefundPotentialRows.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">
                    None right now — no paid + produced + eligible quote, or production jobs are not in the current workspace
                    snapshot.
                  </p>
                ) : (
                  <>
                    <ul className="max-h-[min(280px,42vh)] overflow-y-auto custom-scrollbar space-y-1.5">
                      {quotationsRefundPotentialRows.slice(0, REFUND_POTENTIAL_SIDEBAR_CAP).map((q) => {
                        const paid = Number(q.paidNgn) || 0;
                        return (
                          <li key={q.id}>
                            <button
                              type="button"
                              onClick={() => openRefundCreateForQuotation(q)}
                              className="w-full text-left rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 hover:bg-white hover:border-[#134e4a]/25 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                                <span className="text-[10px] font-bold text-[#134e4a] tabular-nums font-mono">{q.id}</span>
                              </div>
                              <span className="text-[9px] text-slate-600 block truncate">{q.customer}</span>
                              <span className="text-[9px] font-semibold text-slate-700 tabular-nums mt-0.5">
                                Paid {formatNgn(paid)}
                                {q.paymentStatus ? ` · ${q.paymentStatus}` : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {quotationsRefundPotentialRows.length > REFUND_POTENTIAL_SIDEBAR_CAP ? (
                      <p className="text-[9px] text-slate-400 mt-2">
                        +{quotationsRefundPotentialRows.length - REFUND_POTENTIAL_SIDEBAR_CAP} more — search on{' '}
                        <strong>Quotations</strong>.
                      </p>
                    ) : null}
                  </>
                )}
              </section>
            )}
          </aside>
        )}

        <div
          className={
            activeTab === 'customers' ? 'lg:col-span-4 min-w-0' : 'lg:col-span-3 min-w-0'
          }
        >
          <MainPanel
            className={`!rounded-xl !border-slate-200/90 !shadow-sm !bg-white !backdrop-blur-none border !border-solid !p-0 overflow-hidden ${
              activeTab === 'receipts'
                ? 'min-h-[min(520px,72vh)]'
                : 'min-h-[min(480px,72vh)] sm:min-h-[560px]'
            }`}
          >
            <div className="h-1 bg-[#134e4a]" aria-hidden />
            <div className="p-5 sm:p-6 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-4">
                <div className="shrink-0">
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#134e4a]">
                    {TAB_LABELS[activeTab] ?? 'Records'}
                  </h2>
                  <p className="text-[9px] font-semibold text-slate-400 mt-1 tabular-nums">
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
              </div>

              <div className="space-y-2">
                {activeTab === 'quotations' ? (
                  <SalesListTableFrame
                    toolbar={
                      <>
                        <SalesListSearchInput
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search ID, customer, date, status…"
                        />
                        <SalesListSortBar
                          fields={SALES_TABLE_SORT_FIELD_OPTIONS.quotations}
                          field={salesListSort.field}
                          dir={salesListSort.dir}
                          onFieldChange={(field) => setSalesListSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setSalesListSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
                          }
                        />
                      </>
                    }
                  >
                    {filteredQuotations.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No quotations match your search
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {filteredQuotations.map((q) => {
                          const paid = q.paidNgn ?? 0;
                          const totalN = q.totalNgn ?? 0;
                          const balance = Math.max(0, totalN - paid);
                          const meta2 = [
                            q.date,
                            `Paid ${formatNgn(paid)}`,
                            `Bal ${formatNgn(balance)}`,
                            `Tot ${formatNgn(totalN)}`,
                          ].join(' · ');
                          return (
                            <li key={q.id} className={salesListItemClass(`q-${q.id}`, actionMenuKey)}>
                              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                                    <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                      <span className="tabular-nums font-mono">{q.id}</span>
                                      <span className="font-medium text-slate-600"> · {q.customer}</span>
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                        {q.total}
                                      </span>
                                      <span className={`${CHIP} ${quoteApprovalChipBorder(q.status)}`}>
                                        {q.status}
                                      </span>
                                      <span className={`${CHIP} ${quotePayChipBorder(q.paymentStatus)}`}>
                                        {q.paymentStatus}
                                      </span>
                                      {quotationNeedsFollowUpAlert(q) ? (
                                        <span
                                          className={`${CHIP} border-amber-300 bg-amber-100 text-amber-950`}
                                          title={`Day ${QUOTATION_FOLLOWUP_START_DAY}–${QUOTATION_VALIDITY_DAYS - 1} follow-up — still unpaid on quote`}
                                        >
                                          Follow up
                                        </span>
                                      ) : null}
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
                                        onAddReceipt={() => {
                                          setSelectedItem(q);
                                          setReceiptAccessMode('edit');
                                          setShowReceiptModal(true);
                                        }}
                                        onReviewAudit={
                                          ws?.hasPermission?.('manager.audit') ||
                                          ['admin', 'md', 'ceo'].includes(ws?.session?.user?.roleKey)
                                            ? () => {
                                                navigate(`/manager?quoteRef=${encodeURIComponent(q.id)}`);
                                              }
                                            : undefined
                                        }
                                      />
                                    </div>
                                  </div>
                                  <p
                                    className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2 tabular-nums"
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
                    )}
                    {quotations.length > showCount && (
                      <div className="flex justify-center mt-6">
                        <button
                          type="button"
                          onClick={() => setShowCount((c) => c + 20)}
                          className="px-6 py-2 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-[#134e4a] hover:bg-slate-50 transition-colors"
                        >
                          Show more quotations
                        </button>
                      </div>
                    )}
                  </SalesListTableFrame>
                ) : null}

                {activeTab === 'receipts' ? (
                  <SalesListTableFrame
                    toolbar={
                      <>
                        <SalesListSearchInput
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search receipt ID, customer, quotation, date…"
                        />
                        <SalesListSortBar
                          fields={SALES_TABLE_SORT_FIELD_OPTIONS.receipts}
                          field={salesListSort.field}
                          dir={salesListSort.dir}
                          onFieldChange={(field) => setSalesListSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setSalesListSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
                          }
                        />
                      </>
                    }
                  >
                    {filteredMergedReceipts.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No receipts match your search
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {filteredMergedReceipts.map((r) => {
                          const meta2 = [r.quotationRef, r.date, r._payBadge].filter(Boolean).join(' · ');
                          return (
                            <li key={r.id} className={salesListItemClass(`rc-${r.id}`, actionMenuKey)}>
                              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                      <span
                                        className={`${CHIP} whitespace-nowrap ${receiptSourceChipBorder(r.source)}`}
                                        title={r._subLabel || ''}
                                      >
                                        {r.source === 'ledger' ? 'Ledger' : 'Imported'}
                                      </span>
                                      <p className="text-[11px] font-bold text-[#134e4a] tabular-nums shrink-0">
                                        {r.id}
                                      </p>
                                      <p className="text-[11px] font-medium text-slate-600 truncate min-w-0">
                                        · {r.customer}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                        {r.amount}
                                      </span>
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
                                  {(meta2 || r.financeDeliveryClearedAtISO) ? (
                                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                                      {meta2 ? (
                                        <p
                                          className="text-[8px] text-slate-500 leading-snug truncate min-w-0 flex-1"
                                          title={meta2}
                                        >
                                          {meta2}
                                        </p>
                                      ) : null}
                                      {r.financeDeliveryClearedAtISO ? (
                                        <span
                                          className={`${CHIP} border-emerald-200 bg-emerald-50 text-emerald-900 shrink-0 whitespace-nowrap`}
                                          title={r.financeDeliveryClearedAtISO}
                                        >
                                          Cleared for delivery (Finance)
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {mergedReceiptRows.length > showCount && (
                      <div className="flex justify-center mt-6">
                        <button
                          type="button"
                          onClick={() => setShowCount((c) => c + 20)}
                          className="px-6 py-2 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-[#134e4a] hover:bg-slate-50 transition-colors"
                        >
                          Show more receipts
                        </button>
                      </div>
                    )}
                  </SalesListTableFrame>
                ) : null}

                {activeTab === 'cuttinglist' ? (
                  <SalesListTableFrame
                    toolbar={
                      <>
                        <SalesListSearchInput
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search list ID, customer, date, status…"
                        />
                        <SalesListSortBar
                          fields={SALES_TABLE_SORT_FIELD_OPTIONS.cuttinglist}
                          field={salesListSort.field}
                          dir={salesListSort.dir}
                          onFieldChange={(field) => setSalesListSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setSalesListSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
                          }
                        />
                      </>
                    }
                  >
                    {filteredCuttingLists.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No cutting lists match your search
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {filteredCuttingLists.map((c) => (
                          <li key={c.id} className={salesListItemClass(`cl-${c.id}`, actionMenuKey)}>
                            <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                                  <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                    <span className="tabular-nums font-mono">{c.id}</span>
                                    <span className="font-medium text-slate-600"> · {c.customer}</span>
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                      {c.total}
                                    </span>
                                    <span className={`${CHIP} border-sky-200 bg-sky-50 text-sky-800`}>
                                      {c.status}
                                    </span>
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
                                <p className="text-[8px] text-slate-500 mt-0.5 tabular-nums">{c.date}</p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {cuttingLists.length > showCount && (
                      <div className="flex justify-center mt-6">
                        <button
                          type="button"
                          onClick={() => setShowCount((c) => c + 20)}
                          className="px-6 py-2 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-[#134e4a] hover:bg-slate-50 transition-colors"
                        >
                          Show more cutting lists
                        </button>
                      </div>
                    )}
                  </SalesListTableFrame>
                ) : null}

                {activeTab === 'refund' ? (
                  <SalesListTableFrame
                    toolbar={
                      <>
                        <SalesListSearchInput
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search refund ID, customer, quotation, status…"
                        />
                        <SalesListSortBar
                          fields={SALES_TABLE_SORT_FIELD_OPTIONS.refund}
                          field={salesListSort.field}
                          dir={salesListSort.dir}
                          onFieldChange={(field) => setSalesListSort((s) => ({ ...s, field }))}
                          onDirToggle={() =>
                            setSalesListSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
                          }
                        />
                      </>
                    }
                  >
                    {filteredRefunds.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14 px-6 text-center">
                        <RotateCcw size={40} className="mx-auto text-slate-200 mb-3" strokeWidth={1.5} />
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          No refunds match your search
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {filteredRefunds.map((r) => {
                          const approvedAmountNgn = refundApprovedAmount(r);
                          const paidAmountNgn = Number(r.paidAmountNgn) || 0;
                          const outstandingAmountNgn = refundOutstandingAmount(r);
                          const meta2 = [
                            r.quotationRef || '—',
                            r.approvalDate,
                            approvedAmountNgn > 0 ? `Apvd ${formatNgn(approvedAmountNgn)}` : null,
                            paidAmountNgn > 0 ? `Paid ${formatNgn(paidAmountNgn)}` : null,
                            r.status === 'Approved' && outstandingAmountNgn > 0
                              ? `Bal ${formatNgn(outstandingAmountNgn)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <li
                              key={r.refundID}
                              data-testid={`refund-row-${r.refundID}`}
                              className={salesListItemClass(`rf-${r.refundID}`, actionMenuKey)}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                                    <p className="text-[11px] font-bold text-[#134e4a] truncate min-w-0">
                                      <span className="font-mono tabular-nums">{r.refundID}</span>
                                      <span className="font-medium text-slate-600"> · {r.customer}</span>
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] font-black text-[#134e4a] tabular-nums">
                                        {formatNgn(r.amountNgn)}
                                      </span>
                                      <span className={`${CHIP} ${refundStatusChipBorder(r.status)}`}>
                                        {r.status}
                                      </span>
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
                                  <p
                                    className="text-[8px] text-slate-500 mt-0.5 leading-snug line-clamp-2 tabular-nums"
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
                    )}
                    {refunds.length > showCount && (
                      <div className="flex justify-center mt-6">
                        <button
                          type="button"
                          onClick={() => setShowCount((c) => c + 20)}
                          className="px-6 py-2 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-[#134e4a] hover:bg-slate-50 transition-colors"
                        >
                          Show more refunds
                        </button>
                      </div>
                    )}
                  </SalesListTableFrame>
                ) : null}

                {activeTab === 'customers' ? (
                  <SalesCustomersTab
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    addOpen={customerAddOpen}
                    onAddClose={() => setCustomerAddOpen(false)}
                    createdByLabel={salesRoleLabel}
                    quotations={quotations}
                    receipts={mergedReceiptRows}
                    cuttingLists={cuttingLists}
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
        onQuotationRevived={(q) => {
          setSelectedItem(q);
          setQuotationAccessMode('edit');
        }}
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
        importedReceiptsForHistory={importedReceipts}
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
            <div
              className="print-portal-scroll fixed inset-0 z-[10001] overflow-y-auto overscroll-y-contain p-4 sm:p-8"
              onClick={() => setAdvancePrintEntry(null)}
            >
              <div className="mx-auto max-w-4xl pb-16" onClick={(e) => e.stopPropagation()}>
                <div className="quotation-print-root quotation-print-preview-mode rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
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
                <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
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
        receipts={mergedReceiptRows}
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
        refunds={refunds}
        productionJobs={ws?.snapshot?.productionJobs ?? []}
        receipts={mergedReceiptRows}
        cuttingLists={cuttingLists}
        availableStock={ws?.snapshot?.salesAvailableStock ?? []}
      />
    </PageShell>
  );
};

export default Sales;