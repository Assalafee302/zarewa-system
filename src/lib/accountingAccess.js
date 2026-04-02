import { canAccessModuleWithPermissions, hasPermissionInList } from './moduleAccess';

/**
 * HQ Accounting workspace: group policies, fixed assets, costing, and statement preparation.
 * Visible to executive roles and finance leads who run period control (not branch cash ops only).
 */
export function canAccessAccountingHq(permissions, user) {
  if (!canAccessModuleWithPermissions(permissions, 'finance')) return false;
  const roleKey = String(user?.roleKey ?? '').trim().toLowerCase();
  const exec = roleKey === 'admin' || roleKey === 'ceo' || roleKey === 'md';
  const financeLead =
    hasPermissionInList(permissions, 'period.manage') ||
    hasPermissionInList(permissions, 'treasury.manage');
  return exec || financeLead;
}
