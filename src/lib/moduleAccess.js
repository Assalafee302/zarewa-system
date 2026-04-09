/** Shared module visibility rules (keep in sync with server-side workspace filters). */

export function hasPermissionInList(permissions, permission) {
  if (!Array.isArray(permissions) || !permission) return false;
  return permissions.includes('*') || permissions.includes(permission);
}

export function canAccessModuleWithPermissions(permissions, moduleKey) {
  const has = (p) => hasPermissionInList(permissions, p);
  switch (moduleKey) {
    case 'sales':
      return (
        has('sales.view') ||
        has('sales.manage') ||
        has('quotations.manage') ||
        has('receipts.post')
      );
    case 'procurement':
      return has('procurement.view') || has('purchase_orders.manage');
    case 'operations':
      return has('operations.view') || has('production.manage');
    case 'finance':
      return (
        has('finance.view') ||
        has('finance.post') ||
        has('finance.pay') ||
        has('finance.approve') ||
        has('finance.reverse') ||
        has('treasury.manage')
      );
    case 'reports':
      return has('reports.view');
    case 'edit_approvals':
      // Route is further restricted by role in WorkspaceContext (edit approvers only).
      return has('dashboard.view');
    case 'settings':
      // Settings is an administrative module; audit viewers should not automatically gain access.
      return has('settings.view') || has('period.manage');
    case 'hr':
      // HR is restricted to HR staff (and admins via '*').
      // Non-HR modules (finance/ops/audit/settings) must not grant HR tab access.
      return (
        has('*') ||
        has('hr.self') ||
        has('hr.directory.view') ||
        has('hr.staff.manage') ||
        has('hr.requests.hr_review') ||
        has('hr.requests.gm_approve') ||
        has('hr.requests.final_approve') ||
        has('hr.branch.endorse_staff') ||
        has('hr.payroll.manage') ||
        has('hr.payroll.md_approve') ||
        has('hr.attendance.upload') ||
        has('hr.daily_roll.mark') ||
        has('hr.loan_maintain') ||
        has('hr.letters.generate') ||
        has('hr.compliance')
      );
    default:
      return true;
  }
}
