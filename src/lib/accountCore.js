export const ACCOUNT_TAB_LABELS = {
  treasury: 'Treasury',
  receipts: 'Receipts & bank recon',
  movements: 'Fund movements',
  disbursements: 'Expenses & requests',
  audit: 'Audit & reconciliation',
};

export const TREASURY_STATEMENT_TYPE_LABEL = {
  RECEIPT_IN: 'Customer receipt',
  ADVANCE_IN: 'Advance deposit',
  BANK_RECON_ADJUSTMENT: 'Bank reconciliation settlement',
  INTERNAL_TRANSFER_IN: 'Transfer in',
  INTERNAL_TRANSFER_OUT: 'Transfer out',
  EXPENSE: 'Expense',
  AP_PAYMENT: 'Accounts payable payment',
  SUPPLIER_PAYMENT: 'Supplier payment',
  PO_SUPPLIER_PAYMENT: 'Supplier payment',
  REFUND_PAYOUT: 'Customer refund payout',
  ADVANCE_REFUND_OUT: 'Advance refund',
  PAYMENT_REQUEST_OUT: 'Payment request payout',
  TRANSPORT_PAYMENT: 'Transport / haulage',
};

export const TREASURY_SOURCE_KIND_LABEL = {
  INTER_BRANCH_LOAN: 'Inter-branch lending (disbursement)',
  INTER_BRANCH_LOAN_REPAY: 'Inter-branch lending (repayment)',
};

export const nextExpenseId = (list) => {
  const nums = list
    .map((e) => {
      const raw = String(e?.expenseID || '');
      const m = raw.match(/-(\d+)$/);
      return Number.parseInt(m?.[1] || '', 10);
    })
    .filter((n) => !Number.isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `EXP-2026-${String(n).padStart(3, '0')}`;
};

export const normalizePaymentRequest = (row) => ({
  ...row,
  paidAmountNgn: Number(row?.paidAmountNgn) || 0,
  paidAtISO: row?.paidAtISO || '',
  paidBy: row?.paidBy || '',
  paymentNote: row?.paymentNote || '',
  branchId: row?.branchId || '',
  expenseCategory: row?.expenseCategory || '',
  isStaffLoan: Boolean(row?.isStaffLoan),
  hrRequestId: row?.hrRequestId || '',
  staffUserId: row?.staffUserId || '',
  staffDisplayName: row?.staffDisplayName || '',
  requestReference: row?.requestReference || '',
  lineItems: Array.isArray(row?.lineItems) ? row.lineItems : [],
  attachmentName: row?.attachmentName || '',
  attachmentMime: row?.attachmentMime || '',
  attachmentPresent: Boolean(row?.attachmentPresent),
});

export const createRequestPayLine = (defaultAccountId = '', amount = '') => ({
  id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  treasuryAccountId: String(defaultAccountId),
  amount: amount === '' ? '' : String(amount),
  reference: '',
});

export function treasuryMovementStatementLabel(m) {
  const sourceLabel = TREASURY_SOURCE_KIND_LABEL[m.sourceKind];
  const kind = sourceLabel || TREASURY_STATEMENT_TYPE_LABEL[m.type] || m.type || 'Treasury movement';
  const bits = [kind];
  if (m.counterpartyName) bits.push(m.counterpartyName);
  if (m.reference) bits.push(`Ref ${m.reference}`);
  if (m.note) bits.push(m.note);
  return bits.join(' · ');
}

export function buildPaymentRequestAuditTrail(req) {
  if (!req || typeof req !== 'object') return [];
  const trail = [];
  if (req.requestDate || req.requestedBy) {
    trail.push({
      key: 'requested',
      label: 'Requested',
      who: req.requestedBy || '—',
      at: req.requestDate || req.createdAtISO || '',
    });
  }
  if (req.approvedBy || req.approvedAtISO) {
    trail.push({
      key: 'approved',
      label: 'Approved',
      who: req.approvedBy || '—',
      at: req.approvedAtISO || '',
    });
  }
  if (req.paidBy || req.paidAtISO) {
    trail.push({
      key: 'paid',
      label: 'Paid',
      who: req.paidBy || '—',
      at: req.paidAtISO || '',
    });
  }
  return trail;
}

