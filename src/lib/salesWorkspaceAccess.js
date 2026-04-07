export const SALES_ROLE_LABELS = {
  admin: 'Administrator',
  finance_manager: 'Finance manager',
  sales_manager: 'Branch manager',
  sales_staff: 'Sales officer',
  procurement_officer: 'Procurement officer',
  operations_officer: 'Operations officer',
  viewer: 'Read only',
};

export function loadSalesWorkspaceRole(roleKey) {
  return roleKey && SALES_ROLE_LABELS[roleKey] ? roleKey : 'sales_staff';
}

export function saveSalesWorkspaceRole() {
  /* session-owned role; no local override */
}

export function isQuotationFullyPaid(q) {
  if (!q) return false;
  const total = Number(q.totalNgn) || 0;
  const paid = Number(q.paidNgn) || 0;
  if (q.paymentStatus === 'Paid') return true;
  if (total > 0 && paid >= total) return true;
  return false;
}

export function canEditQuotation(q, role) {
  if (!q?.id) return true;
  const st = String(q.status || '').trim();
  if (st === 'Expired' || st === 'Void') return false;
  if (!isQuotationFullyPaid(q)) return true;
  return role === 'admin' || role === 'sales_manager';
}

export function quotationEditBlockedReason(q, role) {
  if (canEditQuotation(q, role)) return null;
  const st = String(q?.status || '').trim();
  if (st === 'Expired' || st === 'Void') {
    return 'This quotation is archived (expired or void). Use Revive in the quotation window to return it to the active pipeline, or create a new quote.';
  }
  return 'Fully paid quotations can only be edited by a branch manager. You can still view the record.';
}

export function canEditReceipt(record, role) {
  if (!record?.id) return true;
  if (record.source === 'ledger') return role === 'admin' || role === 'finance_manager';
  return role === 'admin' || role === 'finance_manager' || role === 'sales_manager';
}

export function receiptEditBlockedReason(record, role) {
  if (canEditReceipt(record, role)) return null;
  if (record?.source === 'ledger') {
    return 'Ledger payments are read-only — use a reversing entry in Finance if a correction is needed.';
  }
  return 'Posted receipts are view-only for sales. Accounts (audit) or a branch manager can edit during reconciliation.';
}

export function canEditCuttingList(c) {
  if (!c?.id) return true;
  if (c.productionRegistered) return false;
  return true;
}

export function cuttingListEditBlockedReason(c) {
  if (canEditCuttingList(c)) return null;
  return 'Production register was entered for this cutting list — editing is blocked to prevent fraud.';
}
