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
      return (
        has('*') ||
        has('hr.directory.view') ||
        has('hr.staff.manage') ||
        has('hr.requests.hr_review') ||
        has('hr.requests.final_approve') ||
        has('hr.payroll.manage') ||
        has('hr.attendance.upload') ||
        has('hr.compliance') ||
        has('hr.letters.generate') ||
        // Legacy fallbacks (older roles)
        has('settings.view') ||
        has('finance.pay') ||
        has('finance.view') ||
        has('operations.manage') ||
        has('audit.view')
      );
    default:
      return true;
  }
}
