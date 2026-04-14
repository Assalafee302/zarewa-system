/** Shared list sorting for Sales workspace tables (quotations, receipts, cutting lists, refunds). */

export const SALES_TABLE_SORT_FIELD_OPTIONS = {
  quotations: [
    { id: 'date', label: 'Date' },
    { id: 'id', label: 'Quotation ID' },
    { id: 'customer', label: 'Customer' },
    { id: 'total', label: 'Total' },
    { id: 'status', label: 'Approval' },
    { id: 'payment', label: 'Payment' },
  ],
  receipts: [
    { id: 'date', label: 'Date' },
    { id: 'id', label: 'Receipt ID' },
    { id: 'customer', label: 'Customer' },
    { id: 'amount', label: 'Amount' },
    { id: 'quotation', label: 'Quotation' },
    { id: 'source', label: 'Source' },
  ],
  cuttinglist: [
    { id: 'date', label: 'Date' },
    { id: 'id', label: 'List ID' },
    { id: 'customer', label: 'Customer' },
    { id: 'total', label: 'Total' },
    { id: 'status', label: 'Status' },
  ],
  refund: [
    { id: 'date', label: 'Date' },
    { id: 'id', label: 'Refund ID' },
    { id: 'customer', label: 'Customer' },
    { id: 'amount', label: 'Amount' },
    { id: 'status', label: 'Status' },
  ],
};

export function compareLocale(a, b, dir) {
  const c = String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
  return dir === 'asc' ? c : -c;
}

export function compareNum(a, b, dir) {
  const na = Number(a);
  const nb = Number(b);
  const va = Number.isFinite(na) ? na : 0;
  const vb = Number.isFinite(nb) ? nb : 0;
  const c = va === vb ? 0 : va < vb ? -1 : 1;
  return dir === 'asc' ? c : -c;
}

function quoteDateKey(row) {
  return String(row?.dateISO || row?.date || '');
}

export function sortQuotationsList(rows, field, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    switch (field) {
      case 'id':
        return compareLocale(a.id, b.id, dir);
      case 'customer':
        return compareLocale(a.customer, b.customer, dir);
      case 'date':
        return compareLocale(quoteDateKey(a), quoteDateKey(b), dir);
      case 'total':
        return compareNum(a.totalNgn, b.totalNgn, dir);
      case 'status':
        return compareLocale(a.status, b.status, dir);
      case 'payment':
        return compareLocale(a.paymentStatus, b.paymentStatus, dir);
      default:
        return compareLocale(quoteDateKey(a), quoteDateKey(b), dir);
    }
  });
  return list;
}

function receiptDateKey(row) {
  return String(row?.dateISO || row?.date || '');
}

export function sortReceiptsList(rows, field, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    switch (field) {
      case 'id':
        return compareLocale(a.id, b.id, dir);
      case 'customer':
        return compareLocale(a.customer, b.customer, dir);
      case 'date':
        return compareLocale(receiptDateKey(a), receiptDateKey(b), dir);
      case 'amount':
        return compareNum(a.amountNgn, b.amountNgn, dir);
      case 'quotation':
        return compareLocale(a.quotationRef, b.quotationRef, dir);
      case 'source':
        return compareLocale(a.source, b.source, dir);
      default:
        return compareLocale(receiptDateKey(a), receiptDateKey(b), dir);
    }
  });
  return list;
}

function cuttingDateKey(row) {
  return String(row?.dateISO || row?.date || '');
}

function cuttingTotalNgn(row) {
  const n = Number(row?.totalNgn ?? row?.total_ngn);
  if (Number.isFinite(n) && n !== 0) return n;
  const s = String(row?.total ?? '').replace(/[₦,\s]/g, '');
  const p = parseFloat(s);
  return Number.isFinite(p) ? p : 0;
}

export function sortCuttingLists(rows, field, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    switch (field) {
      case 'id':
        return compareLocale(a.id, b.id, dir);
      case 'customer':
        return compareLocale(a.customer, b.customer, dir);
      case 'date':
        return compareLocale(cuttingDateKey(a), cuttingDateKey(b), dir);
      case 'total':
        return compareNum(cuttingTotalNgn(a), cuttingTotalNgn(b), dir);
      case 'status':
        return compareLocale(a.status, b.status, dir);
      default:
        return compareLocale(cuttingDateKey(a), cuttingDateKey(b), dir);
    }
  });
  return list;
}

function refundDateKey(row) {
  return String(row?.requestedAtISO || row?.requested_at_iso || row?.approvalDate || '').slice(0, 10);
}

export function sortRefundsList(rows, field, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    const idA = a.refundID ?? a.id;
    const idB = b.refundID ?? b.id;
    switch (field) {
      case 'id':
        return compareLocale(idA, idB, dir);
      case 'customer':
        return compareLocale(a.customer, b.customer, dir);
      case 'date':
        return compareLocale(refundDateKey(a), refundDateKey(b), dir);
      case 'amount':
        return compareNum(a.amountNgn, b.amountNgn, dir);
      case 'status':
        return compareLocale(a.status, b.status, dir);
      default:
        return compareLocale(refundDateKey(a), refundDateKey(b), dir);
    }
  });
  return list;
}
