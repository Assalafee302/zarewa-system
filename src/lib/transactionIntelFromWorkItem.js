import { MANAGER_INBOX_DOCUMENT_TYPES } from './managerInboxWorkItemTypes';

/** Work item types that show the transaction-intel column in the Office thread drawer. */
export const OFFICE_DRAWER_TRANSACTION_INTEL_DOC_TYPES = new Set([
  ...MANAGER_INBOX_DOCUMENT_TYPES,
  'refund_request',
  'payment_request',
]);

export function workItemShowsOfficeDrawerTransactionIntel(documentType) {
  return OFFICE_DRAWER_TRANSACTION_INTEL_DOC_TYPES.has(String(documentType || '').trim().toLowerCase());
}

/**
 * Quotation id for `/api/management/quotation-audit` and refund intelligence.
 * @param {Record<string, unknown> | null | undefined} item
 * @returns {string}
 */
export function quotationRefFromWorkItemForIntel(item) {
  if (!item) return '';
  const dt = String(item.documentType || '').trim().toLowerCase();
  const data = item.data && typeof item.data === 'object' ? item.data : {};
  const fromData = String(data.quotationRef || data.quotation_ref || '').trim();
  if (fromData) return fromData;
  if (dt === 'quotation_clearance' || dt === 'flagged_transaction') {
    return String(item.sourceId || item.referenceNo || '').trim();
  }
  if (dt === 'production_gate') {
    return String(item.sourceId || item.referenceNo || '').trim();
  }
  return '';
}
