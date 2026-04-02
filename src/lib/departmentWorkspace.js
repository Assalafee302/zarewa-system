import { canAccessModuleWithPermissions } from './moduleAccess';

/** Mirror of server `WORKSPACE_DEPARTMENT_IDS` for offline / stale bootstrap. */
export const WORKSPACE_DEPARTMENT_IDS = [
  'general',
  'customer',
  'sales',
  'inventory',
  'production',
  'purchase',
  'finance',
  'reports',
  'it',
];

export const WORKSPACE_DEPARTMENT_LABELS = {
  general: 'General / cross-functional',
  customer: 'Customer relations',
  sales: 'Sales',
  inventory: 'Store & inventory',
  production: 'Production floor',
  purchase: 'Purchase & procurement',
  finance: 'Finance & accounting',
  reports: 'Reports & analytics',
  it: 'IT & platform',
};

export function normalizeWorkspaceDepartmentId(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return WORKSPACE_DEPARTMENT_IDS.includes(s) ? s : 'general';
}

const DEFAULT_HOME_BY_DEPARTMENT = {
  general: '/',
  customer: '/sales',
  sales: '/sales',
  inventory: '/operations',
  production: '/operations',
  purchase: '/procurement',
  finance: '/accounts',
  reports: '/reports',
  it: '/settings',
};

export function defaultHomePathForDepartment(deptId) {
  const id = normalizeWorkspaceDepartmentId(deptId);
  return DEFAULT_HOME_BY_DEPARTMENT[id] || '/';
}

/** Map a route path to a sidebar module key (for guards and shortcuts). */
export function pathToModuleKey(pathname) {
  const p = String(pathname || '').replace(/\/$/, '') || '/';
  if (p === '/') return null;
  if (p === '/manager') return 'sales';
  if (p === '/sales' || p.startsWith('/customers')) return 'sales';
  if (p === '/procurement' || p.startsWith('/procurement/')) return 'procurement';
  if (p === '/operations' || p === '/deliveries') return 'operations';
  if (p === '/accounts') return 'finance';
  if (p === '/accounting' || p.startsWith('/accounting/')) return 'finance';
  if (p === '/reports') return 'reports';
  if (p === '/settings' || p.startsWith('/settings/')) return 'settings';
  if (p === '/hr' || p.startsWith('/hr/') || p === '/hr-next' || p.startsWith('/hr-next/')) return 'hr';
  return null;
}

/**
 * After login, send the user to their department home if their permissions allow it.
 * @param {{ department?: string } | null | undefined} user
 * @param {string[]} permissions
 */
export function resolvePostLoginPath(user, permissions) {
  const target = defaultHomePathForDepartment(user?.department);
  if (target === '/') return '/';
  const mod = pathToModuleKey(target);
  if (mod && !canAccessModuleWithPermissions(permissions, mod)) return '/';
  return target;
}

export function filterWorkspaceLinksByPermissions(links, permissions) {
  if (!Array.isArray(links)) return [];
  return links.filter((link) => {
    const mod = pathToModuleKey(link.to);
    if (!mod) return true;
    return canAccessModuleWithPermissions(permissions, mod);
  });
}

/**
 * Static copy for Settings team guide + dashboard shortcuts (no React icons).
 * @type {Array<{
 *   id: string;
 *   title: string;
 *   primary: string;
 *   bullets: string[];
 *   links: Array<{ to: string; label: string; state?: object }>;
 * }>}
 */
