/**
 * Derive manager-dashboard queues and headline metrics from the workspace bootstrap snapshot
 * so the Manager page updates as soon as Sales / Operations data refreshes (no stale API-only lists).
 */

/** @typedef {'month' | '4months' | 'half' | 'year'} ManagerMetricPeriodKey */

export const MANAGER_METRIC_PERIODS = [
  { key: 'month', label: 'This month', shortLabel: 'Month', monthsSpan: 1 },
  { key: '4months', label: 'Last 4 months', shortLabel: '4 mo', monthsSpan: 4 },
  { key: 'half', label: 'Last 6 months', shortLabel: 'Half yr', monthsSpan: 6 },
  { key: 'year', label: 'Last 12 months', shortLabel: 'Year', monthsSpan: 12 },
];

export function managementMonthStartISO() {
  return managementPeriodStartISO('month');
}

/**
 * First calendar day (UTC) of the month that begins the rolling window: current month plus (span − 1) prior months.
 * `dateISO` values compare as YYYY-MM-DD strings.
 * @param {ManagerMetricPeriodKey} periodKey
 */
export function managementPeriodStartISO(periodKey) {
  const d = new Date();
  const subtractMonths =
    periodKey === '4months' ? 3 : periodKey === 'half' ? 5 : periodKey === 'year' ? 11 : 0;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let ty = y;
  let tm = m - subtractMonths;
  while (tm < 0) {
    tm += 12;
    ty -= 1;
  }
  return `${ty}-${String(tm + 1).padStart(2, '0')}-01`;
}

/**
 * Mirrors server `listManagementItems` shapes for the SPA inbox (snake_case row fields).
 * @param {object} snapshot
 * @returns {{ pendingClearance: object[]; flagged: object[]; productionOverrides: object[]; pendingRefunds: object[]; pendingExpenses: object[]; pendingConversionReviews: object[] }}
 */
export function buildManagementQueuesFromSnapshot(snapshot) {
  const quotations = Array.isArray(snapshot?.quotations) ? snapshot.quotations : [];
  const cuttingLists = Array.isArray(snapshot?.cuttingLists) ? snapshot.cuttingLists : [];
  const refunds = Array.isArray(snapshot?.refunds) ? snapshot.refunds : [];
  const paymentRequests = Array.isArray(snapshot?.paymentRequests) ? snapshot.paymentRequests : [];
  const productionJobs = Array.isArray(snapshot?.productionJobs) ? snapshot.productionJobs : [];

  const quoteById = new Map(quotations.map((q) => [q.id, q]));

  const pendingClearance = quotations
    .filter((q) => {
      if ((Number(q.paidNgn) || 0) <= 0) return false;
      if (q.managerClearedAtISO) return false;
      if (q.managerFlaggedAtISO) return false;
      return true;
    })
    .map((q) => ({
      id: q.id,
      customer_name: q.customer,
      total_ngn: Number(q.totalNgn) || 0,
      paid_ngn: Number(q.paidNgn) || 0,
      date_iso: q.dateISO,
      status: q.status,
    }))
    .sort((a, b) => String(b.date_iso || '').localeCompare(String(a.date_iso || '')));

  const flagged = quotations
    .filter((q) => Boolean(q.managerFlaggedAtISO))
    .map((q) => ({
      id: q.id,
      customer_name: q.customer,
      total_ngn: Number(q.totalNgn) || 0,
      manager_flag_reason: q.managerFlagReason || '',
      manager_flagged_at_iso: q.managerFlaggedAtISO,
    }))
    .sort((a, b) =>
      String(b.manager_flagged_at_iso || '').localeCompare(String(a.manager_flagged_at_iso || ''))
    );

  const productionOverrides = cuttingLists
    .filter((cl) => {
      if (String(cl.status) !== 'Draft') return false;
      const q = quoteById.get(cl.quotationRef);
      if (!q) return false;
      const total = Number(q.totalNgn) || 0;
      const paid = Number(q.paidNgn) || 0;
      if (total <= 0) return false;
      if (paid >= total * 0.7) return false;
      if (q.managerProductionApprovedAtISO) return false;
      return true;
    })
    .map((cl) => {
      const q = quoteById.get(cl.quotationRef);
      return {
        id: cl.id,
        customer_name: cl.customer || q.customer,
        quotation_ref: cl.quotationRef,
        total_meters: cl.totalMeters,
        paid_ngn: Number(q.paidNgn) || 0,
        total_ngn: Number(q.totalNgn) || 0,
      };
    });

  const pendingRefunds = refunds
    .filter((r) => String(r.status) === 'Pending')
    .map((r) => ({
      refund_id: r.refundID,
      customer_name: r.customer,
      quotation_ref: r.quotationRef,
      amount_ngn: r.amountNgn,
      requested_at_iso: r.requestedAtISO,
      reason_category: r.reasonCategory,
    }));

  const pendingExpenses = paymentRequests
    .filter((pr) => String(pr.approvalStatus || '').toLowerCase() === 'pending')
    .map((pr) => ({
      request_id: pr.requestID,
      expense_id: pr.expenseID,
      amount_requested_ngn: pr.amountRequestedNgn,
      request_date: pr.requestDate,
      description: pr.description,
      approval_status: pr.approvalStatus,
      request_reference: pr.requestReference ?? '',
      line_items: Array.isArray(pr.lineItems) ? pr.lineItems : [],
      attachment_present: Boolean(pr.attachmentPresent),
      attachment_name: pr.attachmentName ?? '',
      expense_category: pr.expenseCategory ?? '',
    }));

  const pendingConversionReviews = productionJobs
    .filter(
      (j) =>
        String(j.status) === 'Completed' &&
        !String(j.managerReviewSignedAtISO || '').trim() &&
        (Boolean(j.managerReviewRequired) ||
          j.conversionAlertState === 'High' ||
          j.conversionAlertState === 'Low')
    )
    .map((j) => ({
      job_id: j.jobID,
      cutting_list_id: j.cuttingListId,
      quotation_ref: j.quotationRef,
      customer_name: j.customerName,
      product_name: j.productName,
      conversion_alert_state: j.conversionAlertState,
      manager_review_required: j.managerReviewRequired ? 1 : 0,
      actual_meters: j.actualMeters,
      actual_weight_kg: j.actualWeightKg,
      completed_at_iso: j.completedAtISO,
    }))
    .sort((a, b) =>
      String(b.completed_at_iso || '').localeCompare(String(a.completed_at_iso || ''))
    );

  return {
    pendingClearance,
    flagged,
    productionOverrides,
    pendingRefunds,
    pendingExpenses,
    pendingConversionReviews,
  };
}

