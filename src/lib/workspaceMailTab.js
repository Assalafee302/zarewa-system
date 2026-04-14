/**
 * Gmail-style category tabs for workspace registry items (not thread-only list).
 * @param {Record<string, unknown>} item
 * @returns {'primary'|'finance'|'operations'|'management'|'updates'}
 */
export function mailTabForWorkItem(item) {
  const dt = String(item?.documentType || '').trim().toLowerCase();
  const sk = String(item?.sourceKind || '').trim().toLowerCase();
  const dc = String(item?.documentClass || '').trim().toLowerCase();

  if (sk === 'office_thread' || String(item?.linkedThreadId || '').trim()) return 'primary';
  if (dc === 'correspondence' || dt === 'memo') return 'primary';

  if (
    dt === 'payment_request' ||
    dt === 'refund_request' ||
    dt === 'bank_recon_exceptions' ||
    dt === 'po_transport_payment'
  ) {
    return 'finance';
  }

  if (dt.startsWith('hr_') || sk === 'hr_request') return 'updates';

  if (dt === 'material_request' || sk === 'coil_request') return 'operations';

  if (
    dt === 'quotation_clearance' ||
    dt === 'production_gate' ||
    dt === 'flagged_transaction' ||
    dt === 'conversion_review' ||
    dt === 'edit_approval'
  ) {
    return 'management';
  }

  return 'updates';
}

export const MAIL_TAB_ORDER = ['primary', 'finance', 'operations', 'management', 'updates', 'all'];

export const MAIL_TAB_LABELS = {
  primary: 'General',
  finance: 'Finance',
  operations: 'Operations',
  management: 'Governance',
  updates: 'Other',
  all: 'All',
};
