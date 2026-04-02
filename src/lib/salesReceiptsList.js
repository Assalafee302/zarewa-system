/**
 * Merge imported/historical receipts with ledger RECEIPT rows for Sales UI and print history.
 */
import { loadLedgerEntries, amountDueOnQuotation } from './customerLedgerStore';
import { formatNgn } from '../Data/mockData';

function reversalTargetId(raw) {
  const m = String(raw ?? '').match(/REVERSAL_OF:([A-Za-z0-9-]+)/);
  return m ? m[1] : '';
}

function shortDateFromISO(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [, m, d] = s.split('-');
  if (!d || !m) return '—';
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  return `${d} ${mo}`;
}

function quotePaymentHint(quotation) {
  if (!quotation) return { badge: 'No quote link', sub: '' };
  const due = amountDueOnQuotation(quotation);
  if (due <= 0) {
    return { badge: 'Fully paid (ledger)', sub: 'Nothing left due on this quote' };
  }
  return {
    badge: `Balance due ${formatNgn(due)}`,
    sub: `Books show ${quotation.paymentStatus ?? '—'}`,
  };
}

/**
 * Rows for sidebar + main list: newest first. Ledger posts appear immediately after save.
 * @param {object[]} importedReceipts
 * @param {object[]} quotations
 * @param {number} [_ledgerEpoch] bump from parent to recompute
 */
export function mergeReceiptRowsForSales(importedReceipts, quotations, _ledgerEpoch = 0) {
  void _ledgerEpoch;
  const qMap = new Map((quotations || []).map((q) => [q.id, q]));
  const ledgerEntries = loadLedgerEntries();
  const reversedReceiptIds = new Set(
    ledgerEntries
      .filter((e) => e.type === 'RECEIPT_REVERSAL')
      .map((e) => reversalTargetId(e.bankReference || e.note))
      .filter(Boolean)
  );

  const ledgerRows = ledgerEntries
    .filter((e) => e.type === 'RECEIPT' && e.quotationRef && !reversedReceiptIds.has(e.id))
    .map((e) => {
      const q = qMap.get(e.quotationRef);
      const hint = quotePaymentHint(q);
      const dateISO = (e.atISO || '').slice(0, 10) || '';
      return {
        id: e.id,
        source: 'ledger',
        customerID: e.customerID,
        customer: e.customerName || e.customerID,
        quotationRef: e.quotationRef,
        dateISO,
        date: shortDateFromISO(e.atISO),
        amountNgn: e.amountNgn,
        amount: formatNgn(e.amountNgn),
        status: 'Recorded',
        handledBy: '—',
        _ledgerEntry: e,
        _payBadge: hint.badge,
        _subLabel: 'From customer ledger',
        _detailNote: e.bankReference || e.note || '',
      };
    });

  const ledgerIds = new Set(ledgerRows.map((r) => r.id));

  const importedRows = (importedReceipts || [])
    .filter((r) => {
      if (String(r.status || '').toLowerCase() === 'reversed') return false;
      if (r.ledgerEntryId && reversedReceiptIds.has(String(r.ledgerEntryId))) return false;
      if (ledgerIds.has(r.id)) return false;
      if (r.ledgerEntryId && ledgerIds.has(r.ledgerEntryId)) return false;
      return true;
    })
    .map((r) => {
      const q = r.quotationRef ? qMap.get(r.quotationRef) : null;
      const hint = quotePaymentHint(q);
      return {
        ...r,
        source: 'imported',
        dateISO: r.dateISO || r.date || '',
        _payBadge: hint.badge,
        _subLabel: 'Imported history row',
        _detailNote: r.method ? `Method: ${r.method}` : '',
      };
    });

  const merged = [...ledgerRows, ...importedRows];
  merged.sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')));
  return merged;
}

/**
 * Chronological history of payments on one quotation (ledger + imported), for receipt printout.
 * @param {string} quotationId
 * @param {object[]} importedReceipts
 */
export function quotationReceiptPrintHistory(quotationId, importedReceipts = []) {
  if (!quotationId) return [];
  const ledgerEntries = loadLedgerEntries();
  const reversedReceiptIds = new Set(
    ledgerEntries
      .filter((e) => e.type === 'RECEIPT_REVERSAL')
      .map((e) => reversalTargetId(e.bankReference || e.note))
      .filter(Boolean)
  );

  const ledger = ledgerEntries
    .filter((e) => e.type === 'RECEIPT' && e.quotationRef === quotationId && !reversedReceiptIds.has(e.id))
    .map((e) => ({
      id: e.id,
      dateStr: formatPrintDate((e.atISO || '').slice(0, 10)),
      iso: (e.atISO || '').slice(0, 10),
      amountNgn: Number(e.amountNgn) || 0,
      source: 'Ledger',
      detail: e.bankReference || e.note || '—',
    }));

  const imported = (importedReceipts || [])
    .filter(
      (r) =>
        r.quotationRef === quotationId &&
        String(r.status || '').toLowerCase() !== 'reversed' &&
        !(r.ledgerEntryId && reversedReceiptIds.has(String(r.ledgerEntryId)))
    )
    .map((r) => ({
      id: r.id,
      dateStr: formatPrintDate(r.dateISO) || r.date || '—',
      iso: r.dateISO || '',
      amountNgn: Number(r.amountNgn) || 0,
      source: 'Imported',
      detail: r.method ? `Method: ${r.method}` : 'Imported receipt',
    }));

  const byId = new Map();
  imported.forEach((row) => byId.set(row.id, row));
  ledger.forEach((row) => byId.set(row.id, row));
  return [...byId.values()].sort((a, b) => String(a.iso || a.dateStr).localeCompare(String(b.iso || b.dateStr)));
}

function formatPrintDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
