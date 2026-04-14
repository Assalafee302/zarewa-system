import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Factory,
  Flag,
  Paperclip,
  Printer,
  RefreshCw,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { apiFetch, apiUrl } from '../../lib/apiBase';
import { formatNgn } from '../../Data/mockData';
import { receiptCashReceivedNgn } from '../../lib/salesReceiptsList';
import { ManagementAuditSections } from '../management/ManagementAuditSections';
import { quotationRefFromWorkItemForIntel } from '../../lib/transactionIntelFromWorkItem';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { printExpenseRequestRecord } from '../../lib/expenseRequestPrint';
import { formatRefundReasonCategory } from '../../lib/managerDashboardCore';
import { EditSecondApprovalInline } from '../EditSecondApprovalInline';

function humanizeDocType(documentType) {
  return String(documentType || 'Work item')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Light shell to match workspace / Office slide-overs (teal + slate). */
function intelShellClass(variant) {
  const standalone = variant === 'standalone';
  if (standalone) {
    return 'flex h-full min-h-0 w-full flex-1 flex-col bg-slate-50';
  }
  return 'flex max-h-[50vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[min(440px,40vw)] lg:border-l lg:border-t-0';
}

/** Mirrors {@link decidePaymentRequest} pending states. */
function isPaymentApprovalPending(status) {
  return ['Pending', 'Submitted', 'Awaiting approval', ''].includes(String(status ?? 'Pending').trim());
}

function parseMaybeJsonArray(raw) {
  if (raw == null || raw === '') return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Inbox-style meta row (label reads like an email “Details” field). */
function emailMetaRow(label, value) {
  const v = value != null && String(value).trim() !== '' ? String(value) : '—';
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100/90 py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="shrink-0 text-[12px] font-medium leading-tight text-slate-500 sm:w-[9rem]">{label}</div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-snug text-slate-900">{v}</div>
    </div>
  );
}

function EmailCard({ children, className = '' }) {
  return (
    <article
      className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.07)] ${className}`}
    >
      {children}
    </article>
  );
}

function EmailSectionTitle({ children }) {
  return (
    <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{children}</h3>
  );
}

function statusPillClass(statusText) {
  const s = String(statusText || '').toLowerCase();
  if (s.includes('approv') && !s.includes('reject')) {
    return 'border-emerald-200/90 bg-emerald-50 text-emerald-900';
  }
  if (s.includes('reject') || s.includes('flag')) {
    return 'border-rose-200/90 bg-rose-50 text-rose-900';
  }
  if (s.includes('pending') || s.includes('await') || s.includes('submitted') || s === '') {
    return 'border-amber-200/90 bg-amber-50 text-amber-950';
  }
  return 'border-slate-200/90 bg-slate-50 text-slate-700';
}

function hasNonEmpty(s) {
  return Boolean(String(s ?? '').trim());
}

function paymentHasHistory(pd) {
  if (!pd) return false;
  return (
    hasNonEmpty(pd.approvedBy) ||
    hasNonEmpty(pd.approvedAtISO) ||
    hasNonEmpty(pd.approvalNote) ||
    (Number(pd.paidAmountNgn) || 0) > 0 ||
    hasNonEmpty(pd.paidAtISO) ||
    hasNonEmpty(pd.paidBy) ||
    hasNonEmpty(pd.paymentNote)
  );
}

function refundHasSecondary(rd) {
  if (!rd) return false;
  return (
    hasNonEmpty(rd.approval_date) ||
    hasNonEmpty(rd.approved_by) ||
    (Number(rd.approved_amount_ngn) || 0) > 0 ||
    hasNonEmpty(rd.manager_comments) ||
    hasNonEmpty(rd.calculation_notes) ||
    (Number(rd.paid_amount_ngn) || 0) > 0 ||
    hasNonEmpty(rd.paid_at_iso) ||
    hasNonEmpty(rd.paid_by) ||
    hasNonEmpty(rd.payment_note) ||
    parseMaybeJsonArray(rd.calculation_lines_json).length > 0 ||
    parseMaybeJsonArray(rd.suggested_lines_json).length > 0
  );
}

/** Secondary blocks stay collapsed so the panel reads top-to-bottom like a short email. */
function IntelCollapsible({ title, defaultOpen = false, children }) {
  return (
    <details className="group border-t border-slate-100/90 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50/90 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400 transition-transform duration-200 group-open:-rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-slate-50 px-5 pb-4 pt-0">{children}</div>
    </details>
  );
}

export function ThreadDrawerTransactionIntel({ workItem, variant = 'aside', onManagementDecisionSuccess }) {
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const [auditData, setAuditData] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [refundIntelExtras, setRefundIntelExtras] = useState(null);
  const [loadingRefundIntel, setLoadingRefundIntel] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const [paymentDetail, setPaymentDetail] = useState(null);
  const [paymentDetailLoading, setPaymentDetailLoading] = useState(false);
  const [paymentDetailError, setPaymentDetailError] = useState(null);

  const [refundDetail, setRefundDetail] = useState(null);
  const [refundDetailLoading, setRefundDetailLoading] = useState(false);
  const [refundDetailError, setRefundDetailError] = useState(null);

  const [conversionSignoffRemark, setConversionSignoffRemark] = useState('');
  const [conversionSignoffEditApprovalId, setConversionSignoffEditApprovalId] = useState('');

  const dt = String(workItem?.documentType || '').trim().toLowerCase();
  const qref = quotationRefFromWorkItemForIntel(workItem);
  const standalone = variant === 'standalone';

  const sourceId = useMemo(
    () => String(workItem?.sourceId || workItem?.referenceNo || '').trim(),
    [workItem?.sourceId, workItem?.referenceNo]
  );

  const conversionJob = useMemo(() => {
    if (dt !== 'conversion_review' || !sourceId) return null;
    const jobs = Array.isArray(ws?.snapshot?.productionJobs) ? ws.snapshot.productionJobs : [];
    return jobs.find((j) => String(j.jobID || j.job_id || '').trim() === sourceId) || null;
  }, [dt, sourceId, ws?.snapshot?.productionJobs]);

  const showQuotationClearanceActions =
    standalone &&
    Boolean(qref) &&
    (dt === 'quotation_clearance' || dt === 'production_gate' || dt === 'flagged_transaction');

  const canFinanceApprove = Boolean(ws?.hasPermission?.('finance.approve'));
  const canRefundDecide =
    Boolean(ws?.hasPermission?.('refunds.approve')) || Boolean(ws?.hasPermission?.('finance.approve'));
  const canConversionSignoff =
    Boolean(ws?.hasPermission?.('production.manage')) ||
    Boolean(ws?.hasPermission?.('operations.manage')) ||
    Boolean(ws?.hasPermission?.('production.release'));

  const fetchAudit = useCallback(async (quoteId) => {
    if (!quoteId) return;
    setLoadingAudit(true);
    const { ok, data } = await apiFetch(
      `/api/management/quotation-audit?quotationRef=${encodeURIComponent(quoteId)}`
    );
    if (ok && data) setAuditData(data);
    else setAuditData({ ok: false, error: data?.error || 'Could not load quotation audit.' });
    setLoadingAudit(false);
  }, []);

  useEffect(() => {
    setPaymentDetail(null);
    setPaymentDetailError(null);
    setPaymentDetailLoading(false);
    if (dt !== 'payment_request' || !sourceId) return undefined;

    let cancelled = false;
    setPaymentDetailLoading(true);
    setPaymentDetailError(null);
    (async () => {
      const { ok, data } = await apiFetch(`/api/payment-requests/${encodeURIComponent(sourceId)}`);
      if (cancelled) return;
      setPaymentDetailLoading(false);
      if (!ok || data?.ok === false) {
        setPaymentDetail(null);
        setPaymentDetailError(data?.error || 'Could not load payment request.');
        return;
      }
      setPaymentDetail(data.request || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [dt, sourceId]);

  useEffect(() => {
    setRefundDetail(null);
    setRefundDetailError(null);
    setRefundDetailLoading(false);
    if (dt !== 'refund_request' || !sourceId) return undefined;

    let cancelled = false;
    setRefundDetailLoading(true);
    setRefundDetailError(null);
    (async () => {
      const { ok, data } = await apiFetch(`/api/refunds/${encodeURIComponent(sourceId)}`);
      if (cancelled) return;
      setRefundDetailLoading(false);
      if (!ok || data?.ok === false) {
        setRefundDetail(null);
        setRefundDetailError(data?.error || 'Could not load refund.');
        return;
      }
      setRefundDetail(data.refund || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [dt, sourceId]);

  useEffect(() => {
    setAuditData(null);
    setRefundIntelExtras(null);
    setLoadingRefundIntel(false);
    if (!workItem) return undefined;

    if (dt === 'payment_request') {
      setLoadingAudit(false);
      return undefined;
    }

    if (!qref) {
      setLoadingAudit(false);
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      return undefined;
    }

    void fetchAudit(qref);

    if (dt !== 'refund_request') {
      setRefundIntelExtras(null);
      setLoadingRefundIntel(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingRefundIntel(true);
    (async () => {
      const { ok, data } = await apiFetch(`/api/refunds/intelligence?quotationRef=${encodeURIComponent(qref)}`);
      if (cancelled) return;
      setLoadingRefundIntel(false);
      if (ok && data && data.ok !== false) setRefundIntelExtras(data);
      else setRefundIntelExtras(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [workItem, dt, qref, fetchAudit]);

  const handleQuotationReview = useCallback(
    async (decision, reason = '') => {
      if (!qref) return;
      setDecisionBusy(true);
      try {
        const { ok, data } = await apiFetch('/api/management/review', {
          method: 'POST',
          body: JSON.stringify({ quotationId: qref, decision, reason }),
        });
        if (!ok || data?.ok === false) {
          showToast(data?.error || 'Could not apply manager decision.', { variant: 'error' });
          return;
        }
        const labels = {
          clear: 'Clearance approved.',
          approve_production: 'Production override saved. Cutting list can proceed in Sales.',
          flag: 'Moved to flagged queue for audit.',
        };
        showToast(labels[decision] || 'Updated.', { variant: 'success' });
        await (ws.refresh?.() ?? Promise.resolve());
        onManagementDecisionSuccess?.();
      } finally {
        setDecisionBusy(false);
      }
    },
    [qref, showToast, ws, onManagementDecisionSuccess]
  );

  const handlePaymentDecision = useCallback(
    async (status) => {
      if (!sourceId) return;
      const note =
        window.prompt(status === 'Approved' ? 'Optional note for approval' : 'Reason for rejection (optional)') ?? '';
      setDecisionBusy(true);
      const { ok, data } = await apiFetch(`/api/payment-requests/${encodeURIComponent(sourceId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status, note: note.trim() }),
      });
      setDecisionBusy(false);
      if (!ok || data?.ok === false) {
        showToast(data?.error || 'Could not update payment request.', { variant: 'error' });
        return;
      }
      showToast(status === 'Approved' ? 'Payment request approved.' : 'Payment request rejected.', {
        variant: 'success',
      });
      await (ws.refresh?.() ?? Promise.resolve());
      onManagementDecisionSuccess?.();
    },
    [sourceId, showToast, ws, onManagementDecisionSuccess]
  );

  const handleRefundDecision = useCallback(
    async (status) => {
      if (!sourceId) return;
      const note =
        window.prompt(status === 'Approved' ? 'Optional note for approval' : 'Reason for rejection (optional)') ?? '';
      const amount = Number(refundDetail?.amount_ngn) || 0;
      setDecisionBusy(true);
      const { ok, data } = await apiFetch(`/api/refunds/${encodeURIComponent(sourceId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          managerComments: note.trim(),
          ...(status === 'Approved' && amount > 0 ? { approvedAmountNgn: amount } : {}),
        }),
      });
      setDecisionBusy(false);
      if (!ok || data?.ok === false) {
        showToast(data?.error || 'Could not update refund.', { variant: 'error' });
        return;
      }
      showToast(status === 'Approved' ? 'Refund approved.' : 'Refund rejected.', { variant: 'success' });
      await (ws.refresh?.() ?? Promise.resolve());
      onManagementDecisionSuccess?.();
    },
    [sourceId, refundDetail, showToast, ws, onManagementDecisionSuccess]
  );

  const handleConversionSignoff = useCallback(async () => {
    if (!sourceId) return;
    const remark = conversionSignoffRemark.trim();
    if (remark.length < 3) {
      showToast('Enter a sign-off remark (at least 3 characters).', { variant: 'error' });
      return;
    }
    setDecisionBusy(true);
    const { ok, data } = await apiFetch(
      `/api/production-jobs/${encodeURIComponent(sourceId)}/manager-review-signoff`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          remark,
          ...(conversionSignoffEditApprovalId.trim()
            ? { editApprovalId: conversionSignoffEditApprovalId.trim() }
            : {}),
        }),
      }
    );
    setDecisionBusy(false);
    if (!ok || data?.ok === false) {
      showToast(data?.error || 'Could not sign off this job.', { variant: 'error' });
      return;
    }
    showToast('Conversion review signed off.', { variant: 'success' });
    setConversionSignoffRemark('');
    setConversionSignoffEditApprovalId('');
    await (ws.refresh?.() ?? Promise.resolve());
    onManagementDecisionSuccess?.();
  }, [
    sourceId,
    conversionSignoffRemark,
    conversionSignoffEditApprovalId,
    showToast,
    ws,
    onManagementDecisionSuccess,
  ]);

  if (!workItem) return null;

  const paymentLineItems = Array.isArray(paymentDetail?.lineItems) ? paymentDetail.lineItems : [];
  const paymentLinesPreview = paymentLineItems.slice(0, 20);
  const refundCalcLines = parseMaybeJsonArray(refundDetail?.calculation_lines_json);
  const refundSuggestedLines = parseMaybeJsonArray(refundDetail?.suggested_lines_json);
  const conversionSigned = Boolean(String(conversionJob?.managerReviewSignedAtISO || '').trim());

  if (dt === 'payment_request') {
    const showPaymentActions =
      canFinanceApprove && paymentDetail && isPaymentApprovalPending(paymentDetail.approvalStatus);
    const paymentSubject =
      [paymentDetail?.expenseCategory, paymentDetail?.requestReference].filter(Boolean).join(' · ') ||
      (paymentDetail?.description ? String(paymentDetail.description).trim().slice(0, 80) : '') ||
      'Payment request';
    const paymentSubline = [
      paymentDetail?.requestDate,
      paymentDetail?.branchId,
      paymentDetail?.expenseID ? `Exp ${paymentDetail.expenseID}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <aside className={intelShellClass(variant)}>
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {paymentDetailLoading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="animate-spin text-[#134e4a]" size={28} />
            </div>
          ) : paymentDetailError ? (
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {paymentDetailError}
            </div>
          ) : paymentDetail ? (
            <EmailCard>
              <header className="border-b border-slate-100/90 bg-gradient-to-b from-slate-50 to-white px-5 pb-4 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium tracking-wide text-slate-500">Payment request</p>
                    <h2 className="mt-1.5 text-[1.05rem] font-semibold leading-snug tracking-tight text-slate-900 sm:text-lg">
                      {paymentSubject}
                    </h2>
                    {paymentSubline ? (
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{paymentSubline}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{sourceId}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusPillClass(
                      paymentDetail.approvalStatus
                    )}`}
                  >
                    {paymentDetail.approvalStatus || 'Pending'}
                  </span>
                </div>
                <p className="mt-5 text-2xl font-semibold tabular-nums tracking-tight text-[#134e4a]">
                  {formatNgn(Number(paymentDetail.amountRequestedNgn) || 0)}
                </p>
              </header>

              <div className="px-5 py-5">
                <EmailSectionTitle>Memo</EmailSectionTitle>
                <div className="mt-2 text-[14px] leading-relaxed text-slate-700">
                  {paymentDetail.description?.trim() ? (
                    <p className="whitespace-pre-wrap">{paymentDetail.description}</p>
                  ) : (
                    <p className="text-slate-400">No memo.</p>
                  )}
                </div>
              </div>

              {paymentLinesPreview.length ? (
                <IntelCollapsible
                  title={`Line items (${paymentLineItems.length})`}
                  defaultOpen={paymentLineItems.length <= 6}
                >
                  <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/40">
                    <div className="z-scroll-x max-w-full overflow-x-auto">
                      <table className="w-full min-w-[280px] border-collapse text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-200/80 bg-slate-100/40 text-[11px] font-medium text-slate-500">
                            <th className="px-3 py-2 font-medium">Item</th>
                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                            <th className="px-3 py-2 text-right font-medium">Unit</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentLinesPreview.map((ln, i) => (
                            <tr key={i} className="border-b border-slate-100/80 last:border-0">
                              <td className="max-w-0 truncate px-3 py-2 text-slate-800" title={ln.item || '—'}>
                                {ln.item || '—'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                                {Number(ln.unit) || 0}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                                {formatNgn(Number(ln.unitPriceNgn ?? ln.unit_price_ngn) || 0)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                                {formatNgn(Number(ln.lineTotalNgn ?? ln.line_total_ngn) || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {paymentLineItems.length > 20 ? (
                      <p className="border-t border-slate-200/60 px-3 py-2 text-[11px] text-slate-500">
                        Showing 20 of {paymentLineItems.length} lines.
                      </p>
                    ) : null}
                  </div>
                </IntelCollapsible>
              ) : null}

              {paymentDetail.attachmentPresent ? (
                <div className="border-t border-slate-100/90 px-5 py-4">
                  <a
                    href={apiUrl(`/api/payment-requests/${encodeURIComponent(sourceId)}/attachment`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] font-medium text-[#134e4a] hover:border-teal-200 hover:bg-teal-50/50"
                  >
                    <Paperclip size={15} className="shrink-0 text-slate-400" strokeWidth={2} />
                    <span className="min-w-0 truncate">{paymentDetail.attachmentName || 'View attachment'}</span>
                  </a>
                </div>
              ) : null}

              {paymentDetail.isStaffLoan ||
              hasNonEmpty(paymentDetail.hrRequestId) ||
              hasNonEmpty(paymentDetail.staffDisplayName) ||
              hasNonEmpty(paymentDetail.staffUserId) ? (
                <IntelCollapsible title="People & HR links" defaultOpen={false}>
                  <div className="pt-2">
                    {paymentDetail.isStaffLoan ? emailMetaRow('Staff loan', 'Yes') : null}
                    {emailMetaRow('HR request', paymentDetail.hrRequestId)}
                    {emailMetaRow('Staff', paymentDetail.staffDisplayName || paymentDetail.staffUserId)}
                  </div>
                </IntelCollapsible>
              ) : null}

              {paymentHasHistory(paymentDetail) ? (
                <IntelCollapsible title="Approval & payment history" defaultOpen={false}>
                  <div className="pt-2">
                    {emailMetaRow('Approved by', paymentDetail.approvedBy)}
                    {emailMetaRow('Approved at', paymentDetail.approvedAtISO)}
                    {emailMetaRow('Approval note', paymentDetail.approvalNote)}
                    {emailMetaRow('Paid amount', formatNgn(Number(paymentDetail.paidAmountNgn) || 0))}
                    {emailMetaRow('Paid at', paymentDetail.paidAtISO)}
                    {emailMetaRow('Paid by', paymentDetail.paidBy)}
                    {emailMetaRow('Payment note', paymentDetail.paymentNote)}
                  </div>
                </IntelCollapsible>
              ) : null}

              <footer className="border-t border-slate-200/90 bg-slate-50/50 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      printExpenseRequestRecord(
                        {
                          requestID: paymentDetail.requestID,
                          requestDate: paymentDetail.requestDate,
                          requestReference: paymentDetail.requestReference,
                          description: paymentDetail.description,
                          expenseID: paymentDetail.expenseID,
                          amountRequestedNgn: paymentDetail.amountRequestedNgn,
                          approvalStatus: paymentDetail.approvalStatus,
                          expenseCategory: paymentDetail.expenseCategory,
                          lineItems: paymentDetail.lineItems,
                          attachmentName: paymentDetail.attachmentName,
                          attachmentPresent: paymentDetail.attachmentPresent,
                        },
                        formatNgn
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Printer size={15} strokeWidth={2} />
                    Print
                  </button>
                  {!standalone ? (
                    <Link
                      to="/accounts"
                      state={{ accountsTab: 'requests' }}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      Open in Accounts
                    </Link>
                  ) : null}
                </div>

                {showPaymentActions ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4">
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() => void handlePaymentDecision('Approved')}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/90 bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} strokeWidth={2.25} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={decisionBusy}
                      onClick={() => void handlePaymentDecision('Rejected')}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-[13px] font-semibold text-rose-800 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Flag size={16} strokeWidth={2.25} />
                      Reject
                    </button>
                  </div>
                ) : null}
              </footer>
            </EmailCard>
          ) : (
            <p className="text-sm text-slate-500">No payment request loaded.</p>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className={intelShellClass(variant)}>
      <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {standalone ? (
          <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-200/80 pb-3">
            <span className="rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {humanizeDocType(dt)}
            </span>
            {dt === 'conversion_review' ? (
              <span className="font-mono text-xs font-medium text-slate-600">{sourceId}</span>
            ) : qref ? (
              <span className="font-mono text-xs font-medium text-slate-600">{qref}</span>
            ) : (
              <span className="font-mono text-xs font-medium text-slate-600">{sourceId || '—'}</span>
            )}
          </div>
        ) : qref ? (
          <p className="text-xs text-slate-500">
            Quote <span className="font-mono font-semibold text-slate-700">{qref}</span>
          </p>
        ) : dt === 'conversion_review' && sourceId ? (
          <p className="text-xs text-slate-500">
            Job <span className="font-mono font-semibold text-slate-700">{sourceId}</span>
          </p>
        ) : null}

        {dt === 'conversion_review' ? (
          <EmailCard>
            <header className="border-b border-slate-100/90 bg-gradient-to-b from-violet-50/60 to-white px-5 pb-4 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-500">Operations · conversion review</p>
                  <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-slate-900">
                    {conversionJob?.customerName || workItem.summary || 'Completed job review'}
                  </h2>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">{sourceId}</p>
                  {qref ? <p className="mt-2 font-mono text-[12px] font-medium text-teal-800">{qref}</p> : null}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    conversionSigned ? statusPillClass('Approved') : statusPillClass('Pending')
                  }`}
                >
                  {conversionSigned ? 'Signed off' : 'Awaiting sign-off'}
                </span>
              </div>
              {conversionJob?.productName ? (
                <p className="mt-3 text-[14px] leading-relaxed text-slate-600">{conversionJob.productName}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                  Alert: {conversionJob?.conversionAlertState || '—'}
                </span>
                {conversionJob?.managerReviewRequired ? (
                  <span className="rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-950">
                    Manager review
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-[13px] tabular-nums text-slate-600">
                Output: {Number(conversionJob?.actualMeters || 0).toLocaleString()} m
                {conversionJob?.actualWeightKg != null
                  ? ` · ${Number(conversionJob.actualWeightKg).toLocaleString()} kg`
                  : ''}
              </p>
              {conversionJob?.completedAtISO ? (
                <p className="mt-1 text-[12px] text-slate-400">
                  Completed {new Date(conversionJob.completedAtISO).toLocaleString()}
                </p>
              ) : null}
            </header>

            {canConversionSignoff && !conversionSigned ? (
              <div className="space-y-3 px-5 py-5">
                <p className="text-[13px] leading-relaxed text-slate-600">
                  Add a brief sign-off note (required before closing this review).
                </p>
                <label className="block text-[12px] font-medium text-slate-600">
                  Remark
                  <textarea
                    value={conversionSignoffRemark}
                    onChange={(e) => setConversionSignoffRemark(e.target.value)}
                    rows={3}
                    placeholder="e.g. Variance reviewed — approved to close."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-slate-900 shadow-sm outline-none ring-[#134e4a]/0 transition-shadow focus:ring-2 focus:ring-[#134e4a]/15"
                  />
                </label>
                {sourceId ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
                    <EditSecondApprovalInline
                      entityKind="production_job"
                      entityId={sourceId}
                      value={conversionSignoffEditApprovalId}
                      onChange={setConversionSignoffEditApprovalId}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={decisionBusy}
                  onClick={() => void handleConversionSignoff()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 disabled:opacity-50 sm:w-auto"
                >
                  <Factory size={17} strokeWidth={2.25} />
                  Sign off review
                </button>
              </div>
            ) : conversionSigned ? (
              <div className="border-t border-slate-100/90 px-5 py-4">
                <p className="text-[13px] leading-relaxed text-slate-600">
                  This job is already signed off
                  {conversionJob?.managerReviewSignedByName ? ` by ${conversionJob.managerReviewSignedByName}` : ''}.
                </p>
              </div>
            ) : (
              <div className="border-t border-slate-100/90 px-5 py-4">
                <p className="text-[13px] text-slate-500">
                  You do not have permission to sign off production reviews here.
                </p>
              </div>
            )}
          </EmailCard>
        ) : null}

        {showQuotationClearanceActions ? (
          <EmailCard>
            <div className="border-b border-slate-100/90 bg-gradient-to-b from-teal-50/50 to-white px-5 py-4">
              <EmailSectionTitle>Quotation clearance</EmailSectionTitle>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                Approve clears the quote; disapprove or flag sends it to flagged (reason required).
                {dt === 'production_gate'
                  ? ' Production gate: override only if you accept low-payment risk.'
                  : ''}
              </p>
            </div>
            <footer className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => void handleQuotationReview('clear')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-300/90 bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 sm:flex-none"
              >
                <CheckCircle2 size={15} strokeWidth={2.25} />
                Approve clearance
              </button>
              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => {
                  const reason = window.prompt('Why are you disapproving this clearance? (required)');
                  if (reason && reason.trim()) void handleQuotationReview('flag', reason.trim());
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
              >
                <RotateCcw size={15} strokeWidth={2.25} />
                Disapprove
              </button>
              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => {
                  const reason = window.prompt('Reason for audit flag? (required)');
                  if (reason && reason.trim()) void handleQuotationReview('flag', reason.trim());
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-900 shadow-sm hover:bg-rose-100 disabled:opacity-50 sm:flex-none"
              >
                <Flag size={15} strokeWidth={2.25} />
                Flag for audit
              </button>
              {dt === 'production_gate' ? (
                <button
                  type="button"
                  disabled={decisionBusy}
                  onClick={() => void handleQuotationReview('approve_production')}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-2 text-[12px] font-semibold text-[#134e4a] hover:bg-teal-100 disabled:opacity-50 sm:w-auto"
                >
                  <Zap size={15} strokeWidth={2.25} />
                  Production override
                </button>
              ) : null}
            </footer>
          </EmailCard>
        ) : null}

        {dt === 'refund_request' ? (
          <div className="space-y-4">
            {refundDetailLoading ? (
              <div className="flex justify-center py-16">
                <RefreshCw className="animate-spin text-[#134e4a]" size={24} />
              </div>
            ) : refundDetailError ? (
              <div className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {refundDetailError}
              </div>
            ) : refundDetail ? (
              <EmailCard>
                <header className="border-b border-slate-100/90 bg-gradient-to-b from-amber-50/50 to-white px-5 pb-4 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-500">Refund request</p>
                      <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-slate-900">
                        {[refundDetail.customer_name, formatRefundReasonCategory(refundDetail.reason_category)]
                          .filter(Boolean)
                          .join(' · ') || 'Customer refund'}
                      </h2>
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                        {[refundDetail.quotation_ref, refundDetail.requested_at_iso].filter(Boolean).join(' · ') ||
                          '—'}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{sourceId}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusPillClass(
                        refundDetail.status
                      )}`}
                    >
                      {refundDetail.status || 'Pending'}
                    </span>
                  </div>
                  <p className="mt-5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                    {formatNgn(Number(refundDetail.amount_ngn) || 0)}
                  </p>
                </header>

                <div className="px-5 py-5">
                  <EmailSectionTitle>Reason</EmailSectionTitle>
                  <div className="mt-2 text-[14px] leading-relaxed text-slate-700">
                    {refundDetail.reason?.trim() ? (
                      <p className="whitespace-pre-wrap">{refundDetail.reason}</p>
                    ) : (
                      <p className="text-slate-400">No reason text.</p>
                    )}
                  </div>
                </div>

                {refundHasSecondary(refundDetail) || refundCalcLines.length || refundSuggestedLines.length ? (
                  <IntelCollapsible title="Full record & breakdown" defaultOpen={false}>
                    <div className="pt-2">
                      {emailMetaRow('Customer id', refundDetail.customer_id)}
                      {emailMetaRow('Quotation', refundDetail.quotation_ref)}
                      {emailMetaRow('Cutting list', refundDetail.cutting_list_ref)}
                      {emailMetaRow('Product', refundDetail.product)}
                      {emailMetaRow('Branch', refundDetail.branch_id)}
                      {emailMetaRow('Requested by', refundDetail.requested_by)}
                      {emailMetaRow('User id', refundDetail.requested_by_user_id)}
                      {emailMetaRow('Requested at', refundDetail.requested_at_iso)}
                      {emailMetaRow('Approval date', refundDetail.approval_date)}
                      {emailMetaRow('Approved by', refundDetail.approved_by)}
                      {emailMetaRow('Approved amount', formatNgn(Number(refundDetail.approved_amount_ngn) || 0))}
                      {emailMetaRow('Manager comments', refundDetail.manager_comments)}
                      {emailMetaRow('Calculation notes', refundDetail.calculation_notes)}
                      {emailMetaRow('Paid amount', formatNgn(Number(refundDetail.paid_amount_ngn) || 0))}
                      {emailMetaRow('Paid at', refundDetail.paid_at_iso)}
                      {emailMetaRow('Paid by', refundDetail.paid_by)}
                      {emailMetaRow('Payment note', refundDetail.payment_note)}
                    </div>
                    {refundCalcLines.length ? (
                      <>
                        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Calculation lines
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white text-[13px]">
                          {refundCalcLines.map((line, idx) => (
                            <li key={idx} className="flex justify-between gap-3 px-3 py-2.5">
                              <span className="min-w-0 text-slate-700">{String(line.label || '—')}</span>
                              <span className="shrink-0 tabular-nums font-medium text-slate-900">
                                {formatNgn(Number(line.amountNgn) || 0)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {refundSuggestedLines.length ? (
                      <>
                        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Suggested lines
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white text-[13px]">
                          {refundSuggestedLines.map((line, idx) => (
                            <li key={idx} className="flex justify-between gap-3 px-3 py-2.5">
                              <span className="min-w-0 text-slate-700">{String(line.label || '—')}</span>
                              <span className="shrink-0 tabular-nums font-medium text-slate-900">
                                {formatNgn(Number(line.amountNgn) || 0)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </IntelCollapsible>
                ) : null}

                {canRefundDecide && String(refundDetail.status || 'Pending') === 'Pending' ? (
                  <footer className="border-t border-slate-200/90 bg-slate-50/50 px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => void handleRefundDecision('Approved')}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/90 bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <CheckCircle2 size={16} strokeWidth={2.25} />
                        Approve refund
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() => void handleRefundDecision('Rejected')}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-[13px] font-semibold text-rose-800 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                      >
                        <RotateCcw size={16} strokeWidth={2.25} />
                        Reject
                      </button>
                    </div>
                  </footer>
                ) : null}
              </EmailCard>
            ) : null}
          </div>
        ) : null}

        {dt === 'refund_request' && qref ? (
          loadingRefundIntel ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="animate-spin text-[#134e4a]" size={24} />
            </div>
          ) : refundIntelExtras?.receipts?.length ? (
            <section>
              <EmailSectionTitle>Receipts on this quote</EmailSectionTitle>
              <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                {refundIntelExtras.receipts.map((rcpt, idx) => (
                  <div key={rcpt.id || idx} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <DollarSign size={16} strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold tabular-nums text-slate-900">
                        {formatNgn(receiptCashReceivedNgn(rcpt))}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{rcpt.id}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null
        ) : null}

        {qref && dt === 'refund_request' ? (
          <IntelCollapsible title="Quotation ledger & audit" defaultOpen={false}>
            <div className="pt-2">
              <ManagementAuditSections
                auditData={auditData}
                loadingAudit={loadingAudit}
                formatNgn={formatNgn}
                appearance="light"
              />
            </div>
          </IntelCollapsible>
        ) : qref ? (
          <ManagementAuditSections auditData={auditData} loadingAudit={loadingAudit} formatNgn={formatNgn} appearance="light" />
        ) : null}

        {!standalone ? (
          <p className="border-t border-slate-200/80 pt-4 text-center text-[12px] leading-relaxed text-slate-400">
            Widen the drawer or open this thread from the workspace inbox for the full message layout.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
