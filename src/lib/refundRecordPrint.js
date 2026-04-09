/**
 * Print-friendly refund request / record (filing copy).
 * @param {object} record
 * @param {(n: number) => string} formatNgn
 */
export function printRefundRecord(record, formatNgn) {
  if (!record) return false;
  const refundID = String(record.refundID || record.refund_id || '—');
  const status = String(record.status || '—');
  const customerName = String(record.customerName || record.customer_name || '—');
  const quotationRef = String(record.quotationRef || record.quotation_ref || '—').trim();
  const requestedAt = String(record.requestedAtISO || record.requested_at_iso || '—');
  const requestedBy = String(record.requestedBy || record.requested_by || '').trim();
  let reasonCats = [];
  try {
    const raw = record.reason_category || record.reasonCategory;
    reasonCats = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {
    reasonCats = [];
  }
  const reasonText = String(record.reasonNotes || record.reason || '').trim();
  const amountReq = Number(record.amountNgn ?? record.amount_ngn ?? 0) || 0;
  const approvedAmt = Number(record.approvedAmountNgn ?? record.approved_amount_ngn ?? 0) || 0;
  const approvalDate = String(record.approvalDate || '').trim();
  const approvedBy = String(record.approvedBy || '').trim();
  const managerComments = String(record.managerComments || '').trim();
  const paidAt = String(record.paidAtISO || record.paid_at_iso || '').trim();
  const paidAmt = Number(record.paidAmountNgn ?? 0) || 0;
  const paidBy = String(record.paidBy || '').trim();

  let lines = [];
  try {
    const raw = record.calculationLines || record.calculation_lines_json;
    lines = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {
    lines = [];
  }
  const rowsHtml = lines.length
    ? lines
        .map((l) => {
          const label = String(l.label || '—');
          const cat = String(l.category || '').trim();
          const amt = Number(l.amountNgn ?? l.amount_ngn ?? 0) || 0;
          return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(cat || '—')}</td><td class="right">${formatNgn(amt)}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="3" class="muted">No calculation lines stored.</td></tr>`;

  const payoutRows =
    Array.isArray(record.payoutHistory) && record.payoutHistory.length > 0
      ? record.payoutHistory
          .map(
            (p) =>
              `<tr><td>${escapeHtml(String(p.postedAtISO || '').slice(0, 16))}</td><td>${formatNgn(Number(p.amountNgn || 0))}</td><td>${escapeHtml(String(p.reference || p.accountName || '—'))}</td></tr>`
          )
          .join('')
      : '';

  const w = window.open('', '_blank');
  if (!w) return false;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Refund ${escapeHtml(refundID)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;padding:28px;color:#111;max-width:800px;margin:0 auto;}
  h1{font-size:20px;margin:0 0 4px;}
  .sub{color:#444;font-size:12px;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;}
  th,td{border:1px solid #bbb;padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:#f0f0f0;font-weight:700;}
  .right{text-align:right;font-variant-numeric:tabular-nums;}
  .muted{color:#666;}
  .block{margin:10px 0;font-size:12px;line-height:1.45;}
  @media print{body{padding:12px;}}
</style></head><body>
  <h1>Customer refund record</h1>
  <p class="sub">Refund ID: <strong>${escapeHtml(refundID)}</strong> · Status: <strong>${escapeHtml(status)}</strong></p>
  <p class="sub">Customer: <strong>${escapeHtml(customerName)}</strong> · Quotation: <strong>${escapeHtml(quotationRef)}</strong></p>
  <p class="sub">Requested: <strong>${escapeHtml(requestedAt)}</strong>${requestedBy ? ` · <strong>${escapeHtml(requestedBy)}</strong>` : ''}</p>
  ${reasonCats.length ? `<p class="block"><strong>Reason categories</strong><br/>${escapeHtml(reasonCats.join(', '))}</p>` : ''}
  ${reasonText ? `<p class="block"><strong>Notes</strong><br/>${escapeHtml(reasonText)}</p>` : ''}
  <table>
    <thead><tr><th>Line</th><th>Category</th><th class="right">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="block"><strong>Amount requested</strong> ${formatNgn(amountReq)}</p>
  ${approvedAmt > 0 || approvalDate ? `<p class="block"><strong>Approved</strong> ${formatNgn(approvedAmt)}${approvalDate ? ` · ${escapeHtml(approvalDate)}` : ''}${approvedBy ? ` · ${escapeHtml(approvedBy)}` : ''}</p>` : ''}
  ${managerComments ? `<p class="block"><strong>Manager note</strong><br/>${escapeHtml(managerComments)}</p>` : ''}
  ${paidAt ? `<p class="block"><strong>Paid</strong> ${escapeHtml(paidAt.slice(0, 16))} · ${formatNgn(paidAmt)}${paidBy ? ` · ${escapeHtml(paidBy)}` : ''}</p>` : ''}
  ${
    payoutRows
      ? `<h2 style="font-size:14px;margin-top:20px;">Treasury payouts</h2><table><thead><tr><th>Posted</th><th class="right">Amount</th><th>Reference / account</th></tr></thead><tbody>${payoutRows}</tbody></table>`
      : ''
  }
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
