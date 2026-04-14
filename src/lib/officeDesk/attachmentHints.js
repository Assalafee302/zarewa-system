/**
 * Suggested attachments checklist labels by thread context.
 * @param {{ expenseCategory?: string, kind?: string }} ctx
 * @returns {string[]}
 */
export function attachmentHintsForContext(ctx) {
  const cat = String(ctx?.expenseCategory || '').toLowerCase();
  const kind = String(ctx?.kind || 'memo').toLowerCase();
  const out = [];

  if (kind === 'expense' || cat.includes('cogs') || cat.includes('operational') || cat.includes('logistics')) {
    out.push('Invoice or pro-forma from vendor');
    out.push('Delivery note or proof of service (if applicable)');
  }
  if (cat.includes('maintenance')) {
    out.push('Photo of equipment fault or job card');
    out.push('Service quote or prior repair reference');
  }
  if (cat.includes('staff loan')) {
    out.push('Signed loan schedule acknowledgment');
  }
  if (kind === 'memo' && out.length === 0) {
    out.push('Supporting document (optional for general memos)');
  }
  return out.length ? out : ['Supporting document (optional)'];
}
