import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { formatNgn } from '../Data/mockData';
import { ModalFrame } from './layout/ModalFrame';
import { useCustomers } from '../context/CustomersContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';
import { refundApprovedAmount, refundOutstandingAmount } from '../lib/refundsStore';

const REFUND_REASON_CATEGORIES = [
  'Order cancellation',
  'Overpayment',
  'Short supply (quoted vs cutting list)',
  'Commission',
  'Transport to site',
  'Installation fee',
  'Other',
];

const emptyLine = () => ({ label: '', amountNgn: '' });

const emptyRequest = {
  customerID: '',
  quotationRef: '',
  cuttingListRef: '',
  product: '',
  reasonCategory: '',
  reasonNotes: '',
  amountNgn: '',
  calculationLines: [emptyLine()],
  calculationNotes: '',
  suggestedLines: [],
  previewQuotedMeters: '',
  previewActualMeters: '',
  previewPricePerMeterNgn: '',
  previewTransportRefundNgn: '',
  previewInstallationRefundNgn: '',
  previewSubstitutionMeters: '',
  previewSubstitutionDiffPerMeterNgn: '',
  previewManualAdjustmentNgn: '',
};

function stripCategoryPrefix(full, cat) {
  if (!cat) return full ?? '';
  const prefix = `${cat} — `;
  const r = full ?? '';
  return r.startsWith(prefix) ? r.slice(prefix.length) : r;
}

const initFormFromRecord = (record) => {
  if (!record) return { ...emptyRequest, calculationLines: [emptyLine()] };
  const cat = record.reasonCategory ?? '';
  const categoryOk = REFUND_REASON_CATEGORIES.includes(cat);
  const lines =
    Array.isArray(record.calculationLines) && record.calculationLines.length > 0
      ? record.calculationLines.map((l) => ({
          label: l.label ?? '',
          amountNgn: l.amountNgn != null ? String(l.amountNgn) : '',
        }))
      : [emptyLine()];
  return {
    customerID: record.customerID ?? '',
    quotationRef: record.quotationRef ?? '',
    cuttingListRef: record.cuttingListRef ?? '',
    product: record.product ?? '',
    reasonCategory: categoryOk ? cat : cat ? 'Other' : '',
    reasonNotes: categoryOk ? stripCategoryPrefix(record.reason, cat) : (record.reason ?? ''),
    amountNgn: record.amountNgn != null ? String(record.amountNgn) : '',
    calculationLines: lines,
    calculationNotes: record.calculationNotes ?? '',
    suggestedLines: Array.isArray(record.suggestedLines) ? record.suggestedLines : [],
    previewQuotedMeters: record.previewQuotedMeters != null ? String(record.previewQuotedMeters) : '',
    previewActualMeters: record.previewActualMeters != null ? String(record.previewActualMeters) : '',
    previewPricePerMeterNgn:
      record.previewPricePerMeterNgn != null ? String(record.previewPricePerMeterNgn) : '',
    previewTransportRefundNgn:
      record.previewTransportRefundNgn != null ? String(record.previewTransportRefundNgn) : '',
    previewInstallationRefundNgn:
      record.previewInstallationRefundNgn != null ? String(record.previewInstallationRefundNgn) : '',
    previewSubstitutionMeters:
      record.previewSubstitutionMeters != null ? String(record.previewSubstitutionMeters) : '',
    previewSubstitutionDiffPerMeterNgn:
      record.previewSubstitutionDiffPerMeterNgn != null
        ? String(record.previewSubstitutionDiffPerMeterNgn)
        : '',
    previewManualAdjustmentNgn:
      record.previewManualAdjustmentNgn != null ? String(record.previewManualAdjustmentNgn) : '',
  };
};