/**
 * Headline metrics for the hero + top customers (month-scoped) from workspace quotation / cutting-list rows.
 * @param {object[]} quotations
 * @param {object[]} cuttingLists
 * @param {number} lowStockSkuCount — from live inventory context
 * @param {{ nairaTarget?: number; meterTarget?: number }} targets
 * @param {ManagerMetricPeriodKey} [periodKey]
 */
export function buildManagerSnapshotsFromWorkspace(
  quotations,
  cuttingLists,
  lowStockSkuCount,
  targets,
  periodKey = 'month'
) {
  const ms = managementPeriodStartISO(periodKey);
  const qMonth = quotations.filter((q) => String(q.dateISO || '') >= ms);
  const revenue = qMonth.reduce((s, q) => s + (Number(q.paidNgn) || 0), 0);
  const quoteCount = qMonth.length;
  const metersProduced = cuttingLists
    .filter((cl) => String(cl.dateISO || '') >= ms)
    .reduce((s, cl) => s + (Number(cl.totalMeters) || 0), 0);

  const revByCustomer = new Map();
  for (const q of qMonth) {
    const cid = q.customerID || '';
    revByCustomer.set(cid, (revByCustomer.get(cid) || 0) + (Number(q.totalNgn) || 0));
  }
  const topByRevenue = [...revByCustomer.entries()]
    .map(([customer_id, rev]) => ({
      customer_id,
      customer_name:
        quotations.find((x) => x.customerID === customer_id)?.customer || customer_id || '—',
      revenue: rev,
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const meta = MANAGER_METRIC_PERIODS.find((p) => p.key === periodKey);
  const monthsSpan = meta?.monthsSpan ?? 1;
  const baseNaira = Number(targets?.nairaTarget) || 50000000;
  const baseMeters = Number(targets?.meterTarget) || 250000;

  return {
    revenue,
    quoteCount,
    lowStockCount: lowStockSkuCount,
    metersProduced,
    topByRevenue,
    periodKey,
    periodLabel: meta?.label ?? 'This month',
    targets: {
      nairaTarget: baseNaira * monthsSpan,
      meterTarget: baseMeters * monthsSpan,
    },
  };
}
