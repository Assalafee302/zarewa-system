/** Sort options for Procurement → Payments lists (open + settled). */
export const PAYABLES_SORT_FIELDS = [
  { id: 'due', label: 'Due date' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'amount', label: 'Invoice amount' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'paid', label: 'Paid' },
  { id: 'id', label: 'AP ID' },
];

function cmpStr(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function cmpNum(a, b) {
  return (Number(a) || 0) - (Number(b) || 0);
}

function cmpDate(a, b) {
  const da = String(a ?? '').trim();
  const db = String(b ?? '').trim();
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
}

/**
 * @param {object[]} items accountsPayable-shaped rows
 * @param {string} field PAYABLES_SORT_FIELDS id
 * @param {'asc'|'desc'} dir
 */
export function sortAccountsPayableList(items, field, dir) {
  const m = [...(items || [])];
  const sign = dir === 'asc' ? 1 : -1;
  m.sort((x, y) => {
    const amtX = Number(x.amountNgn) || 0;
    const amtY = Number(y.amountNgn) || 0;
    const paidX = Number(x.paidNgn) || 0;
    const paidY = Number(y.paidNgn) || 0;
    const outX = Math.max(0, amtX - paidX);
    const outY = Math.max(0, amtY - paidY);
    let c = 0;
    switch (field) {
      case 'id':
        c = cmpStr(x.apID, y.apID);
        break;
      case 'supplier':
        c = cmpStr(x.supplierName, y.supplierName);
        break;
      case 'amount':
        c = cmpNum(amtX, amtY);
        break;
      case 'due':
        c = cmpDate(x.dueDateISO, y.dueDateISO);
        break;
      case 'paid':
        c = cmpNum(paidX, paidY);
        break;
      case 'outstanding':
        c = cmpNum(outX, outY);
        break;
      default:
        c = cmpDate(x.dueDateISO, y.dueDateISO);
    }
    return c * sign;
  });
  return m;
}