function sumLines(lines) {
  return lines.reduce((s, l) => {
    const n = Number(l.amountNgn);
    return s + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

function buildReasonText(category, notes) {
  const n = notes.trim();
  if (category && n) return `${category} — ${n}`;
  return category.trim() || n || '—';
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
  requesterLabel = '—',
  approverLabel = '—',
  quotations = [],
  receipts = [],
  cuttingLists = [],
  availableStock = [],
}) => {
  const { customers } = useCustomers();
  const ws = useWorkspace();
  const [form, setForm] = useState(() => initFormFromRecord(record));
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

  /* eslint-disable react-hooks/set-state-in-effect */
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
  }, [isOpen, record, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const productOptions = useMemo(
    () => [
      ...availableStock.map((s) => `${s.material} ${s.gauge} ${s.color} (${s.id})`),
      'Longspan roofing 0.45mm HM Blue',
      'Accessory pack (screws, silicone)',
    ],
    [availableStock]
  );

  const readOnly = mode === 'view';
  const showApproval = mode === 'approve' && record?.status === 'Pending';
  const identityLocked = mode !== 'create';
  const linesLocked = mode === 'view';

  const effectiveCustomerId = form.customerID || record?.customerID || '';
  const effectiveQuoteRef = form.quotationRef || record?.quotationRef || '';
  const quoteOptions = useMemo(
    () =>
      quotations
        .filter((q) => !effectiveCustomerId || q.customerID === effectiveCustomerId)
        .map((q) => q.id),
    [effectiveCustomerId, quotations]
  );

  const cuttingListOptions = useMemo(() => {
    if (!effectiveCustomerId) return [];
    return cuttingLists.filter((c) => c.customerID === effectiveCustomerId);
  }, [cuttingLists, effectiveCustomerId]);

  const transactionContext = useMemo(() => {
    const cid = effectiveCustomerId;
    const qref = effectiveQuoteRef;
    const quote = qref
      ? quotations.find((q) => q.id === qref)
      : cid
        ? quotations.filter((q) => q.customerID === cid).sort((a, b) =>
            (b.dateISO || '').localeCompare(a.dateISO || '')
          )[0]
        : null;
    const quoteReceipts = quote ? receipts.filter((r) => r.quotationRef === quote.id) : [];
    const lists = cid
      ? cuttingLists.filter((cl) => cl.customerID === cid)
      : [];
    const linkedCl =
      (form.cuttingListRef || record?.cuttingListRef)
        ? lists.find((x) => x.id === (form.cuttingListRef || record?.cuttingListRef))
        : null;
    const paidOnQuote = quote ? quote.paidNgn ?? 0 : 0;
    const totalQuote = quote ? quote.totalNgn ?? 0 : 0;
    const balance = quote ? Math.max(0, totalQuote - paidOnQuote) : null;
    return { quote, quoteReceipts, lists, linkedCl, paidOnQuote, totalQuote, balance };
  }, [cuttingLists, effectiveCustomerId, effectiveQuoteRef, form.cuttingListRef, quotations, receipts, record?.cuttingListRef]);
  const recordApprovedAmount = refundApprovedAmount(record);
  const recordOutstandingAmount = refundOutstandingAmount(record);
  const canAutoPreview = mode === 'create' && ws?.canMutate && Boolean(form.customerID);

  const label = 'text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block';
  const input =
    'w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-red-500/15 disabled:opacity-60';
  const previewInput =
    'w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10';

  const setPreviewField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

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

  const applySumToAmount = () => {
    const t = sumLines(form.calculationLines);
    if (t <= 0) return;
    setForm((f) => ({ ...f, amountNgn: String(t) }));
  };

  const generatePreview = async () => {
    if (!canAutoPreview) return;
    setPreviewLoading(true);
    setPreviewError('');
    const { ok, data } = await apiFetch('/api/refunds/preview', {
      method: 'POST',
      body: JSON.stringify({
        customerID: form.customerID,
        quotationRef: form.quotationRef,
        cuttingListRef: form.cuttingListRef,
        product: form.product,
        quotedMeters: form.previewQuotedMeters,
        actualMeters: form.previewActualMeters,
        pricePerMeterNgn: form.previewPricePerMeterNgn,
        transportRefundNgn: form.previewTransportRefundNgn,
        installationRefundNgn: form.previewInstallationRefundNgn,
        substitutionMeters: form.previewSubstitutionMeters,
        substitutionDiffPerMeterNgn: form.previewSubstitutionDiffPerMeterNgn,
        manualAdjustmentNgn: form.previewManualAdjustmentNgn,
      }),
    });
    setPreviewLoading(false);
    if (!ok || !data?.ok || !data?.preview) {
      setPreviewError(data?.error || 'Could not generate refund preview.');
      return;
    }
    const preview = data.preview;
    const nextLines =
      Array.isArray(preview.suggestedLines) && preview.suggestedLines.length > 0
        ? preview.suggestedLines.map((line) => ({
            label: line.label ?? '',
            amountNgn: line.amountNgn != null ? String(line.amountNgn) : '',
          }))
        : [emptyLine()];
    setForm((f) => ({
      ...f,
      amountNgn: preview.suggestedAmountNgn > 0 ? String(preview.suggestedAmountNgn) : f.amountNgn,
      calculationLines: nextLines,
      suggestedLines: Array.isArray(preview.suggestedLines) ? preview.suggestedLines : [],
      previewQuotedMeters:
        preview.quotedMeters != null && preview.quotedMeters !== '' ? String(preview.quotedMeters) : f.previewQuotedMeters,
      previewActualMeters:
        preview.actualMeters != null && preview.actualMeters !== '' ? String(preview.actualMeters) : f.previewActualMeters,
      previewPricePerMeterNgn:
        preview.pricePerMeterNgn != null && preview.pricePerMeterNgn !== ''
          ? String(preview.pricePerMeterNgn)
          : f.previewPricePerMeterNgn,
    }));
  };

  const submitRequest = async () => {
    if (!form.customerID.trim() || !form.amountNgn) return;
    const amountNgn = Number(form.amountNgn);
    if (Number.isNaN(amountNgn) || amountNgn <= 0) return;
    if (!form.reasonCategory.trim()) return;
    const cust = customers.find((c) => c.customerID === form.customerID);
    const calculationLines = form.calculationLines
      .map((l) => ({
        label: l.label.trim(),
        amountNgn: Number(l.amountNgn),
      }))
      .filter((l) => l.label && !Number.isNaN(l.amountNgn) && l.amountNgn > 0);
    const reason = buildReasonText(form.reasonCategory, form.reasonNotes);
    const suggestedLines = Array.isArray(form.suggestedLines) ? form.suggestedLines : [];
    setPreviewError('');
    setSaving(true);
    const result = await onPersist?.({
      refundID: record?.refundID ?? `RF-2026-${String(Date.now()).slice(-4)}`,
      customerID: form.customerID,
      customer: cust?.name ?? '',
      quotationRef: form.quotationRef.trim(),
      cuttingListRef: form.cuttingListRef.trim(),
      product: form.product.trim() || '—',
      reasonCategory: form.reasonCategory.trim(),
      reason,
      amountNgn,
      calculationLines,
      suggestedLines,
      calculationNotes: form.calculationNotes.trim(),
      previewQuotedMeters: form.previewQuotedMeters.trim(),
      previewActualMeters: form.previewActualMeters.trim(),
      previewPricePerMeterNgn: form.previewPricePerMeterNgn.trim(),
      previewTransportRefundNgn: form.previewTransportRefundNgn.trim(),
      previewInstallationRefundNgn: form.previewInstallationRefundNgn.trim(),
      previewSubstitutionMeters: form.previewSubstitutionMeters.trim(),
      previewSubstitutionDiffPerMeterNgn: form.previewSubstitutionDiffPerMeterNgn.trim(),
      previewManualAdjustmentNgn: form.previewManualAdjustmentNgn.trim(),
      status: 'Pending',
      approvalDate: '',
      managerComments: '',
      requestedBy: requesterLabel,
      requestedAtISO: new Date().toISOString(),
      approvedBy: '',
      paidAtISO: '',
      paidBy: '',
    });
    setSaving(false);
    if (result?.ok !== false) onClose();
  };

  const submitApproval = async () => {
    if (!record?.refundID) return;
    const nextApprovedBy = approvalStatus === 'Approved' ? approverLabel : '';
    const nextApprovedAmountNgn =
      approvalStatus === 'Approved'
        ? Number(approvedAmountNgn) || refundApprovedAmount(record) || Number(record?.amountNgn) || 0
        : 0;
    if (approvalStatus === 'Approved' && nextApprovedAmountNgn <= 0) {
      setPreviewError('Approved amount must be positive.');
      return;
    }
    setPreviewError('');
    setSaving(true);
    const editedCalcLines = form.calculationLines
      .map((l) => ({
        label: l.label.trim(),
        amountNgn: Number(l.amountNgn),
      }))
      .filter((l) => l.label && !Number.isNaN(l.amountNgn) && l.amountNgn > 0);
    const result = await onPersist?.({
      ...record,
      status: approvalStatus,
      approvalDate: approvalDate.trim() || new Date().toISOString().slice(0, 10),
      managerComments: managerComments.trim(),
      approvedBy: nextApprovedBy,
      approvedAmountNgn: nextApprovedAmountNgn,
      calculationLines: editedCalcLines.length ? editedCalcLines : record?.calculationLines,
      calculationNotes: form.calculationNotes.trim(),
      suggestedLines: Array.isArray(form.suggestedLines) ? form.suggestedLines : record?.suggestedLines,
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

  const lineSum = sumLines(form.calculationLines);
  const sumMismatch =
    mode === 'create' &&
    lineSum > 0 &&
    Number(form.amountNgn) > 0 &&
    Math.round(lineSum) !== Math.round(Number(form.amountNgn));

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <div className="z-modal-panel max-w-[min(100%,48rem)] w-full max-h-[min(92vh,880px)] flex flex-col mx-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
              <RotateCcw size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h2 className="text-base font-bold text-[#134e4a] tracking-tight">
                  {mode === 'approve'
                    ? 'Refund approval'
                    : mode === 'view'
                      ? 'Refund record'
                      : 'Refund request'}
                </h2>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${modeBadge}`}
                >
                  {modeLabel}
                </span>
              </div>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest truncate mt-0.5">
                {record?.refundID
                  ? `${record.refundID} · ${record.status}`
                  : 'Submit for manager approval — Finance pays after approval'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-5 min-h-0"
          onSubmit={handleFormSubmit}
        >
          <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
            Refunds need a manager decision before any payment. Suggested amounts from the calculator are a guide
            only. Finance can pay in one go or in stages, and split a payout across more than one bank or cash
            account when recording treasury.
          </div>
          {(mode === 'approve' ||
            (mode === 'view' && record) ||
            (mode === 'create' && effectiveCustomerId)) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
              <p className="text-[9px] font-semibold text-[#134e4a] uppercase tracking-widest flex items-center gap-1.5">
                <Link2 size={14} className="text-slate-400" />
                {mode === 'create' ? 'Live preview (quotation & receipts)' : 'Transaction context (for review)'}
              </p>
              {!transactionContext.quote ? (
                <p className="text-xs text-slate-500">Select a customer and quotation to see linked totals.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-white bg-white/80 p-3 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Quotation</p>
                    <p className="font-mono font-bold text-[#134e4a] mt-1">{transactionContext.quote.id}</p>
                    <p className="text-slate-700 mt-0.5">{transactionContext.quote.customer}</p>
                    <p className="mt-2 tabular-nums">
                      Total <span className="font-bold">{transactionContext.quote.total}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      Paid on file{' '}
                      <span className="font-bold">{formatNgn(transactionContext.paidOnQuote)}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Balance{' '}
                      <span className="font-semibold text-[#134e4a]">
                        {formatNgn(transactionContext.balance ?? 0)}
                      </span>
                    </p>
                    {transactionContext.quote.handledBy ? (
                      <p className="text-[10px] text-slate-500 mt-2">
                        Quote owner: <span className="font-semibold">{transactionContext.quote.handledBy}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-white bg-white/80 p-3 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Receipts on this quote</p>
                    {transactionContext.quoteReceipts.length === 0 ? (
                      <p className="text-slate-500 mt-2">No receipts linked.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {transactionContext.quoteReceipts.map((r) => (
                          <li key={r.id} className="flex justify-between gap-2 tabular-nums">
                            <span className="font-mono text-[#134e4a]">{r.id}</span>
                            <span className="font-bold">{r.amount}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="sm:col-span-2 rounded-lg border border-white bg-white/80 p-3 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Cutting lists (customer)</p>
                    {transactionContext.lists.length === 0 ? (
                      <p className="text-slate-500 mt-2">None on file.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {transactionContext.lists.map((cl) => (
                          <li
                            key={cl.id}
                            className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px]"
                          >
                            <span className="font-mono font-semibold text-[#134e4a]">{cl.id}</span>
                            <span>
                              {cl.total} · {cl.status}
                            </span>
                            {cl.handledBy ? (
                              <span className="text-slate-500 w-full sm:w-auto">
                                By {cl.handledBy}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200/90 p-4 bg-slate-50/50">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Request</p>
                <div className="space-y-3">
                  <div>
                    <label className={label}>Customer</label>
                    <div className="relative">
                      <select
                        required={mode === 'create'}
                        disabled={identityLocked}
                        value={form.customerID}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customerID: e.target.value,
                            quotationRef: '',
                            cuttingListRef: '',
                          }))
                        }
                        className={`${input} appearance-none pr-8`}
                      >
                        <option value="">Select…</option>
                        {customers.map((c) => (
                          <option key={c.customerID} value={c.customerID}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={label}>Quotation / order</label>
                    <div className="relative">
                      <select
                        disabled={identityLocked}
                        value={form.quotationRef}
                        onChange={(e) => setForm((f) => ({ ...f, quotationRef: e.target.value }))}
                        className={`${input} appearance-none pr-8`}
                      >
                        <option value="">Optional…</option>
                        {quoteOptions.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                      <Hash size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className={label}>Cutting list (if applicable)</label>
                    <div className="relative">
                      <select
                        disabled={identityLocked || cuttingListOptions.length === 0}
                        value={form.cuttingListRef}
                        onChange={(e) => setForm((f) => ({ ...f, cuttingListRef: e.target.value }))}
                        className={`${input} appearance-none pr-8`}
                      >
                        <option value="">None / N/A</option>
                        {cuttingListOptions.map((cl) => (
                          <option key={cl.id} value={cl.id}>
                            {cl.id} · {cl.total}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={label}>Product / line</label>
                    <div className="relative">
                      <select
                        disabled={identityLocked}
                        value={form.product}
                        onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                        className={`${input} appearance-none pr-8`}
                      >
                        <option value="">Select…</option>
                        {productOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={label}>Reason category</label>
                    <select
                      disabled={identityLocked}
                      required={mode === 'create'}
                      value={form.reasonCategory}
                      onChange={(e) => setForm((f) => ({ ...f, reasonCategory: e.target.value }))}
                      className={input}
                    >
                      <option value="">Choose…</option>
                      {REFUND_REASON_CATEGORIES.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                    {!identityLocked ? (
                      <textarea
                        rows={2}
                        value={form.reasonNotes}
                        onChange={(e) => setForm((f) => ({ ...f, reasonNotes: e.target.value }))}
                        placeholder="Explain the situation (visible on the record)…"
                        className="mt-2 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none resize-none"
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              {mode === 'create' ? (
                <div className="rounded-xl border border-slate-200/90 p-4 bg-slate-50/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                        Suggested calculation
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Use live preview for overpayment, short supply, transport, installation, and substitution differences.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canAutoPreview || previewLoading}
                      onClick={generatePreview}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#134e4a]/15 bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-[#134e4a] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <DollarSign size={12} />
                      {previewLoading ? 'Calculating…' : 'Generate lines'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Quoted metres</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.previewQuotedMeters}
                        onChange={(e) => setPreviewField('previewQuotedMeters', e.target.value)}
                        className={previewInput}
                        placeholder="Optional override"
                      />
                    </div>
                    <div>
                      <label className={label}>Actual metres</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.previewActualMeters}
                        onChange={(e) => setPreviewField('previewActualMeters', e.target.value)}
                        className={previewInput}
                        placeholder="Actual supplied / produced"
                      />
                    </div>
                    <div>
                      <label className={label}>Rate per metre</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.previewPricePerMeterNgn}
                        onChange={(e) => setPreviewField('previewPricePerMeterNgn', e.target.value)}
                        className={previewInput}
                        placeholder="Optional override"
                      />
                    </div>
                    <div>
                      <label className={label}>Transport refund</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.previewTransportRefundNgn}
                        onChange={(e) => setPreviewField('previewTransportRefundNgn', e.target.value)}
                        className={previewInput}
                        placeholder="₦"
                      />
                    </div>
                    <div>
                      <label className={label}>Installation refund</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.previewInstallationRefundNgn}
                        onChange={(e) => setPreviewField('previewInstallationRefundNgn', e.target.value)}
                        className={previewInput}
                        placeholder="₦"
                      />
                    </div>
                    <div>
                      <label className={label}>Manual adjustment</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.previewManualAdjustmentNgn}
                        onChange={(e) => setPreviewField('previewManualAdjustmentNgn', e.target.value)}
                        className={previewInput}
                        placeholder="₦"
                      />
                    </div>
                    <div>
                      <label className={label}>Substitution metres</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.previewSubstitutionMeters}
                        onChange={(e) => setPreviewField('previewSubstitutionMeters', e.target.value)}
                        className={previewInput}
                        placeholder="m"
                      />
                    </div>
                    <div>
                      <label className={label}>Substitution diff / metre</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.previewSubstitutionDiffPerMeterNgn}
                        onChange={(e) => setPreviewField('previewSubstitutionDiffPerMeterNgn', e.target.value)}
                        className={previewInput}
                        placeholder="₦ / m"
                      />
                    </div>
                  </div>
                  {!ws?.canMutate ? (
                    <p className="text-[10px] text-amber-700">
                      Start the API server to generate suggested lines from live quotation and receipt data.
                    </p>
                  ) : null}
                  {previewError ? (
                    <p className="text-[10px] text-rose-700 font-semibold">{previewError}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200/90 p-4 bg-white">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                    Refund working (breakdown)
                  </p>
                  {!linesLocked ? (
                    <button
                      type="button"
                      onClick={addLine}
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase text-[#134e4a] hover:underline"
                    >
                      <Plus size={12} /> Line
                    </button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {form.calculationLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <input
                        type="text"
                        disabled={linesLocked}
                        value={line.label}
                        onChange={(e) => setLine(idx, { label: e.target.value })}
                        placeholder="Description"
                        className={`${input} flex-1 min-w-0`}
                      />
                      <input
                        type="number"
                        disabled={linesLocked}
                        min="0"
                        step="1000"
                        value={line.amountNgn}
                        onChange={(e) => setLine(idx, { amountNgn: e.target.value })}
                        placeholder="₦"
                        className={`${input} w-28 tabular-nums shrink-0`}
                      />
                      {!linesLocked ? (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 shrink-0"
                          aria-label="Remove line"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="w-9 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-600 tabular-nums">
                    Lines total: {formatNgn(lineSum)}
                  </p>
                  {!linesLocked ? (
                    <button
                      type="button"
                      onClick={applySumToAmount}
                      className="text-[9px] font-bold uppercase text-[#134e4a] hover:underline"
                    >
                      Copy sum → refund amount
                    </button>
                  ) : null}
                </div>
                {sumMismatch ? (
                  <p className="text-[10px] text-amber-700 font-semibold mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Line total and refund amount differ — align them or explain in notes.
                  </p>
                ) : null}
                <div className="mt-3">
                  <label className={label}>Calculation notes</label>
                  <textarea
                    rows={2}
                    disabled={linesLocked}
                    value={form.calculationNotes}
                    onChange={(e) => setForm((f) => ({ ...f, calculationNotes: e.target.value }))}
                    placeholder="Metres, rates, PO references…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none resize-none disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-red-200/80 bg-gradient-to-br from-[#134e4a] to-[#0f3d39] p-4 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[9px] font-semibold text-white/50 uppercase tracking-widest mb-2">
                    Refund amount
                  </p>
                  <div className="flex items-center gap-1 text-white">
                    <span className="text-sm font-bold">₦</span>
                    <input
                      required={mode === 'create'}
                      disabled={identityLocked}
                      type="number"
                      min="1"
                      step="1000"
                      value={form.amountNgn}
                      onChange={(e) => setForm((f) => ({ ...f, amountNgn: e.target.value }))}
                      className="bg-transparent border-b border-white/30 flex-1 text-xl font-bold outline-none disabled:opacity-60 tabular-nums min-w-0"
                      placeholder="0"
                    />
                  </div>
                  {record?.status && mode !== 'create' ? (
                    <div className="mt-3 space-y-1 text-[10px] font-medium text-white/70 tabular-nums">
                      <p>Requested: {formatNgn(Number(record.amountNgn) || 0)}</p>
                      <p>Approved: {formatNgn(recordApprovedAmount)}</p>
                      <p>Paid to date: {formatNgn(Number(record?.paidAmountNgn) || 0)}</p>
                      <p>Balance: {formatNgn(recordOutstandingAmount)}</p>
                    </div>
                  ) : null}
                </div>
                <DollarSign size={80} className="absolute -bottom-4 -right-2 text-white/10 rotate-12" />
              </div>

              {mode === 'create' ? (
                <div className="flex items-center gap-2 text-amber-700 text-[9px] font-semibold uppercase tracking-wide">
                  <AlertTriangle size={14} className="shrink-0" />
                  No printout — request goes to manager, then Finance pays
                </div>
              ) : null}

              {previewError && mode !== 'create' ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-semibold text-rose-700">
                  {previewError}
                </div>
              ) : null}

              {record && (mode === 'view' || mode === 'approve') ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Audit trail</p>
                  <p>
                    <span className="text-slate-400">Requested by</span>{' '}
                    <span className="font-semibold text-slate-800">{record.requestedBy || '—'}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {record.requestedAtISO
                      ? new Date(record.requestedAtISO).toLocaleString()
                      : '—'}
                  </p>
                  {record.approvedBy ? (
                    <>
                      <p>
                        <span className="text-slate-400">Approved by</span>{' '}
                        <span className="font-semibold text-slate-800">{record.approvedBy}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {record.approvalDate || '—'}
                      </p>
                    </>
                  ) : null}
                  {record.paidBy ? (
                    <>
                      <p>
                        <span className="text-slate-400">Paid by (Finance)</span>{' '}
                        <span className="font-semibold text-slate-800">{record.paidBy || '—'}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {record.paidAtISO ? new Date(record.paidAtISO).toLocaleString() : '—'}
                      </p>
                    </>
                  ) : null}
                  {record.paymentNote ? (
                    <p className="text-[10px] text-slate-500">{record.paymentNote}</p>
                  ) : null}
                  {Array.isArray(record.payoutHistory) && record.payoutHistory.length > 0 ? (
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                        Payout history
                      </p>
                      <ul className="space-y-1.5">
                        {record.payoutHistory.map((line) => (
                          <li key={line.id || `${line.postedAtISO}-${line.reference}`} className="flex justify-between gap-3 text-[10px]">
                            <span className="text-slate-600">
                              {line.accountName || 'Treasury'}{line.reference ? ` · ${line.reference}` : ''}
                            </span>
                            <span className="font-semibold text-[#134e4a] tabular-nums">
                              {formatNgn(line.amountNgn)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {(showApproval || (mode === 'view' && record)) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                  <p className="text-[9px] font-semibold text-[#134e4a] uppercase tracking-widest">
                    {showApproval ? 'Decision' : 'Approval details'}
                  </p>
                  <div>
                    <label className={label}>Status</label>
                    <select
                      disabled={!showApproval}
                      value={showApproval ? approvalStatus : record?.status || approvalStatus}
                      onChange={(e) => setApprovalStatus(e.target.value)}
                      className={input}
                    >
                      {showApproval ? (
                        <>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                        </>
                      ) : (
                        <option value={record?.status || 'Pending'}>{record?.status || 'Pending'}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Approval date</label>
                    <input
                      type="date"
                      disabled={!showApproval}
                      value={approvalDate}
                      onChange={(e) => setApprovalDate(e.target.value)}
                      className={input}
                    />
                  </div>
                  <div>
                    <label className={label}>Approved amount</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      disabled={!showApproval || approvalStatus !== 'Approved'}
                      value={
                        showApproval || record?.status === 'Approved' || record?.status === 'Paid'
                          ? approvedAmountNgn
                          : ''
                      }
                      onChange={(e) => setApprovedAmountNgn(e.target.value)}
                      className={input}
                    />
                    {record && !showApproval ? (
                      <p className="mt-1 text-[10px] text-slate-500 tabular-nums">
                        Paid {formatNgn(Number(record.paidAmountNgn) || 0)} · Balance {formatNgn(recordOutstandingAmount)}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={label}>Manager comments</label>
                    <textarea
                      rows={2}
                      disabled={!showApproval}
                      value={managerComments}
                      onChange={(e) => setManagerComments(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none resize-none disabled:opacity-60"
                      placeholder="Notes…"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 mt-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm hover:brightness-105 flex items-center gap-2 disabled:cursor-wait disabled:opacity-70"
              >
                <Save size={14} />
                {saving ? 'Saving…' : showApproval ? 'Save decision' : 'Submit request'}
              </button>
            )}
          </div>
        </form>
      </div>
    </ModalFrame>
  );
};

export default RefundModal;
