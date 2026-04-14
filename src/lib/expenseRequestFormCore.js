/** Shared expense / payment request line-item helpers (Accounts + Office Desk). */

export function createExpenseRequestLineItem() {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    item: '',
    unit: '',
    unitPriceNgn: '',
  };
}

export function expenseRequestLineTotal(row) {
  const u = Number(row.unit);
  const p = Number(row.unitPriceNgn);
  if (!u || Number.isNaN(p)) return 0;
  return Math.round(u * p);
}

export function initialExpenseRequestFormState() {
  return {
    lines: [createExpenseRequestLineItem()],
    requestDate: new Date().toISOString().slice(0, 10),
    requestReference: '',
    expenseCategory: '',
    description: '',
    attachment: null,
  };
}

/**
 * @param {object} requestForm
 * @returns {object} body for POST /api/payment-requests or office convert
 */
export function buildPaymentRequestBodyFromForm(requestForm) {
  const expenseCategory = String(requestForm.expenseCategory || '').trim();
  const lineItems = requestForm.lines
    .map((row) => {
      const item = String(row.item || '').trim();
      const unit = Number.parseFloat(String(row.unit ?? '').replace(/,/g, ''));
      const unitPriceNgn = Number(row.unitPriceNgn);
      return { item, unit, unitPriceNgn };
    })
    .filter((r) => r.item && r.unit > 0 && Number.isFinite(r.unitPriceNgn) && r.unitPriceNgn >= 0);
  const requestDate = requestForm.requestDate || new Date().toISOString().slice(0, 10);
  const description = String(requestForm.description || '').trim() || '—';
  const requestReference = String(requestForm.requestReference || '').trim();
  const body = {
    requestDate,
    description,
    requestReference,
    expenseCategory,
    lineItems,
  };
  if (requestForm.attachment?.dataBase64) {
    body.attachment = {
      name: requestForm.attachment.name,
      mime: requestForm.attachment.mime,
      dataBase64: requestForm.attachment.dataBase64,
    };
  }
  return body;
}
