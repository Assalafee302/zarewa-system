/** Sort options for Procurement purchase-order lists (mirrors Sales list sorting UX). */

import { purchaseOrderOrderedValueNgn } from './liveAnalytics.js';
import { compareLocale, compareNum } from './salesListSorting.js';

export const PROCUREMENT_PO_SORT_FIELDS = [
  { id: 'date', label: 'Order date' },
  { id: 'eta', label: 'Expected delivery' },
  { id: 'id', label: 'PO ID' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'total', label: 'Ordered value' },
  { id: 'paid', label: 'Supplier paid' },
  { id: 'status', label: 'Status' },
];

function compareIsoDateEmptyLast(a, b, dir) {
  const sa = String(a ?? '').trim().slice(0, 10);
  const sb = String(b ?? '').trim().slice(0, 10);
  const emptyA = !sa;
  const emptyB = !sb;
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  const c = sa.localeCompare(sb);
  return dir === 'asc' ? c : -c;
}

function poIdCmp(a, b) {
  return String(a?.poID ?? '').localeCompare(String(b?.poID ?? ''));
}

/**
 * @param {object[]} rows — purchase order rows (same shape as workspace POs)
 * @param {string} field — PROCUREMENT_PO_SORT_FIELDS id
 * @param {'asc'|'desc'} dir
 */
export function sortPurchaseOrdersList(rows, field, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    let c = 0;
    switch (field) {
      case 'id':
        return compareLocale(a.poID, b.poID, dir);
      case 'supplier':
        return compareLocale(a.supplierName, b.supplierName, dir);
      case 'date':
        return compareIsoDateEmptyLast(a.orderDateISO, b.orderDateISO, dir);
      case 'eta':
        return compareIsoDateEmptyLast(a.expectedDeliveryISO, b.expectedDeliveryISO, dir);
      case 'total':
        c = compareNum(purchaseOrderOrderedValueNgn(a), purchaseOrderOrderedValueNgn(b), dir);
        return c !== 0 ? c : poIdCmp(a, b);
      case 'paid':
        c = compareNum(a.supplierPaidNgn, b.supplierPaidNgn, dir);
        return c !== 0 ? c : poIdCmp(a, b);
      case 'status':
        c = compareLocale(a.status, b.status, dir);
        return c !== 0 ? c : poIdCmp(a, b);
      default:
        return compareIsoDateEmptyLast(a.orderDateISO, b.orderDateISO, dir);
    }
  });
  return list;
}
