/**
 * Client-side gates for workspace quick search (offline snapshot path).
 * Keep aligned with server/workspaceAccess.js — PRODUCTS_CATALOG_PERMS & REFUNDS_VISIBLE_PERMS.
 */

/** @param {(k: string) => boolean} hasPermission */
export function canWorkspaceSearchProducts(hasPermission) {
  const p = (x) => hasPermission('*') || hasPermission(x);
  if (p('manager.dashboard')) return true;
  if (p('settings.view') || p('audit.view') || p('period.manage')) return true;
  if (p('sales.view') || p('sales.manage') || p('customers.manage') || p('quotations.manage') || p('receipts.post'))
    return true;
  if (p('procurement.view') || p('procurement.manage') || p('purchase_orders.manage') || p('suppliers.manage'))
    return true;
  if (
    p('operations.view') ||
    p('operations.manage') ||
    p('production.manage') ||
    p('inventory.receive') ||
    p('inventory.adjust') ||
    p('deliveries.manage')
  )
    return true;
  if (p('finance.view') || p('finance.post') || p('finance.pay') || p('finance.approve') || p('finance.reverse') || p('treasury.manage'))
    return true;
  return false;
}

/** @param {(k: string) => boolean} hasPermission */
export function canWorkspaceSearchRefunds(hasPermission) {
  const p = (x) => hasPermission('*') || hasPermission(x);
  return (
    p('refunds.request') ||
    p('refunds.approve') ||
    p('finance.view') ||
    p('finance.post') ||
    p('finance.pay') ||
    p('finance.approve') ||
    p('finance.reverse') ||
    p('treasury.manage') ||
    p('manager.dashboard')
  );
}
