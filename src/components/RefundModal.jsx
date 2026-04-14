import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  RotateCcw,
  Hash,
  AlertTriangle,
  DollarSign,
  Save,
  ChevronDown,
  Link2,
  Printer,
  Info,
} from 'lucide-react';
import { ModalFrame } from './layout/ModalFrame';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiBase';
import { printRefundRecord } from '../lib/refundRecordPrint';
import { refundApprovedAmount, refundOutstandingAmount } from '../lib/refundsStore';
import { formatNgn } from '../Data/mockData';
import { flattenQuotationLineItems } from '../lib/managerDashboardCore';
import {
  productionJobStatusClosesRefundEligibility,
  quotationVoidPaidRefundEligible,
} from '../lib/refundEligibility';
import {
  REFUND_REASON_CATEGORY_VALUES as REFUND_REASON_CATEGORIES,
  REFUND_PREVIEW_VERSION,
} from '../../shared/refundConstants.js';

function parseQuoteQtyDisplay(qty, unit) {
  const raw = qty != null ? String(qty).trim() : '';
  const u = unit != null ? String(unit).trim() : '';
  if (!raw && !u) return '—';
  return u ? `${raw} ${u}`.replace(/\s+/g, ' ').trim() : raw;
}

function parseQuoteQtyNumeric(qty) {
  const n = Number(String(qty ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Align intelligence accessory summary to a flattened quotation line (by id or name). */
/** First 10 chars YYYY-MM-DD from pick row or full workspace quotation. */
function quotationYmdForPickRow(q, quotationsArr) {
  const iso = String(q?.dateISO || '').trim();
  if (iso.length >= 10) return iso.slice(0, 10);
  const full = (quotationsArr || []).find((x) => String(x.id) === String(q?.id));
  const fiso = String(full?.dateISO || full?.date_iso || '').trim();
  if (fiso.length >= 10) return fiso.slice(0, 10);
  return '';
}

function findAccessoryFulfillmentRow(quotLine, accSummaryLines) {
  if (quotLine.category !== 'accessories') return null;
  const name = String(quotLine.name || '').trim();
  const nameLower = name.toLowerCase();
  const lineId = String(quotLine.id || '').trim();
  for (const a of accSummaryLines) {
    const key = String(a.quoteLineId || '').trim();
    if (lineId && key === lineId) return a;
    if (name && key === `name:${name}`) return a;
  }
  for (const a of accSummaryLines) {
    if (String(a.name || '').trim().toLowerCase() === nameLower) return a;
  }
  return null;
}

const emptyLine = () => ({ label: '', amountNgn: '', category: '' });

const emptyRequest = {
  customerID: '',
  customerName: '',
  quotationRef: '',
  reasonCategory: [],
  reasonNotes: '',
  amountNgn: '',
  calculationLines: [],
  calculationNotes: '',
  suggestedLines: [],
  alreadyRefundedCategories: [],
};

const initFormFromRecord = (record) => {
  if (!record) return { ...emptyRequest, calculationLines: [emptyLine()] };
  let cats = [];
  try {
    const raw = record.reason_category || record.reasonCategory;
    cats = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {
    cats = record.reasonCategory ? [record.reasonCategory] : [];
  }

  const lines =
    Array.isArray(record.calculationLines || record.calculation_lines_json) && (record.calculationLines || record.calculation_lines_json).length > 0
      ? (record.calculationLines || record.calculation_lines_json).map((l) => ({
          label: l.label ?? '',
          amountNgn: l.amountNgn != null ? String(l.amountNgn) : '',
          category: l.category ?? ''
        }))
      : [emptyLine()];
  return {
    customerID: record.customerID || record.customer_id || '',
    customerName: record.customerName || record.customer_name || '',
    quotationRef: record.quotationRef || record.quotation_ref || '',
    reasonCategory: cats,
    reasonNotes: record.reasonNotes || record.reason || '',
    amountNgn: record.amountNgn != null ? String(record.amountNgn) : (record.amount_ngn != null ? String(record.amount_ngn) : ''),
    calculationLines: lines,
    calculationNotes: record.calculationNotes || record.calculation_notes || '',
    suggestedLines: Array.isArray(record.suggestedLines) ? record.suggestedLines : [],
    alreadyRefundedCategories: []
  };
};

function sumLines(lines) {
  return lines.reduce((s, l) => {
    const n = Number(l.amountNgn);
    return s + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

/** API rows use snake_case; workspace snapshot uses camelCase — unify for the quotation dropdown. */
function normalizeQuoteForRefundSelect(q) {
  if (!q?.id) return null;
  const paid = Number(q.paid_ngn ?? q.paidNgn ?? 0);
  if (paid <= 0) return null;
  const total = Number(q.total_ngn ?? q.totalNgn ?? 0);
  return {
    id: String(q.id),
    customer_name: q.customer_name ?? q.customer ?? '—',
    paid_ngn: paid,
    total_ngn: total,
    dateISO: String(q.dateISO ?? q.date_iso ?? '').trim(),
    status: String(q.status ?? '').trim(),
  };
}

/**
 * @param {{
 *   isOpen: boolean;
 *   onClose: () => void;
 *   mode?: 'create'|'approve'|'view';
 *   record?: object | null;
 *   onPersist?: (payload: object) => void;
 *   requesterLabel?: string;
 *   approverLabel?: string;
 *   quotations?: object[];
 *   receipts?: object[];
 *   cuttingLists?: object[];
 *   availableStock?: object[];
 *   refunds?: object[];
 *   productionJobs?: object[];
 * }} props
 */
const RefundModal = ({
  isOpen,
  onClose,
  mode = 'create',
  record = null,
  onPersist,
  quotations = [],
  refunds = [],
  productionJobs = [],
}) => {
  const { show: showToast } = useToast();
  const [form, setForm] = useState(() => initFormFromRecord(record));
  const [eligibleQuotes, setEligibleQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [syncPaidId, setSyncPaidId] = useState('');
  const [syncPaidBusy, setSyncPaidBusy] = useState(false);
  const [syncPaidError, setSyncPaidError] = useState('');
  const [approvalStatus, setApprovalStatus] = useState(() =>
    record?.status === 'Rejected' ? 'Rejected' : 'Approved'
  );
  const [approvalDate, setApprovalDate] = useState(() => record?.approvalDate ?? '');
  const [approvedAmountNgn, setApprovedAmountNgn] = useState(() =>
    String(refundApprovedAmount(record) || Number(record?.amountNgn) || '')
  );
  const [managerComments, setManagerComments] = useState(() => record?.managerComments ?? '');
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [substitutionPerMeterBreakdown, setSubstitutionPerMeterBreakdown] = useState([]);
  const [blockedRefundCategories, setBlockedRefundCategories] = useState([]);
  const [intelligence, setIntelligence] = useState({
    receipts: [],
    cuttingLists: [],
    summary: { producedMeters: 0, accessoriesSummary: { lines: [] } },
    dataQualityIssues: [],
  });
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [lastPreviewSnapshot, setLastPreviewSnapshot] = useState(null);
  const [previewRemainingNgn, setPreviewRemainingNgn] = useState(null);
  const [refundIntelExpanded, setRefundIntelExpanded] = useState(() => mode !== 'create');
  const categoryPreviewTimerRef = useRef(null);
  /** From refund preview: paid on quote vs overpay split (ledger RECEIPT + OVERPAY_ADVANCE). */
  const [moneyContext, setMoneyContext] = useState(null);
  const [refundGuideOpen, setRefundGuideOpen] = useState(false);
  /** Filter quotation dropdown by quote date (YYYY-MM-DD); empty = all dates. */
  const [quotationPickDate, setQuotationPickDate] = useState('');

  useEffect(() => {
    if (!isOpen) setRefundGuideOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setRefundIntelExpanded(mode !== 'create');
  }, [isOpen, mode]);

  useEffect(
    () => () => {
      if (categoryPreviewTimerRef.current) clearTimeout(categoryPreviewTimerRef.current);
    },
    []
  );

  const fetchEligibleQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    const { ok, data } = await apiFetch('/api/refunds/eligible-quotations');
    setLoadingQuotes(false);
    if (ok && data?.ok) {
      setEligibleQuotes(data.quotations || []);
    } else {
      setEligibleQuotes([]);
    }
  }, []);

  const syncPaidFromLedger = useCallback(async () => {
    const id = String(syncPaidId || '').trim();
    if (!id) {
      setSyncPaidError('Enter the quotation id (e.g. QT-26-001).');
      return;
    }
    setSyncPaidBusy(true);
    setSyncPaidError('');
    const { ok, data } = await apiFetch(`/api/quotations/${encodeURIComponent(id)}/sync-paid-from-ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    setSyncPaidBusy(false);
    if (!ok || !data?.ok) {
      setSyncPaidError(data?.error || 'Could not sync payment total.');
      return;
    }
    const n = Number(data.paidNgn) || 0;
    showToast(
      n > 0
        ? `Updated ${id}: paid total is now ₦${n.toLocaleString()} — it should appear in the list.`
        : `Updated ${id}: ledger shows ₦0 paid toward this quote (check receipt is linked to this id).`,
      { variant: n > 0 ? 'success' : 'info' }
    );
    void fetchEligibleQuotes();
  }, [syncPaidId, fetchEligibleQuotes, showToast]);

  /* Sync form state when the modal opens or the record/mode changes (intentional reset). */
   
  useEffect(() => {
    if (!isOpen) return;
    setForm(initFormFromRecord(record));
    setApprovalStatus(record?.status === 'Rejected' ? 'Rejected' : 'Approved');
    setApprovalDate(record?.approvalDate ?? '');
    setApprovedAmountNgn(String(refundApprovedAmount(record) || Number(record?.amountNgn) || ''));
    setManagerComments(record?.managerComments ?? '');
    setSaving(false);
    setPreviewLoading(false);
    setPreviewError('');
    setWarnings([]);
    setSubstitutionPerMeterBreakdown([]);
    setBlockedRefundCategories([]);
    setSyncPaidId('');
    setSyncPaidError('');
    setMoneyContext(null);
    setQuotationPickDate('');
    setLastPreviewSnapshot(null);
    setPreviewRemainingNgn(null);

    if (mode === 'create') {
      void fetchEligibleQuotes();
    }
  }, [isOpen, record, mode, fetchEligibleQuotes]);

  /** Quotation refs that already have a non-rejected refund — no new request from this list. */
  const quotationRefsWithNonRejectedRefund = useMemo(() => {
    const s = new Set();
    for (const r of refunds) {
      const ref = String(r.quotationRef || '').trim();
      if (!ref || r.status === 'Rejected') continue;
      s.add(ref);
    }
    return s;
  }, [refunds]);

  /**
   * When snapshot includes jobs, quotes need a Completed or Cancelled production job for the gate,
   * unless they are paid Void (sales cancellation) — matched server-side in `getEligibleRefundQuotations`.
   */
  const quotationRefsProduced = useMemo(() => {
    if (!Array.isArray(productionJobs) || productionJobs.length === 0) return null;
    const s = new Set();
    for (const j of productionJobs) {
      if (!productionJobStatusClosesRefundEligibility(j.status)) continue;
      const ref = String(j.quotationRef || '').trim();
      if (ref) s.add(ref);
    }
    return s;
  }, [productionJobs]);

  /** Server-eligible quotes plus workspace fallback; excludes refunds on file and (when known) not-yet-produced quotes. */
  const quotationPickMerged = useMemo(() => {
    const byId = new Map();
    for (const q of eligibleQuotes) {
      const n = normalizeQuoteForRefundSelect(q);
      if (n) byId.set(n.id, n);
    }
    for (const q of quotations) {
      const n = normalizeQuoteForRefundSelect(q);
      if (n && !byId.has(n.id)) byId.set(n.id, n);
    }
    const merged = Array.from(byId.values()).sort((a, b) => b.paid_ngn - a.paid_ngn);
    return merged.filter((q) => {
      const id = String(q.id).trim();
      if (mode !== 'create' && String(form.quotationRef || '').trim() === id) return true;
      if (quotationRefsWithNonRejectedRefund.has(id)) return false;
      if (quotationRefsProduced != null && !quotationRefsProduced.has(id)) {
        const full = quotations.find((x) => String(x.id).trim() === id);
        const voidPaid =
          quotationVoidPaidRefundEligible(q) || quotationVoidPaidRefundEligible(full);
        if (!voidPaid) return false;
      }
      return true;
    });
  }, [
    eligibleQuotes,
    quotations,
    quotationRefsWithNonRejectedRefund,
    quotationRefsProduced,
    mode,
    form.quotationRef,
  ]);

  /** Dropdown list (optional filter by quotation date). */
  const quotationPickList = useMemo(() => {
    const d = String(quotationPickDate || '').trim();
    if (!d) return quotationPickMerged;
    return quotationPickMerged.filter((q) => quotationYmdForPickRow(q, quotations) === d);
  }, [quotationPickMerged, quotationPickDate, quotations]);

  const refundMoneyBreakdown = useMemo(() => {
    const ref = form.quotationRef;
    if (!ref) return { booked: 0, overpay: 0, cashIn: 0 };
    const pick =
      quotationPickMerged.find((q) => q.id === ref) ||
      normalizeQuoteForRefundSelect(quotations.find((x) => String(x.id) === ref));
    const booked = moneyContext ? moneyContext.paidOnQuoteNgn : pick?.paid_ngn ?? 0;
    const overpay = moneyContext
      ? moneyContext.overpayAdvanceNgn
      : Number(intelligence.summary?.overpayAdvanceNgn) || 0;
    const cashIn = moneyContext ? moneyContext.quotationCashInNgn : booked + overpay;
    return { booked, overpay, cashIn };
  }, [form.quotationRef, quotationPickMerged, quotations, moneyContext, intelligence.summary]);

  /** Sum of cash from sales receipts linked to this quotation (intelligence payload). */
  const refundIntelReceiptsTotalNgn = useMemo(
    () => (intelligence.receipts || []).reduce((s, r) => s + (Number(r.amountNgn) || 0), 0),
    [intelligence.receipts]
  );

  /** Products, accessories, and services from the quotation with accessory supplied / shortfall from intelligence. */
  const refundIntelQuotationOrderRows = useMemo(() => {
    const ref = String(form.quotationRef || '').trim();
    if (!ref) return [];
    const q = quotations.find((x) => String(x.id) === ref);
    const flat = flattenQuotationLineItems(q);
    if (flat.length === 0) return [];
    const accLines = intelligence.summary?.accessoriesSummary?.lines || [];
    return flat.map((line, idx) => {
      const acc = findAccessoryFulfillmentRow(line, accLines);
      const ordered = acc != null ? Number(acc.ordered) || 0 : parseQuoteQtyNumeric(line.qty);
      const supplied = acc != null ? Number(acc.supplied) || 0 : null;
      const shortfall = acc != null ? Math.max(0, Number(acc.shortfall) || 0) : null;
      return {
        key: `${line.category}-${line.id || line.name}-${idx}`,
        categoryLabel:
          line.category === 'products' ? 'Product' : line.category === 'accessories' ? 'Accessory' : 'Service',
        name: String(line.name || '—'),
        qtyLabel: parseQuoteQtyDisplay(line.qty, line.unit),
        ordered,
        supplied,
        shortfall,
        isAccessoryTracked: !!acc,
      };
    });
  }, [form.quotationRef, quotations, intelligence.summary?.accessoriesSummary?.lines]);

  const generatePreview = async (quoteRef, categories) => {
    if (!quoteRef) return;
    setPreviewLoading(true);
    setPreviewError('');
    setWarnings([]);
    setSubstitutionPerMeterBreakdown([]);
    const { ok, data } = await apiFetch('/api/refunds/preview', {
      method: 'POST',
      body: JSON.stringify({
        quotationRef: quoteRef,
        reasonCategory: categories,
      }),
    });
    setPreviewLoading(false);
    if (!ok || !data?.ok || !data?.preview) {
      setMoneyContext(null);
      setPreviewRemainingNgn(null);
      setLastPreviewSnapshot(null);
      setPreviewError(data?.error || 'Could not generate refund preview.');
      return;
    }

    const preview = data.preview;
    setPreviewRemainingNgn(
      preview.remainingRefundableNgn != null ? Math.round(Number(preview.remainingRefundableNgn)) : null
    );
    setLastPreviewSnapshot({
      capturedAtISO: new Date().toISOString(),
      engineVersion: REFUND_PREVIEW_VERSION,
      quotationRef: quoteRef,
      suggestedLines: preview.suggestedLines || [],
      warnings: preview.warnings || [],
      suggestedAmountNgn: Number(preview.suggestedAmountNgn) || 0,
      substitutionPerMeterBreakdown: preview.substitutionPerMeterBreakdown || [],
      quotedMeters: preview.quotedMeters,
      actualMeters: preview.actualMeters,
      pricePerMeterNgn: preview.pricePerMeterNgn,
      quoteTotalNgn: preview.quoteTotalNgn,
      quotationCashInNgn: preview.quotationCashInNgn,
    });
    setMoneyContext({
      paidOnQuoteNgn: Number(preview.paidOnQuoteNgn) || 0,
      overpayAdvanceNgn: Number(preview.overpayAdvanceNgn) || 0,
      quotationCashInNgn: Number(preview.quotationCashInNgn) || 0,
      quoteTotalNgn: Number(preview.quoteTotalNgn) || 0,
    });
    setForm(f => ({
      ...f,
      customerID: preview.customerID,
      customerName: preview.customerName,
      alreadyRefundedCategories: preview.alreadyRefundedCategories || []
    }));

    setWarnings(preview.warnings || []);
    setSubstitutionPerMeterBreakdown(
      Array.isArray(preview.substitutionPerMeterBreakdown) ? preview.substitutionPerMeterBreakdown : []
    );
    const blocked = Array.isArray(preview.blockedRefundCategories) ? preview.blockedRefundCategories : [];
    setBlockedRefundCategories(blocked);
    setForm((f) => ({
      ...f,
      reasonCategory: f.reasonCategory.filter((c) => !blocked.includes(c)),
    }));

    // Also fetch detailed intelligence for the sidebar
    fetchIntelligence(quoteRef);

    // Filter suggested lines: match primary category or appliesToCategories (e.g. bundled transport + installation)
    const relevantSuggestions = (preview.suggestedLines || []).filter((s) => {
      const multi = s.appliesToCategories || s.matchCategories;
      if (Array.isArray(multi) && multi.length) {
        return multi.some((c) => categories.includes(c));
      }
      return s.category && categories.includes(s.category);
    });

    setForm(f => ({
      ...f,
      calculationLines: relevantSuggestions.map(s => ({
        label: s.label,
        amountNgn: String(s.amountNgn),
        category: s.category
      }))
    }));
  };

  const generatePreviewRef = useRef(generatePreview);
  generatePreviewRef.current = generatePreview;

  const fetchIntelligence = async (quoteRef) => {
    if (!quoteRef) return;
    setLoadingIntelligence(true);
    // Fetch detailed intelligence for the sidebar
    const { ok, data } = await apiFetch(`/api/refunds/intelligence?quotationRef=${encodeURIComponent(quoteRef)}`);
    setLoadingIntelligence(false);
    if (ok && data?.ok) {
      setIntelligence({
        receipts: data.receipts || [],
        cuttingLists: data.cuttingLists || [],
        summary: data.summary || { producedMeters: 0, accessoriesSummary: { lines: [] } },
        dataQualityIssues: Array.isArray(data.dataQualityIssues) ? data.dataQualityIssues : [],
      });
    }
  };

  const toggleCategory = (cat) => {
    if (blockedRefundCategories.includes(cat)) return;
    setForm((f) => {
      const next = f.reasonCategory.includes(cat)
        ? f.reasonCategory.filter((c) => c !== cat)
        : [...f.reasonCategory, cat];
      const qref = String(f.quotationRef || '').trim();
      if (qref) {
        if (categoryPreviewTimerRef.current) clearTimeout(categoryPreviewTimerRef.current);
        categoryPreviewTimerRef.current = setTimeout(() => {
          void generatePreview(qref, next);
          categoryPreviewTimerRef.current = null;
        }, 320);
      }
      return { ...f, reasonCategory: next };
    });
  };

  const handleQuoteChange = (ref) => {
    setMoneyContext(null);
    setPreviewRemainingNgn(null);
    setLastPreviewSnapshot(null);
    setForm(f => ({ ...f, quotationRef: ref, reasonCategory: [] }));
    if (ref) {
      void generatePreview(ref, []);
    }
  };

  useEffect(() => {
    if (mode !== 'create' || !form.quotationRef || loadingQuotes) return;
    if (!quotationPickList.some((q) => q.id === form.quotationRef)) {
      setMoneyContext(null);
      setForm((f) => ({ ...f, quotationRef: '', reasonCategory: [] }));
    }
  }, [quotationPickList, form.quotationRef, mode, loadingQuotes]);

  /** Create mode opened with a seeded quotation (e.g. Sales sidebar) — same as picking the quote in Step 1. */
  const seededCreatePreviewKeyRef = useRef('');
  useEffect(() => {
    if (!isOpen || mode !== 'create') {
      seededCreatePreviewKeyRef.current = '';
      return;
    }
    const ref = String(record?.quotationRef || record?.quotation_ref || '').trim();
    if (!ref || record?.refundID) {
      seededCreatePreviewKeyRef.current = '';
      return;
    }
    if (seededCreatePreviewKeyRef.current === ref) return;
    seededCreatePreviewKeyRef.current = ref;
    void generatePreviewRef.current(ref, []);
  }, [isOpen, mode, record?.quotationRef, record?.quotation_ref, record?.refundID]);

  const readOnly = mode === 'view';
  const showApproval = mode === 'approve' && record?.status === 'Pending';
  const identityLocked = mode !== 'create';

  const approvalMoneyContext = useMemo(() => {
    if (!showApproval) return null;
    const ref = String(record?.quotationRef || '').trim();
    if (!ref) return null;
    const q =
      (quotations || []).find((x) => String(x.id) === ref) ||
      quotationPickMerged.find((x) => x.id === ref);
    const paidNgn = Math.round(Number(q?.paid_ngn ?? q?.paidNgn ?? 0)) || 0;
    let sumOthers = 0;
    for (const r of refunds || []) {
      if (String(r.quotationRef || '').trim() !== ref) continue;
      if (String(r.refundID || '') === String(record?.refundID || '')) continue;
      if (r.status === 'Rejected') continue;
      sumOthers += Math.round(Number(r.amountNgn) || 0);
    }
    const maxApprovable = Math.max(0, paidNgn - sumOthers);
    const requested = Math.round(Number(record?.amountNgn) || 0);
    return { paidNgn, sumOthers, maxApprovable, requested };
  }, [showApproval, record, quotations, quotationPickMerged, refunds]);

  const recordApprovedAmount = refundApprovedAmount(record) || Number(record?.approved_amount_ngn) || 0;
  const recordOutstandingAmount = refundOutstandingAmount(record);

  /** Categories the user can still request; excludes blocked (e.g. delivered) and already refunded. */
  const { selectableRefundCategories, excludedRefundCategories } = useMemo(() => {
    const selectable = [];
    const excluded = [];
    for (const cat of REFUND_REASON_CATEGORIES) {
      if (form.alreadyRefundedCategories.includes(cat)) {
        excluded.push({ cat, reason: 'already' });
      } else if (blockedRefundCategories.includes(cat)) {
        excluded.push({ cat, reason: 'blocked' });
      } else {
        selectable.push(cat);
      }
    }
    return { selectableRefundCategories: selectable, excludedRefundCategories: excluded };
  }, [form.alreadyRefundedCategories, blockedRefundCategories]);

  const label = 'text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block';
  const input =
    'w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-red-500/15 disabled:opacity-60';

  const setLine = (idx, patch) => {
    setForm((f) => ({
      ...f,
      calculationLines: f.calculationLines.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));
  };

  const addLine = () => {
    setForm((f) => ({ ...f, calculationLines: [...f.calculationLines, emptyLine()] }));
  };

  const removeLine = (idx) => {
    setForm((f) => ({
      ...f,
      calculationLines:
        f.calculationLines.length <= 1 ? [emptyLine()] : f.calculationLines.filter((_, i) => i !== idx),
    }));
  };

  const submitRequest = async () => {
    if (!form.quotationRef || !form.amountNgn) return;
    const amountNgn = Number(form.amountNgn);
    if (Number.isNaN(amountNgn) || amountNgn <= 0) return;
    if (form.reasonCategory.length === 0) return;
    if (form.reasonCategory.some((c) => blockedRefundCategories.includes(c))) {
      setPreviewError('Remove refund categories that are not allowed for this quotation.');
      return;
    }
    
    const calculationLines = form.calculationLines
      .map((l) => ({
        label: l.label.trim(),
        amountNgn: Number(l.amountNgn),
        category: l.category
      }))
      .filter((l) => l.label && !Number.isNaN(l.amountNgn) && l.amountNgn > 0);

    setPreviewError('');
    setSaving(true);
    const result = await onPersist?.({
      refundID: record?.refundID ?? `RF-2026-${String(Date.now()).slice(-4)}`,
      customerID: form.customerID,
      customer: form.customerName,
      quotationRef: form.quotationRef,
      reasonCategory: form.reasonCategory,
      reason: form.reasonNotes.trim() || form.reasonCategory.join(', '),
      amountNgn,
      calculationLines,
      calculationNotes: form.calculationNotes.trim(),
      status: 'Pending',
      previewSnapshot: lastPreviewSnapshot,
    });
    setSaving(false);
    if (result?.ok !== false) onClose();
  };

  const submitApproval = async () => {
    if (!record?.refundID) return;
    const nextApprovedAmountNgn =
      approvalStatus === 'Approved'
        ? Number(approvedAmountNgn) || recordApprovedAmount || Number(record?.amountNgn) || 0
        : 0;
    
    if (approvalStatus === 'Approved' && nextApprovedAmountNgn <= 0) {
      setPreviewError('Approved amount must be positive.');
      return;
    }

    setPreviewError('');
    setSaving(true);
    const result = await onPersist?.({
      ...record,
      status: approvalStatus,
      approvalDate: approvalDate.trim() || new Date().toISOString().slice(0, 10),
      managerComments: managerComments.trim(),
      approvedAmountNgn: nextApprovedAmountNgn,
      calculationLines: form.calculationLines.map(l => ({ ...l, amountNgn: Number(l.amountNgn) })),
      calculationNotes: form.calculationNotes.trim(),
    });
    setSaving(false);
    if (result?.ok !== false) onClose();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (readOnly || saving) return;
    if (showApproval) await submitApproval();
    else await submitRequest();
  };

  const modeBadge =
    mode === 'approve'
      ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400/40'
      : mode === 'view'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-rose-100 text-rose-800 ring-1 ring-rose-300/40';

  const modeLabel =
    mode === 'approve' ? 'Review' : mode === 'view' ? 'View' : 'New request';

  const formatNgnPrint = (n) =>
    `₦${Math.round(Number(n) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

  const lineSum = sumLines(form.calculationLines);
  const sumMismatch =
    mode === 'create' &&
    lineSum > 0 &&
    Number(form.amountNgn) > 0 &&
    Math.round(lineSum) !== Math.round(Number(form.amountNgn));

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <div className="z-modal-panel max-w-[min(100%,72rem)] w-full max-h-[min(94vh,920px)] flex flex-col mx-auto bg-slate-50 rounded-2xl shadow-2xl transition-all duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200/60 flex justify-between items-center bg-white/80 backdrop-blur-md rounded-t-2xl shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200 shrink-0">
              <RotateCcw size={24} className="animate-pulse-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  {mode === 'approve' ? 'Refund Approval' : mode === 'view' ? 'Refund Record' : 'Create Refund'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${modeBadge}`}>
                  {modeLabel}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                {record?.refundID ? `${record.refundID} · ${record.status}` : 'All refunds must be linked to a Finished Quotation'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {record?.refundID ? (
              <button
                type="button"
                onClick={() => printRefundRecord(record, formatNgnPrint)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Printer size={16} aria-hidden />
                Print
              </button>
            ) : null}
            <button
              type="button"
              id="refund-guide-trigger"
              aria-expanded={refundGuideOpen}
              aria-controls="refund-guide-panel"
              onClick={() => setRefundGuideOpen((o) => !o)}
              title="How refunds work"
              className="p-2.5 bg-slate-100 hover:bg-teal-50 text-teal-600 hover:text-teal-800 rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
            >
              <Info size={22} strokeWidth={2.25} aria-hidden />
              <span className="sr-only">Show how refunds work</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all duration-200"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <form className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" onSubmit={handleFormSubmit}>
          {refundGuideOpen ? (
            <div
              id="refund-guide-panel"
              role="region"
              aria-labelledby="refund-guide-trigger"
              className="flex gap-4 p-4 rounded-xl bg-teal-50 border border-teal-100/50 shadow-sm shadow-teal-100/20"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                <Link2 size={18} aria-hidden />
              </div>
              <div className="space-y-3 min-w-0">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-teal-900">Quotation-linked workflow</p>
                  <p className="text-xs leading-relaxed text-teal-800/80 font-medium">
                    Quotation is the mother of all transactions. Selecting a quotation resolves the customer and loads
                    preview hints (overpayment, metres, services, accessories).{' '}
                    <span className="font-bold text-teal-900">Suggested amounts are not final</span>—always reconcile with
                    receipts, production, and delivery before submitting or approving.
                  </p>
                </div>
                <ul className="text-[11px] leading-relaxed text-teal-900/90 font-medium space-y-1.5 list-disc pl-4 border-t border-teal-200/60 pt-3">
                  <li>Choose a quotation with payment recorded, then pick refund reason categories.</li>
                  <li>Use the preview and suggested lines as a starting point; adjust amounts to match evidence.</li>
                  <li>Submit for approval; after approval, finance records the payout against the refund.</li>
                </ul>
                <div className="border-t border-teal-200/60 pt-3 space-y-1.5">
                  <p className="text-xs font-bold text-teal-900">Which quotations appear in the list?</p>
                  <p className="text-[11px] leading-relaxed text-teal-800/85 font-medium">
                    Listed quotes have production <strong className="text-teal-950">completed</strong> or{' '}
                    <strong className="text-teal-950">cancelled</strong> (when job data is available in your workspace), or
                    are <strong className="text-teal-950">void</strong> with payment on file — plus the usual paid /
                    refund-cap rules (e.g. no duplicate non-rejected refund for the same category).
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {record?.refundID ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Activity timeline</p>
              <ul className="text-xs text-slate-700 space-y-1.5 font-medium">
                <li>
                  <span className="text-slate-500">Requested</span>{' '}
                  {record.requestedAtISO || record.requested_at_iso || '—'}
                  {record.requestedBy ? ` · ${record.requestedBy}` : ''}
                </li>
                <li>
                  <span className="text-slate-500">Status</span> {record.status || '—'}
                  {record.approvalDate ? ` · Approved ${record.approvalDate}` : ''}
                  {record.approvedBy ? ` · ${record.approvedBy}` : ''}
                </li>
                {(record.approvedAmountNgn != null || record.approved_amount_ngn != null) && (
                  <li>
                    <span className="text-slate-500">Approved amount</span> ₦
                    {Number(record.approvedAmountNgn ?? record.approved_amount_ngn ?? 0).toLocaleString('en-NG')}
                  </li>
                )}
                {record.managerComments ? (
                  <li>
                    <span className="text-slate-500">Manager note</span> {record.managerComments}
                  </li>
                ) : null}
                <li>
                  <span className="text-slate-500">Paid</span>{' '}
                  {record.paidAtISO || record.paid_at_iso
                    ? `${(record.paidAtISO || record.paid_at_iso).slice(0, 16)} · ₦${Number(record.paidAmountNgn || 0).toLocaleString('en-NG')}`
                    : '—'}
                  {record.paidBy ? ` · ${record.paidBy}` : ''}
                </li>
                {Array.isArray(record.payoutHistory) && record.payoutHistory.length > 0 ? (
                  <li className="pt-1 border-t border-slate-100">
                    <span className="text-slate-500 block mb-1">Treasury payouts</span>
                    <ul className="space-y-1 pl-2 border-l-2 border-teal-200">
                      {record.payoutHistory.map((p) => (
                        <li key={p.id} className="text-[11px]">
                          {(p.postedAtISO || '').slice(0, 16)} · ₦{Number(p.amountNgn || 0).toLocaleString('en-NG')}
                          {p.reference ? ` · ${p.reference}` : ''}
                          {p.accountName ? ` · ${p.accountName}` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {previewLoading ? (
            <p className="text-xs font-semibold text-slate-500" role="status">
              Updating refund preview…
            </p>
          ) : null}
          {previewError ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900"
              role="alert"
            >
              {previewError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              {/* Step 1: Quotation Selection */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-5 bg-rose-500 rounded-full" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Step 1: Link Quotation</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="relative min-w-0 flex-1">
                        <label className={label}>Search Finished Quotation</label>
                        <div className="relative">
                          <select
                            required
                            disabled={identityLocked}
                            value={form.quotationRef}
                            onChange={(e) => handleQuoteChange(e.target.value)}
                            className={`${input} h-11 appearance-none pr-10 border-slate-200 hover:border-rose-300 transition-colors cursor-pointer`}
                          >
                            <option value="">
                              {loadingQuotes ? 'Loading quotations…' : 'Select a quotation with payment…'}
                            </option>
                            {quotationPickList.map((q) => {
                              const ymd = quotationYmdForPickRow(q, quotations);
                              const dateBit = ymd ? ` · ${ymd}` : '';
                              return (
                                <option key={q.id} value={q.id}>
                                  {q.id} · {q.customer_name} (₦{q.paid_ngn.toLocaleString()} on quote){dateBit}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown
                            size={18}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                        </div>
                      </div>
                      <div className="w-full shrink-0 sm:w-[11.5rem]">
                        <label className={label} htmlFor="refund-quotation-date-filter">
                          Quote date
                        </label>
                        <input
                          id="refund-quotation-date-filter"
                          type="date"
                          disabled={identityLocked}
                          value={quotationPickDate}
                          onChange={(e) => setQuotationPickDate(e.target.value)}
                          className={`${input} h-11`}
                        />
                      </div>
                    </div>
                    {mode === 'create' ? (
                      <p className="text-[9px] text-slate-500 leading-snug mt-2">
                        Eligibility rules for this list are in the{' '}
                        <button
                          type="button"
                          className="font-semibold text-teal-700 underline-offset-2 hover:underline"
                          onClick={() => setRefundGuideOpen(true)}
                        >
                          info
                        </button>{' '}
                        panel (top right).
                      </p>
                    ) : null}
                    {!loadingQuotes && quotationPickList.length === 0 && mode === 'create' ? (
                      <div className="mt-2 space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                        <p className="text-[10px] text-amber-900 font-medium leading-snug">
                          Refunds only list quotations with <strong>paid total &gt; 0</strong>, production{' '}
                          <strong>completed or cancelled</strong> (or <strong>void with payment</strong>), and{' '}
                          <strong>no non-rejected refund on file</strong>{' '}
                          (rejected-only still counts as eligible). {quotationPickDate ? 'Try clearing the quote date filter.' : ''}{' '}
                          If you already posted a receipt but the quote is missing here, the payment may have been
                          recorded under a different branch than the quotation — use sync to recalculate from the ledger.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <input
                            type="text"
                            value={syncPaidId}
                            onChange={(e) => {
                              setSyncPaidId(e.target.value);
                              setSyncPaidError('');
                            }}
                            placeholder="Quotation id e.g. QT-26-001"
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-mono outline-none focus:ring-2 focus:ring-rose-200"
                          />
                          <button
                            type="button"
                            disabled={syncPaidBusy}
                            onClick={() => void syncPaidFromLedger()}
                            className="shrink-0 rounded-lg bg-[#134e4a] text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide disabled:opacity-50"
                          >
                            {syncPaidBusy ? 'Syncing…' : 'Sync paid from receipts'}
                          </button>
                        </div>
                        {syncPaidError ? (
                          <p className="text-[10px] text-rose-700 font-medium">{syncPaidError}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Steps 2 & 3: categories (compact) + breakdown — left column */}
              <div
                className={`p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-5 transition-opacity duration-300 ${!form.quotationRef ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-5 bg-rose-500 rounded-full" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Steps 2 &amp; 3: Categories &amp; breakdown
                  </h3>
                </div>

                <div>
                  <p className={label}>Refund categories</p>
                  {readOnly ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {form.reasonCategory.length ? (
                        form.reasonCategory.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700"
                          >
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <details className="group mt-1 rounded-xl border border-slate-200 bg-slate-50/80 open:bg-white open:shadow-sm transition-colors">
                        <summary
                          className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold text-slate-800 [&::-webkit-details-marker]:hidden"
                          aria-label={`Refund categories, ${form.reasonCategory.length} selected. Open or close list.`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">Select categories</span>
                            <span className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-800 tabular-nums">
                              {form.reasonCategory.length}
                            </span>
                          </span>
                          <ChevronDown
                            size={16}
                            className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <div className="max-h-48 space-y-2 overflow-y-auto border-t border-slate-100 px-3 py-2 custom-scrollbar">
                          {selectableRefundCategories.map((cat) => (
                            <label
                              key={cat}
                              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={form.reasonCategory.includes(cat)}
                                onChange={() => toggleCategory(cat)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                              />
                              <span className="text-xs font-semibold leading-snug text-slate-800">{cat}</span>
                            </label>
                          ))}
                          {selectableRefundCategories.length === 0 ? (
                            <p className="py-1 text-[11px] font-medium text-amber-800">
                              No categories left to request (all blocked or already refunded on this quotation).
                            </p>
                          ) : null}
                        </div>
                      </details>
                      {excludedRefundCategories.length > 0 ? (
                        <p className="mt-2 text-[9px] leading-snug text-slate-500">
                          <span className="font-semibold text-slate-600">Not selectable:</span>{' '}
                          {excludedRefundCategories
                            .map(({ cat, reason }) =>
                              reason === 'blocked'
                                ? `${cat} (not available — e.g. delivered)`
                                : `${cat} (already refunded)`
                            )
                            .join(' · ')}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                <div>
                  <label className={label}>Situation Context (Reason Notes)</label>
                  <textarea
                    rows={2}
                    disabled={readOnly}
                    value={form.reasonNotes}
                    onChange={(e) => setForm((f) => ({ ...f, reasonNotes: e.target.value }))}
                    placeholder="Provide specific details about the situation..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 resize-none transition-all"
                  />
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-1.5 rounded-full bg-rose-500/80" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Amount breakdown</h4>
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={addLine}
                        className="text-[10px] font-bold uppercase text-rose-600 hover:text-rose-700 underline-offset-4 hover:underline"
                      >
                        + Add manual line
                      </button>
                    ) : null}
                  </div>

                  <div
                    className={`space-y-3 transition-opacity duration-300 ${form.reasonCategory.length === 0 ? 'pointer-events-none opacity-40' : 'opacity-100'}`}
                  >
                    {form.calculationLines.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 p-8 text-center">
                        <DollarSign size={32} className="mb-2 text-slate-200" />
                        <p className="text-xs font-bold text-slate-400">
                          Select categories above to load
                          <br />
                          suggested lines
                        </p>
                      </div>
                    ) : (
                      form.calculationLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 transition-all animate-in fade-in hover:border-rose-100 hover:bg-white"
                        >
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              disabled={readOnly}
                              value={line.label}
                              onChange={(e) => setLine(idx, { label: e.target.value })}
                              className="w-full border-none bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                              placeholder="Description..."
                            />
                            <p className="mt-0.5 text-[9px] font-bold uppercase text-slate-400">
                              {line.category || 'Manual Entry'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">₦</span>
                            <input
                              type="number"
                              disabled={readOnly}
                              value={line.amountNgn}
                              onChange={(e) => setLine(idx, { amountNgn: e.target.value })}
                              className="w-24 rounded-lg border border-slate-200 bg-white py-1 px-2 text-right text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-rose-500/10 tabular-nums"
                            />
                            {!readOnly ? (
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="rounded-lg p-1 text-slate-300 transition-colors hover:text-rose-600"
                              >
                                <X size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calculated Total</p>
                        <p className="text-2xl font-black tabular-nums tracking-tighter text-slate-900">
                          ₦
                          {form.calculationLines
                            .reduce((sum, l) => sum + (Number(l.amountNgn) || 0), 0)
                            .toLocaleString()}
                        </p>
                      </div>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              amountNgn: String(
                                f.calculationLines.reduce((sum, l) => sum + (Number(l.amountNgn) || 0), 0)
                              ),
                            }))
                          }
                          className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-slate-200 transition-all hover:bg-slate-800 active:scale-95"
                        >
                          Apply Total
                        </button>
                      ) : null}
                    </div>

                    <div className="rounded-2xl bg-rose-600 p-4 text-white shadow-xl shadow-rose-200">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/60">
                        Requested Refund Amount
                      </p>
                      <div className="flex items-end gap-1">
                        <span className="mb-0.5 text-base font-black text-white/80">₦</span>
                        <input
                          required
                          type="number"
                          disabled={readOnly || identityLocked}
                          value={form.amountNgn}
                          onChange={(e) => setForm((f) => ({ ...f, amountNgn: e.target.value }))}
                          className="flex-1 border-none bg-transparent p-0 text-2xl font-black text-white outline-none focus:ring-0 tabular-nums"
                          placeholder="0"
                        />
                      </div>
                      {sumMismatch ? (
                        <p className="mt-2 text-xs font-semibold text-amber-200">
                          Line items total does not match the requested refund amount.
                        </p>
                      ) : null}
                      {previewRemainingNgn != null && mode === 'create' ? (
                        <p className="mt-2 text-[10px] font-semibold text-white/85">
                          Remaining refundable on quotation: ₦{previewRemainingNgn.toLocaleString('en-NG')}
                        </p>
                      ) : null}
                      {mode !== 'create' && recordOutstandingAmount > 0 ? (
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-white/70">
                          Outstanding after approvals: ₦{recordOutstandingAmount.toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: transaction intelligence */}
            <div className="lg:col-span-5">
              <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="text-rose-400 shrink-0" size={18} aria-hidden />
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Transaction intelligence
                    </h3>
                  </div>
                  {loadingIntelligence ? (
                    <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : null}
                </div>

                {!form.quotationRef ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center px-4">
                    <Link2 size={32} className="text-slate-700 mb-2 opacity-20" aria-hidden />
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      Select a quotation to load
                      <br />
                      customer and audit context
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-in fade-in duration-500">
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Customer</p>
                          <p className="text-sm font-bold text-white truncate">{form.customerName || '—'}</p>
                          <p className="text-[10px] font-medium text-slate-400 font-mono">{form.customerID || '—'}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:justify-items-end sm:text-right">
                          <div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Quote total</p>
                            <p className="text-sm font-black text-white tabular-nums">
                              ₦
                              {(quotationPickList.find((q) => q.id === form.quotationRef)?.total_ngn || 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Receipts total</p>
                            <p className="text-sm font-black text-emerald-400 tabular-nums">
                              ₦{refundIntelReceiptsTotalNgn.toLocaleString()}
                            </p>
                            <p className="text-[8px] text-slate-600 mt-0.5 leading-tight">
                              {intelligence.receipts.length === 0
                                ? 'No receipts linked in workspace'
                                : `${intelligence.receipts.length} linked receipt${intelligence.receipts.length === 1 ? '' : 's'}`}
                            </p>
                          </div>
                        </div>
                      </div>
                      {refundMoneyBreakdown.overpay > 0 ? (
                        <div className="pt-2 border-t border-slate-700/80 space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[9px] font-bold text-slate-500 uppercase">Customer advance (overage)</p>
                            <p className="text-sm font-black text-amber-300 tabular-nums">
                              ₦{refundMoneyBreakdown.overpay.toLocaleString()}
                            </p>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-snug">
                            Total cash recorded ₦{refundMoneyBreakdown.cashIn.toLocaleString()} — overage is not on the
                            quote; refund via customer advance if needed.
                          </p>
                        </div>
                      ) : null}
                      {previewRemainingNgn != null && mode === 'create' ? (
                        <div className="pt-2 border-t border-slate-700/80">
                          <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                            Remaining refundable (this quotation)
                          </p>
                          <p className="text-sm font-black text-amber-200 tabular-nums">
                            ₦{previewRemainingNgn.toLocaleString('en-NG')}
                          </p>
                          <p className="text-[8px] text-slate-500 leading-snug mt-0.5">
                            After existing non-rejected refund reservations. Your request cannot exceed this.
                          </p>
                        </div>
                      ) : null}
                      {(intelligence.dataQualityIssues || []).length > 0 ? (
                        <div className="pt-2 border-t border-amber-900/40 rounded-lg bg-amber-950/25 p-2.5 space-y-1.5">
                          <p className="text-[9px] font-bold text-amber-200 uppercase">Master data (substitution)</p>
                          <ul className="space-y-1">
                            {(intelligence.dataQualityIssues || []).map((issue, idx) => (
                              <li key={issue.jobId || issue.code || idx} className="text-[10px] text-amber-50/95 leading-snug">
                                • {typeof issue === 'string' ? issue : issue.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    {mode === 'create' && form.quotationRef ? (
                      <div className="flex flex-col gap-2">
                        {!refundIntelExpanded ? (
                          <button
                            type="button"
                            className="w-full rounded-xl border border-slate-600 bg-slate-800/80 py-2.5 px-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-200 hover:bg-slate-800 hover:border-slate-500 transition-colors"
                            onClick={() => setRefundIntelExpanded(true)}
                          >
                            Show detailed lines, production &amp; substitution
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="w-full rounded-xl border border-transparent py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-300 transition-colors"
                            onClick={() => setRefundIntelExpanded(false)}
                          >
                            Hide detailed analysis
                          </button>
                        )}
                      </div>
                    ) : null}

                    {(mode !== 'create' || refundIntelExpanded) && (
                    <>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Quotation order lines
                      </p>
                      {refundIntelQuotationOrderRows.length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic leading-snug">
                          No structured lines on this quotation (open the quote in Sales to add products, accessories, and
                          services).
                        </p>
                      ) : (
                        <div className="max-h-[min(260px,40vh)] overflow-auto custom-scrollbar rounded-xl border border-slate-700/80">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-[1] bg-slate-950/95 backdrop-blur border-b border-slate-700">
                              <tr>
                                <th className="py-2 pl-2.5 pr-1 text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                                  Type
                                </th>
                                <th className="py-2 px-1 text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                                  Item
                                </th>
                                <th className="py-2 px-1 text-[8px] font-bold text-slate-500 uppercase tracking-wide text-right">
                                  Qty
                                </th>
                                <th className="py-2 px-1 text-[8px] font-bold text-slate-500 uppercase tracking-wide text-right">
                                  Supplied
                                </th>
                                <th className="py-2 pr-2.5 pl-1 text-[8px] font-bold text-slate-500 uppercase tracking-wide text-right">
                                  Short
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {refundIntelQuotationOrderRows.map((row) => (
                                <tr key={row.key} className="border-t border-slate-800/90 align-top">
                                  <td className="py-1.5 pl-2.5 pr-1 text-[9px] text-slate-500 whitespace-nowrap">
                                    {row.categoryLabel}
                                  </td>
                                  <td
                                    className="py-1.5 px-1 text-[9px] font-semibold text-slate-200 max-w-[7.5rem] sm:max-w-[10rem] truncate"
                                    title={row.name}
                                  >
                                    {row.name}
                                  </td>
                                  <td className="py-1.5 px-1 text-[9px] text-right tabular-nums text-slate-300">
                                    {row.qtyLabel}
                                  </td>
                                  <td className="py-1.5 px-1 text-[9px] text-right tabular-nums text-emerald-400/95">
                                    {row.isAccessoryTracked ? row.supplied?.toLocaleString() ?? '—' : '—'}
                                  </td>
                                  <td className="py-1.5 pr-2.5 pl-1 text-[9px] text-right tabular-nums">
                                    {row.isAccessoryTracked && row.shortfall != null && row.shortfall > 0 ? (
                                      <span className="font-bold text-rose-400">{row.shortfall.toLocaleString()}</span>
                                    ) : row.isAccessoryTracked && row.shortfall === 0 ? (
                                      <span className="text-slate-500">0</span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="text-[8px] text-slate-600 px-2.5 py-2 border-t border-slate-800/80 leading-relaxed">
                            Supplied / Short come from completed production jobs for{' '}
                            <strong className="text-slate-500">accessories</strong> only. Products and services show in the
                            quote for context; sheet metres are summarized under Production &amp; delivery.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Production & delivery</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                          <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Cutting lists</p>
                          <p className="text-xs font-black">{intelligence.cuttingLists.length}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                          <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Produced metres</p>
                          <p className="text-xs font-black text-sky-400">
                            {intelligence.summary?.producedMeters?.toLocaleString() || 0} m
                          </p>
                        </div>
                      </div>
                    </div>

                    {warnings.length > 0 && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                        <p className="text-[9px] font-bold text-rose-400 uppercase flex items-center gap-1.5">
                          <AlertTriangle size={12} aria-hidden /> System audit flags
                        </p>
                        <ul className="space-y-1">
                          {warnings.map((w, idx) => (
                            <li key={idx} className="text-[10px] text-white/80 leading-snug">
                              • {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {substitutionPerMeterBreakdown.length > 0 && (
                      <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/25 space-y-2">
                        <p className="text-[9px] font-bold text-sky-300 uppercase tracking-wide">
                          Substitution — per-metre delta
                        </p>
                        <ul className="space-y-2">
                          {substitutionPerMeterBreakdown.map((row) => (
                            <li key={row.jobId || row.productName} className="text-[10px] text-white/85 leading-snug">
                              <span className="font-semibold text-white">{row.productName || row.jobId}</span>
                              <span className="text-slate-400"> · </span>
                              {Number(row.meters || 0).toFixed(2)}m × ₦
                              {Number(row.deltaPerMeterNgn || 0).toLocaleString('en-NG')}/m
                              <span className="text-slate-400"> → </span>
                              <span className="font-mono text-sky-200">
                                ₦{Number(row.creditNgn || 0).toLocaleString('en-NG')}
                              </span>
                              <div className="text-[9px] text-slate-500 mt-0.5 pl-0">
                                Quoted ₦{Number(row.quotedPricePerMeterNgn || 0).toLocaleString('en-NG')}/m vs list ₦
                                {Number(row.producedListPricePerMeterNgn || 0).toLocaleString('en-NG')}/m (FG product)
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Section for Non-Create Modes */}
              {(mode === 'view' || mode === 'approve') && (
                <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-4">
                   <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-5 bg-rose-500 rounded-full" />
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Audit & Controls</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-400 uppercase text-[9px]">Requested By</p>
                      <p className="font-bold text-slate-900">{record?.requestedBy || 'System'}</p>
                    </div>
                    <div className="space-y-1 sm:text-right">
                      <p className="font-bold text-slate-400 uppercase text-[9px]">Date</p>
                      <p className="font-bold text-slate-900 text-[11px]">{record?.requestedAtISO ? new Date(record.requestedAtISO).toLocaleDateString() : '—'}</p>
                    </div>
                  </div>

                  {showApproval && (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div
                        className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 space-y-2"
                        role="region"
                        aria-label="Approver verification checklist"
                      >
                        <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">Before you approve</p>
                        <ul className="text-[10px] text-amber-950/90 font-medium space-y-1.5 list-disc list-inside leading-snug">
                          <li>Quote total and paid amount (including customer advance) match the real money in.</li>
                          <li>Production metres, cutting lists, and delivery status fit the refund story.</li>
                          <li>You read system warnings; bundled transport/install may need a manual line split.</li>
                          <li>Line-item total matches the approved amount you are about to enter.</li>
                          <li>Required evidence (notes, photos, sign-off) is on file per branch policy.</li>
                        </ul>
                      </div>
                      <div>
                        <label className={label}>Decision</label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setApprovalStatus('Approved')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${approvalStatus === 'Approved' ? 'bg-teal-500 text-white shadow-xl shadow-teal-100' : 'bg-slate-100 text-slate-500'}`}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setApprovalStatus('Rejected')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${approvalStatus === 'Rejected' ? 'bg-rose-500 text-white shadow-xl shadow-rose-100' : 'bg-slate-100 text-slate-500'}`}
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      {approvalStatus === 'Approved' && (
                        <div className="animate-in zoom-in-95 duration-200">
                          <label className={label}>Approved Amount (₦)</label>
                          <input
                            type="number"
                            value={approvedAmountNgn}
                            onChange={(e) => setApprovedAmountNgn(e.target.value)}
                            className={`${input} font-black text-[#134e4a] text-sm h-11`}
                          />
                          {approvalMoneyContext ? (
                            <p className="mt-2 text-[10px] font-medium text-slate-600 leading-snug">
                              Requested: ₦{approvalMoneyContext.requested.toLocaleString('en-NG')} · Paid on quotation:
                              ₦{approvalMoneyContext.paidNgn.toLocaleString('en-NG')} · Other open refunds (reserved): ₦
                              {approvalMoneyContext.sumOthers.toLocaleString('en-NG')} · Approvable cap: ₦
                              {approvalMoneyContext.maxApprovable.toLocaleString('en-NG')}
                            </p>
                          ) : null}
                        </div>
                      )}

                      <div>
                        <label className={label}>Manager Comments</label>
                        <textarea
                          rows={2}
                          value={managerComments}
                          onChange={(e) => setManagerComments(e.target.value)}
                          placeholder="Why was this decided?..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 resize-none transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

          {/* Footer Warnings */}
          {warnings.length > 0 && (
            <div className="flex gap-4 p-4 rounded-xl bg-orange-50 border border-orange-100 shadow-sm animate-in shake">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-orange-900">Logic & Integrity Warnings</p>
                <ul className="list-disc list-inside text-xs font-medium text-orange-800/80">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-5 border-t border-slate-200/60 bg-white rounded-b-2xl flex justify-end items-center shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-all active:scale-95"
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving || (mode === 'create' && !form.quotationRef)}
                onClick={handleFormSubmit}
                className="group bg-rose-600 text-white px-8 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-xl shadow-rose-200 hover:brightness-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:scale-100"
              >
                {saving ? (
                  <RotateCcw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} className="group-hover:scale-110 transition-transform" />
                )}
                {showApproval ? 'Save Decision' : 'Submit Refund Request'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
};

export default RefundModal;
