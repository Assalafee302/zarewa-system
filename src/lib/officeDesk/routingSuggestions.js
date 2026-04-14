/**
 * Heuristic To/CC suggestions for Office Desk memos (client-side rules).
 * @param {{ subject?: string, body?: string, kind?: string }} input
 * @returns {{ toUserIds: string[], ccUserIds: string[], reasons: string[] }}
 */
export function suggestOfficeRouting(input, directoryUsers = []) {
  const subject = String(input?.subject ?? '');
  const body = String(input?.body ?? '');
  const text = `${subject}\n${body}`.toLowerCase();
  const reasons = [];
  const to = new Set();
  const cc = new Set();

  const byRole = (roleKey) => directoryUsers.filter((u) => String(u.roleKey || '').toLowerCase() === roleKey).map((u) => u.id);
  const first = (ids) => (ids.length ? ids[0] : null);

  if (/(leave|annual\s*leave|sick\s*leave|absence|time\s*off)/i.test(text)) {
    const ids = byRole('hr_manager');
    const id = first(ids);
    if (id) {
      to.add(id);
      reasons.push('leave_hr');
    }
    const bm = byRole('sales_manager');
    if (bm[0]) cc.add(bm[0]);
    if (reasons.length) reasons.push('leave_branch_cc');
  }

  if (/(loan|welfare|salary|bonus|payroll|disciplinary|hr\b)/i.test(text)) {
    const ids = byRole('hr_manager');
    const id = first(ids);
    if (id) {
      to.add(id);
      reasons.push('hr_keywords');
    }
  }

  if (/(generator|machine|maintenance|repair|plant|diesel|phcn|utility)/i.test(text)) {
    const ids = byRole('operations_officer');
    const id = first(ids);
    if (id) {
      to.add(id);
      reasons.push('maintenance_ops');
    }
    const bm = byRole('sales_manager');
    if (bm[0]) cc.add(bm[0]);
  }

  if (/(payment|invoice|vendor|supplier|₦|ngn|amount|expense|purchase)/i.test(text)) {
    const bm = byRole('sales_manager');
    if (bm[0]) {
      to.add(bm[0]);
      reasons.push('money_branch_manager');
    }
    const fin = byRole('finance_manager');
    if (fin[0]) cc.add(fin[0]);
    reasons.push('money_finance_cc');
  }

  if (/(procurement|purchase\s*order|po\b|raw\s*material|coil)/i.test(text)) {
    const po = byRole('procurement_officer');
    if (po[0]) {
      to.add(po[0]);
      reasons.push('procurement');
    }
  }

  return {
    toUserIds: [...to],
    ccUserIds: [...cc].filter((id) => !to.has(id)),
    reasons: [...new Set(reasons)],
  };
}