export const WORKSPACE_GUIDE_ENTRIES = [
  {
    id: 'customer',
    title: 'Customer department',
    primary:
      'Owns customer relationships from first contact through post-sale service — accurate profiles and responsive follow-up.',
    bullets: [
      'Profiling: create and maintain customer records, terms, and tiers.',
      'Quotations: pricing and status tracking (tight coupling with Sales workspace).',
      'Interaction: inquiries, complaints, follow-ups (see customer dashboard timeline & notes).',
      'Orders: align approved quotes with fulfillment via inventory and production.',
    ],
    links: [
      { to: '/sales', label: 'Sales' },
      { to: '/sales', label: 'Customers (Sales → Customers tab)', state: { focusSalesTab: 'customers' } },
    ],
  },
  {
    id: 'sales',
    title: 'Sales department',
    primary:
      'Drives revenue — pipeline discipline, order execution, collections, and performance visibility.',
    bullets: [
      'Leads & pipeline: qualify prospects and register them as customers when ready.',
      'Sales orders: quotations, cutting lists, and dispatch handoff.',
      'Payments: receipts posted against quotations; supports partial and full settlement.',
      'Reporting: trends and KPIs via Reports and the main dashboard.',
    ],
    links: [
      { to: '/sales', label: 'Sales' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    id: 'inventory',
    title: 'Production (store)',
    primary:
      'Physical stock — GRN from approved POs, coil traceability, transfers, adjustments, and alerts.',
    bullets: [
      'Reception: Store GRN with coil / weight / location; validates against PO open qty.',
      'Movement: store → production transfers and finished-goods back to sellable stock.',
      'Deliveries: dispatch board under Production → Deliveries tab.',
      'Reporting: low stock strip, live levels in Reports.',
    ],
    links: [
      { to: '/operations', label: 'Production' },
      { to: '/operations', label: 'Deliveries (Production tab)', state: { focusOpsTab: 'deliveries' } },
    ],
  },
  {
    id: 'production',
    title: 'Production department',
    primary:
      'Converts raw materials to finished goods — planning, consumption visibility, quality, and yield.',
    bullets: [
      'Planning: production queue and job IDs linked to material transfers.',
      'Consumption: raw issue from store (WIP tracked on the Production page).',
      'Output: finished goods receipt into FG SKUs for sales.',
      'Efficiency: conversion and scrap narratives on dashboard / future dedicated reports.',
    ],
    links: [{ to: '/operations', label: 'Production' }],
  },
  {
    id: 'purchase',
    title: 'Purchase department',
    primary:
      'Sourcing and supplier performance — PO lifecycle, invoices on file, coordination with store GRN.',
    bullets: [
      'Suppliers: directory and transport agents (Purchases / Transportation tabs).',
      'Purchase orders: multi-line POs, totals, Pending → Approved / Rejected; assign transport (on loading), then post to in transit (optional treasury-linked haulage) before GRN.',
      'Invoices: supplier invoice metadata on PO; quantities finalized at store receipt.',
      'Spend: tie-in to Finance payables for procurement cost views.',
    ],
    links: [
      { to: '/procurement', label: 'Purchase' },
      { to: '/accounts', label: 'Finance (payables)' },
    ],
  },
  {
    id: 'finance',
    title: 'Financial / accounting',
    primary:
      'Liquidity, AR/AP, expenses, approvals, movements, audit and bank reconciliation.',
    bullets: [
      'Receivables: summary from Finance sidebar; detail in Sales receipts / customer dashboards.',
      'Payables: supplier balances and payments from bank/cash.',
      'Expenses & requests: vouchers and approval workflow.',
      'Control: reconciliation lines, audit checklist, reporting exports (stubs).',
    ],
    links: [{ to: '/accounts', label: 'Finance & accounts' }],
  },
  {
    id: 'reports',
    title: 'Reports & analytics',
    primary:
      'Cross-cutting insight — sales, inventory movement log, financial previews, exports.',
    bullets: [
      'Sales and receivables snapshots with date filters (demo scope).',
      'Inventory overview and live movement log from Production / Procurement activity.',
      'Financial packs (P&L, cash flow) when the ledger API is connected.',
      'Production efficiency packs as metrics mature.',
    ],
    links: [{ to: '/reports', label: 'Reports' }],
  },
  {
    id: 'it',
    title: 'IT & support',
    primary:
      'Platform health, user enablement, security, and access governance.',
    bullets: [
      'Maintenance: uptime, releases, and environment hygiene (outside this UI demo).',
      'Training & support: onboarding staff on each module above.',
      'Security: authentication, roles, and audit when backend auth ships.',
      'Demo role below previews future per-module visibility.',
    ],
    links: [{ to: '/settings', label: 'Settings (this page)' }],
  },
];

export function getWorkspaceGuideEntry(departmentId) {
  const id = normalizeWorkspaceDepartmentId(departmentId);
  return WORKSPACE_GUIDE_ENTRIES.find((e) => e.id === id) ?? null;
}
