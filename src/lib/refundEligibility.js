/**
 * Refund quotation picklist / “potential refunds” gate: production must be closed out
 * (completed or explicitly cancelled) or the quote voided with payment on file.
 */

export function productionJobStatusClosesRefundEligibility(status) {
  const s = String(status || '').trim();
  return s === 'Completed' || s === 'Cancelled';
}

/** Paid quotation voided at sales (e.g. order cancelled) — eligible even with no production job row. */
export function quotationVoidPaidRefundEligible(q) {
  if (!q) return false;
  if (String(q.status ?? '').trim() !== 'Void') return false;
  return (Number(q.paidNgn ?? q.paid_ngn) || 0) > 0;
}
