/**
 * Opens a print-friendly expense / payment request record (filing copy).
 * @param {object} doc
 * @param {(n: number) => string} formatNgn
 */
export function printExpenseRequestRecord(doc, formatNgn) {
  const requestID = String(doc.requestID || doc.request_id || '—');
  const requestDate = String(doc.requestDate || doc.request_date || '—');
  const requestReference = String(doc.requestReference || doc.request_reference || '').trim();
  const description = String(doc.description || '—').trim();
  const expenseID = String(doc.expenseID || doc.expense_id || '—');
  const expenseCategory = String(doc.expenseCategory || doc.expense_category || '').trim();
  const amount = Number(doc.amountRequestedNgn ?? doc.amount_requested_ngn ?? 0) || 0;
  const approvalStatus = String(doc.approvalStatus || doc.approval_status || '').trim();
  const lines = Array.isArray(doc.lineItems) ? doc.lineItems : [];
  const attachmentName = String(doc.attachmentName || doc.attachment_name || '').trim();
  const attachmentPresent = Boolean(doc.attachmentPresent ?? doc.attachment_present);

  const rowsHtml = lines.length
    ? lines
        .map((row) => {
          const item = String(row.item || '—');
          const unit = Number(row.unit) || 0;
          const up = Number(row.unitPriceNgn ?? row.unit_price_ngn) || 0;
          const tot = Number(row.lineTotalNgn ?? row.line_total_ngn) || 0;
          return `<tr><td>${escapeHtml(item)}</td><td class="right">${unit}</td><td class="right">${formatNgn(up)}</td><td class="right">${formatNgn(tot)}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="4" class="muted">No line-item breakdown stored for this request.</td></tr>`;

  const w = window.open('', '_blank');
  if (!w) return false;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Expense request ${escapeHtml(requestID)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;padding:28px;color:#111;max-width:800px;margin:0 auto;}
  h1{font-size:20px;margin:0 0 4px;}
  .sub{color:#444;font-size:12px;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px;}
  th,td{border:1px solid #bbb;padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:#f0f0f0;font-weight:700;}
  .right{text-align:right;font-variant-numeric:tabular-nums;}
  .muted{color:#666;}
  .total{font-weight:800;margin-top:12px;font-size:14px;}
  .desc{white-space:pre-wrap;line-height:1.45;margin:12px 0;font-size:12px;}
  @media print{body{padding:12px;}}
</style></head><body>
  <h1>Expense payment request</h1>
  <p class="sub">Request ID: <strong>${escapeHtml(requestID)}</strong> · Date: <strong>${escapeHtml(requestDate)}</strong>${approvalStatus ? ` · Status: <strong>${escapeHtml(approvalStatus)}</strong>` : ''}</p>
  <p class="sub">Linked expense: <strong>${escapeHtml(expenseID)}</strong>${requestReference ? ` · Reference: <strong>${escapeHtml(requestReference)}</strong>` : ''}${expenseCategory ? ` · Category: <strong>${escapeHtml(expenseCategory)}</strong>` : ''}</p>
  <p class="desc"><strong>Description</strong><br/>${escapeHtml(description)}</p>
  <table>
    <thead><tr><th>Item</th><th class="right">Unit</th><th class="right">Unit price</th><th class="right">Line total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="total">Amount requested: ${formatNgn(amount)}</p>
  <p class="muted" style="font-size:11px;margin-top:20px;">
    ${attachmentPresent ? `Attachment on file: ${escapeHtml(attachmentName || 'invoice / receipt')}` : 'No attachment on file.'}
  </p>
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
