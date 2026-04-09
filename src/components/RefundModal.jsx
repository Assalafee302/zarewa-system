import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  RotateCcw,
  Hash,
  AlertTriangle,
  DollarSign,
  Save,
  ChevronDown,
  Plus,
  Trash2,
  Link2,
  Printer,
} from 'lucide-react';
import { ModalFrame } from './layout/ModalFrame';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/apiBase';
import { printRefundRecord } from '../lib/refundRecordPrint';
import { refundApprovedAmount, refundOutstandingAmount } from '../lib/refundsStore';
import { formatNgn } from '../Data/mockData';
import { receiptCashReceivedNgn } from '../lib/salesReceiptsList';

const REFUND_REASON_CATEGORIES = [
  'Order cancellation',
  'Overpayment',
  'Transport issue',
  'Installation issue',
  'Accessory shortfall',
  'Calculation error',
  'Substitution Difference',
  'Other',
];

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
 * }} props
 */
const RefundModal = ({
  isOpen,
  onClose,
  mode = 'create',
  record = null,
  onPersist,
  quotations = [],
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
  });
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  /** From refund preview: paid on quote vs overpay split (ledger RECEIPT + OVERPAY_ADVANCE). */
  const [moneyContext, setMoneyContext] = useState(null);

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

    if (mode === 'create') {
      void fetchEligibleQuotes();
    }
  }, [isOpen, record, mode, fetchEligibleQuotes]);
   

  /** Server-eligible quotes plus workspace quotations with payment (fallback if API is empty or offline). */
  const quotationPickList = useMemo(() => {
    const byId = new Map();
    for (const q of eligibleQuotes) {
      const n = normalizeQuoteForRefundSelect(q);
      if (n) byId.set(n.id, n);
    }
    for (const q of quotations) {
      const n = normalizeQuoteForRefundSelect(q);
      if (n && !byId.has(n.id)) byId.set(n.id, n);
    }
    return Array.from(byId.values()).sort((a, b) => b.paid_ngn - a.paid_ngn);
  }, [eligibleQuotes, quotations]);

  const refundMoneyBreakdown = useMemo(() => {
    const ref = form.quotationRef;
    if (!ref) return { booked: 0, overpay: 0, cashIn: 0 };
    const pick = quotationPickList.find((q) => q.id === ref);
    const booked = moneyContext ? moneyContext.paidOnQuoteNgn : pick?.paid_ngn ?? 0;
    const overpay = moneyContext
      ? moneyContext.overpayAdvanceNgn
      : Number(intelligence.summary?.overpayAdvanceNgn) || 0;
    const cashIn = moneyContext ? moneyContext.quotationCashInNgn : booked + overpay;
    return { booked, overpay, cashIn };
  }, [form.quotationRef, quotationPickList, moneyContext, intelligence.summary]);

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
      setPreviewError(data?.error || 'Could not generate refund preview.');
      return;
    }

    const preview = data.preview;
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
      });
    }
  };

  const toggleCategory = (cat) => {
    if (blockedRefundCategories.includes(cat)) return;
    const next = form.reasonCategory.includes(cat)
      ? form.reasonCategory.filter((c) => c !== cat)
      : [...form.reasonCategory, cat];

    setForm((f) => ({ ...f, reasonCategory: next }));
    if (form.quotationRef) {
      generatePreview(form.quotationRef, next);
    }
  };

  const handleQuoteChange = (ref) => {
    setMoneyContext(null);
    setForm(f => ({ ...f, quotationRef: ref, reasonCategory: [] }));
    if (ref) {
      generatePreview(ref, []);
    }
  };
  const readOnly = mode === 'view';
  const showApproval = mode === 'approve' && record?.status === 'Pending';
  const identityLocked = mode !== 'create';

  const recordApprovedAmount = refundApprovedAmount(record) || Number(record?.approved_amount_ngn) || 0;
  const recordOutstandingAmount = refundOutstandingAmount(record);

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
              onClick={onClose}
              className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all duration-200"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <form className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" onSubmit={handleFormSubmit}>
          {/* Info Alert */}
          <div className="flex gap-4 p-4 rounded-xl bg-teal-50 border border-teal-100/50 shadow-sm shadow-teal-100/20">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white shrink-0 mt-0.5">
              <Link2 size={18} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-teal-900">Quotation-Linked Workflow</p>
              <p className="text-xs leading-relaxed text-teal-800/80 font-medium">
                Quotation is the mother of all transactions. Selecting a quotation resolves the customer and loads preview
                hints (overpayment, metres, services, accessories).{' '}
                <span className="font-bold text-teal-900">Suggested amounts are not final</span>—always reconcile with
                receipts, production, and delivery before submitting or approving.
              </p>
            </div>
          </div>

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
            {/* Left Column: Selection & Intelligence */}
            <div className="lg:col-span-7 space-y-6">
              {/* Step 1: Quotation Selection */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-5 bg-rose-500 rounded-full" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Step 1: Link Quotation</h3>
                </div>

                <div className="space-y-4">
                  <div>
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
                        {quotationPickList.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.id} · {q.customer_name} (₦{q.paid_ngn.toLocaleString()} on quote)
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {!loadingQuotes && quotationPickList.length === 0 && mode === 'create' ? (
                      <div className="mt-2 space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                        <p className="text-[10px] text-amber-900 font-medium leading-snug">
                          Refunds only list quotations with <strong>paid total &gt; 0</strong> on file. If you already
                          posted a receipt but the quote is missing here, the payment may have been recorded under a
                          different branch than the quotation — use sync to recalculate from the ledger.
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

                  {form.quotationRef && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                       <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Customer</p>
                        <p className="text-xs font-bold text-slate-900 truncate">{form.customerName || 'Resolve...'}</p>
                        <p className="text-[10px] font-medium text-slate-500">{form.customerID}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">On quotation</p>
                          <p className="text-sm font-black text-teal-600">
                            ₦{refundMoneyBreakdown.booked.toLocaleString()}
                          </p>
                        </div>
                        {refundMoneyBreakdown.overpay > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">To customer advance</p>
                            <p className="text-xs font-bold text-amber-700">
                              ₦{refundMoneyBreakdown.overpay.toLocaleString()}
                            </p>
                          </div>
                        ) : null}
                        {refundMoneyBreakdown.overpay > 0 ? (
                          <p className="text-[9px] font-medium text-slate-500 leading-snug">
                            Cash recorded ₦{refundMoneyBreakdown.cashIn.toLocaleString()} — overage is not on the quote;
                            refund it via customer advance if needed.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Reasons & Logic */}
              <div className={`p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-5 transition-opacity duration-300 ${!form.quotationRef ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-5 bg-rose-500 rounded-full" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Step 2: Refund Categories</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {REFUND_REASON_CATEGORIES.map(cat => {
                    const isSelected = form.reasonCategory.includes(cat);
                    const isAlreadyRefunded = form.alreadyRefundedCategories.includes(cat);
                    const isBlocked = blockedRefundCategories.includes(cat);

                    return (
                      <button
                        key={cat}
                        type="button"
                        disabled={isAlreadyRefunded || readOnly || isBlocked}
                        onClick={() => toggleCategory(cat)}
                        className={`group relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 text-left cursor-pointer
                          ${isSelected 
                            ? 'bg-rose-50 border-rose-200 shadow-sm shadow-rose-100' 
                            : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-slate-50'
                          }
                          ${isAlreadyRefunded || isBlocked ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                        `}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors
                          ${isSelected ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-slate-300 text-transparent'}
                        `}>
                          <Plus size={10} className={isSelected ? 'rotate-45' : ''} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${isSelected ? 'text-rose-900' : 'text-slate-700'}`}>{cat}</p>
                          {isBlocked && (
                            <p className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={10} /> Not available (delivered)
                            </p>
                          )}
                          {isAlreadyRefunded && (
                            <p className="text-[9px] font-bold text-rose-500 uppercase flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={10} /> Already Refunded
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className={label}>Situation Context (Reason Notes)</label>
                  <textarea
                    rows={2}
                    disabled={readOnly}
                    value={form.reasonNotes}
                    onChange={(e) => setForm(f => ({ ...f, reasonNotes: e.target.value }))}
                    placeholder="Provide specific details about the situation..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-rose-500/20 resize-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Execution & Summary */}
            <div className="lg:col-span-5 space-y-6">
              {/* Calculation Breakdown */}
              <div className={`p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col min-h-[380px] transition-opacity duration-300 ${form.reasonCategory.length === 0 ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-5 bg-rose-500 rounded-full" />
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Step 3: Breakdown</h3>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={addLine}
                      className="text-[10px] font-bold uppercase text-rose-600 hover:text-rose-700 underline-offset-4 hover:underline"
                    >
                      + Add Manual Adjustment
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  {form.calculationLines.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-100 rounded-2xl">
                      <DollarSign size={32} className="text-slate-200 mb-2" />
                      <p className="text-xs font-bold text-slate-400">Select categories to see <br/>suggested breakdown</p>
                    </div>
                  ) : (
                    form.calculationLines.map((line, idx) => (
                      <div key={idx} className="group flex gap-3 items-center p-3 rounded-xl bg-slate-50 border border-slate-100 transition-all hover:border-rose-100 hover:bg-white animate-in fade-in">
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            disabled={readOnly}
                            value={line.label}
                            onChange={(e) => setLine(idx, { label: e.target.value })}
                            className="w-full bg-transparent border-none p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                            placeholder="Description..."
                          />
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{line.category || 'Manual Entry'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">₦</span>
                          <input
                            type="number"
                            disabled={readOnly}
                            value={line.amountNgn}
                            onChange={(e) => setLine(idx, { amountNgn: e.target.value })}
                            className="w-24 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-rose-500/10 tabular-nums text-right"
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="p-1 text-slate-300 hover:text-rose-600 rounded-lg transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calculated Total</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums tracking-tighter">
                        ₦{form.calculationLines.reduce((sum, l) => sum + (Number(l.amountNgn) || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, amountNgn: String(f.calculationLines.reduce((sum, l) => sum + (Number(l.amountNgn) || 0), 0)) }))}
                        className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95"
                      >
                        Apply Total
                      </button>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-600 text-white shadow-xl shadow-rose-200">
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Requested Refund Amount</p>
                    <div className="flex items-end gap-1">
                      <span className="text-base font-black text-white/80 mb-0.5">₦</span>
                      <input
                        required
                        type="number"
                        disabled={readOnly || identityLocked}
                        value={form.amountNgn}
                        onChange={(e) => setForm(f => ({ ...f, amountNgn: e.target.value }))}
                        className="flex-1 bg-transparent border-none p-0 text-2xl font-black text-white outline-none focus:ring-0 tabular-nums"
                        placeholder="0"
                      />
                    </div>
                    {sumMismatch ? (
                      <p className="text-xs font-semibold text-amber-200 mt-2">
                        Line items total does not match the requested refund amount.
                      </p>
                    ) : null}
                    {mode !== 'create' && recordOutstandingAmount > 0 ? (
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-wide mt-2">
                        Outstanding after approvals: ₦{recordOutstandingAmount.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Transaction Intelligence Sidebar */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Hash className="text-rose-400" size={18} />
                     <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Transaction Intelligence</h3>
                  </div>
                  {loadingIntelligence && <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />}
                </div>

                {!form.quotationRef ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                     <Link2 size={32} className="text-slate-700 mb-2 opacity-20" />
                     <p className="text-[10px] font-bold text-slate-500 uppercase">Select a quotation to load <br/>audit intelligence</p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-in fade-in duration-500">
                    {/* Financial Health */}
                    <div className="grid grid-cols-2 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800">
                      <div className="bg-slate-900/50 p-3">
                         <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Quote Total</p>
                         <p className="text-sm font-black text-white">₦{(quotationPickList.find(q => q.id === form.quotationRef)?.total_ngn || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-900/50 p-3 border-l border-slate-800">
                         <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">On quotation</p>
                         <p className="text-sm font-black text-emerald-400">₦{refundMoneyBreakdown.booked.toLocaleString()}</p>
                      </div>
                    </div>
                    {refundMoneyBreakdown.overpay > 0 ? (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 space-y-1">
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Customer advance (overage)</p>
                        <p className="text-sm font-black text-amber-300">₦{refundMoneyBreakdown.overpay.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500">Total cash recorded ₦{refundMoneyBreakdown.cashIn.toLocaleString()}</p>
                      </div>
                    ) : null}

                    {/* Receipt History */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment History</p>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                        {intelligence.receipts.length === 0 ? (
                          <p className="text-[10px] text-slate-600 italic">No receipts recorded yet.</p>
                        ) : (
                          intelligence.receipts.map((r, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-800/40 text-[10px]">
                              <span className="text-slate-400 font-mono">{r.id}</span>
                              <span className="font-bold text-emerald-500">{formatNgn(receiptCashReceivedNgn(r))}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Production Status */}
                    <div className="space-y-2">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Production & Delivery</p>
                       <div className="grid grid-cols-2 gap-2">
                          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                             <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Cutting Lists</p>
                             <p className="text-xs font-black">{intelligence.cuttingLists.length}</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                             <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Produced Metres</p>
                             <p className="text-xs font-black text-sky-400">{intelligence.summary?.producedMeters?.toLocaleString() || 0} m</p>
                          </div>
                       </div>
                    </div>

                    {(intelligence.summary?.accessoriesSummary?.lines || []).length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Accessories (ordered vs supplied)
                        </p>
                        <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                          {intelligence.summary.accessoriesSummary.lines.map((line, idx) => (
                            <div
                              key={`${line.quoteLineId || idx}`}
                              className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/40 p-2 text-[9px]"
                            >
                              <span className="truncate text-slate-300" title={line.name}>
                                {line.name}
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-slate-200">
                                {Number(line.supplied).toLocaleString()}/{Number(line.ordered).toLocaleString()}
                                {Number(line.shortfall) > 0 ? (
                                  <span className="ml-1 font-bold text-rose-400">
                                    (−{Number(line.shortfall).toLocaleString()})
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Warnings */}
                    {warnings.length > 0 && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                        <p className="text-[9px] font-bold text-rose-400 uppercase flex items-center gap-1.5">
                          <AlertTriangle size={12} /> System Audit Flags
                        </p>
                        <ul className="space-y-1">
                          {warnings.map((w, idx) => (
                            <li key={idx} className="text-[10px] text-white/80 leading-snug">• {w}</li>
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
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-400 uppercase text-[9px]">Requested By</p>
                      <p className="font-bold text-slate-900">{record?.requestedBy || 'System'}</p>
                    </div>
                    <div className="space-y-1 text-right">
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
                        <div className="grid grid-cols-2 gap-2">
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
        <div className="px-6 py-5 border-t border-slate-200/60 bg-white rounded-b-2xl flex justify-between items-center shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">
            Zarewa System · Financial Reality Engine v3.0
          </p>
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
