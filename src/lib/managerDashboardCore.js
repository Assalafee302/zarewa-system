export function formatRefundReasonCategory(raw) {
  if (raw == null || raw === '') return '—';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) return arr.filter(Boolean).join(', ') || '—';
  } catch {
    /* stored as plain text */
  }
  return String(raw).trim() || '—';
}

export function flattenQuotationLineItems(quotation) {
  const ql = quotation?.quotationLines;
  if (!ql || typeof ql !== 'object') return [];
  const out = [];
  for (const cat of ['products', 'accessories', 'services']) {
    const arr = ql[cat];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const name = item.name || item.label || item.description || 'Line';
      const qty = item.qty ?? item.quantity ?? item.qtyMeters ?? '';
      const unit = item.unit || item.uom || '';
      const unitPrice = item.unitPrice ?? item.unit_price_ngn ?? item.price ?? '';
      const lineTotal = item.lineTotal ?? item.line_total_ngn ?? item.total ?? '';
      const id = item.id != null && String(item.id).trim() ? String(item.id).trim() : '';
      out.push({ category: cat, name, qty, unit, unitPrice, lineTotal, id });
    }
  }
  return out;
}

export function ledgerTypeStyle(type, theme = 'dark') {
  const t = String(type || '').toUpperCase();
  const light = theme === 'light';
  if (t === 'RECEIPT' || t === 'ADVANCE_IN' || t === 'OVERPAY_ADVANCE') {
    return light ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-500/20 text-emerald-200';
  }
  if (t.includes('REVERSAL') || t.includes('REFUND') || t.includes('OUT')) {
    return light ? 'bg-rose-100 text-rose-900' : 'bg-rose-500/20 text-rose-200';
  }
  if (t.includes('APPLIED')) {
    return light ? 'bg-sky-100 text-sky-900' : 'bg-sky-500/20 text-sky-200';
  }
  return light ? 'bg-slate-200 text-slate-800' : 'bg-white/10 text-white/70';
}

export function matchesInboxSearch(query, row, tabKey) {
  const s = String(query || '').trim().toLowerCase();
  if (!s) return true;
  const parts = [];
  if (tabKey === 'clearance' || tabKey === 'flagged') {
    parts.push(row.id, row.customer_name, row.status);
  } else if (tabKey === 'production') {
    parts.push(row.id, row.quotation_ref, row.customer_name);
  } else if (tabKey === 'refunds') {
    parts.push(row.refund_id, row.customer_name, row.quotation_ref, formatRefundReasonCategory(row.reason_category));
  } else if (tabKey === 'payments') {
    parts.push(
      row.request_id,
      row.description,
      row.expense_id,
      row.request_reference,
      row.attachment_name,
      row.expense_category
    );
  } else if (tabKey === 'conversions') {
    parts.push(
      row.job_id,
      row.quotation_ref,
      row.cutting_list_id,
      row.customer_name,
      row.product_name,
      row.conversion_alert_state
    );
  } else if (tabKey === 'edit_approvals') {
    parts.push(row.id, row.entityKind, row.entityId, row.requestedByDisplay, row.requestedByUserId, row.status);
  }
  return parts.some((p) => String(p ?? '').toLowerCase().includes(s));
}

export function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

