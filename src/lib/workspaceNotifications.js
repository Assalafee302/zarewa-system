import { refundOutstandingAmount } from './refundsStore';

/**
 * Build actionable notifications from workspace snapshot, filtered by permissions.
 * @param {object} params
 * @param {object | null} params.snapshot
 * @param {(p: string) => boolean} params.hasPermission
 * @param {(m: string) => boolean} params.canAccessModule
 * @param {number} params.lowStockSkuCount
 */
export function buildWorkspaceNotifications({
  snapshot,
  hasPermission,
  canAccessModule,
  lowStockSkuCount,
}) {
  const items = [];
  const can = (p) => hasPermission('*') || hasPermission(p);

  if (canAccessModule('operations') && lowStockSkuCount > 0) {
    items.push({
      id: 'low-stock',
      title: 'Low stock',
      detail: `${lowStockSkuCount} SKU(s) below minimum reorder level.`,
      severity: 'warning',
      path: '/operations',
      state: { focusOpsTab: 'inventory' },
    });
  }

  const paymentRequests = Array.isArray(snapshot?.paymentRequests) ? snapshot.paymentRequests : [];
  const pendingPay = paymentRequests.filter((row) => {
    const requested = Number(row.amountRequestedNgn) || 0;
    const paid = Number(row.paidAmountNgn) || 0;
    if (row.approvalStatus === 'Rejected') return false;
    if (row.approvalStatus !== 'Approved') return true;
    return paid < requested;
  });

  if (
    canAccessModule('finance') &&
    (can('finance.approve') || can('finance.pay')) &&
    pendingPay.length > 0
  ) {
    items.push({
      id: 'payment-requests',
      title: 'Payment requests',
      detail: `${pendingPay.length} request(s) need approval or treasury payout.`,
      severity: 'warning',
      path: '/accounts',
      state: { accountsTab: 'requests' },
    });
  }

  const refunds = Array.isArray(snapshot?.refunds) ? snapshot.refunds : [];
  const refundDue = refunds.filter((x) => x.status === 'Approved' && refundOutstandingAmount(x) > 0);
  if (canAccessModule('finance') && can('finance.pay') && refundDue.length > 0) {
    items.push({
      id: 'refund-payouts',
      title: 'Refund payouts',
      detail: `${refundDue.length} approved refund(s) awaiting treasury payout.`,
      severity: 'warning',
      path: '/accounts',
      state: { accountsTab: 'treasury' },
    });
  }

  const coilReq = Array.isArray(snapshot?.coilRequests) ? snapshot.coilRequests : [];
  const pendingCoils = coilReq.filter((r) => r.status === 'pending');
  if (canAccessModule('operations') && can('operations.manage') && pendingCoils.length > 0) {
    items.push({
      id: 'coil-requests',
      title: 'Coil requests',
      detail: `${pendingCoils.length} store coil request(s) pending acknowledgement.`,
      severity: 'info',
      path: '/operations',
      state: { focusOpsTab: 'inventory' },
    });
  }

  const pos = Array.isArray(snapshot?.purchaseOrders) ? snapshot.purchaseOrders : [];
  const inTransit = pos.filter((p) => p.status === 'In Transit' || p.status === 'On loading');
  if (canAccessModule('procurement') && inTransit.length > 0) {
    items.push({
      id: 'po-transit',
      title: 'Purchases in motion',
      detail: `${inTransit.length} PO(s) on loading or in transit — store GRN when coils arrive.`,
      severity: 'info',
      path: '/procurement',
      state: { focusTab: 'transport' },
    });
  }

  const quotes = Array.isArray(snapshot?.quotations) ? snapshot.quotations : [];
  const overdue = quotes.filter((q) => {
    if (q.paymentStatus === 'Paid') return false;
    const due = q.dueDateISO;
    if (!due) return false;
    return due < new Date().toISOString().slice(0, 10);
  });
  if (canAccessModule('sales') && (can('sales.view') || can('quotations.manage')) && overdue.length > 0) {
    items.push({
      id: 'overdue-quotes',
      title: 'Quotations past due date',
      detail: `${overdue.length} open quotation(s) with due date before today — follow up collections.`,
      severity: 'warning',
      path: '/sales',
      state: { focusSalesTab: 'quotations' },
    });
  }

  return items;
}
