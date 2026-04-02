/** Base product name for browser tab titles (keep in sync with index.html branding). */
export const DOCUMENT_TITLE_BASE = 'Zarewa Industrial System';

/**
 * Map current pathname to a concise document title. Used for tabs, bookmarks, and screen readers.
 * More specific patterns must be matched before generic prefixes (e.g. directory-quality before /hr/staff/:id).
 */
export function documentTitleForPath(pathname) {
  const raw = String(pathname || '/').replace(/\/+$/, '') || '/';
  const p = raw;

  if (p === '/') return `Operations dashboard | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/sales') return `Sales | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/customers') return `Customers | ${DOCUMENT_TITLE_BASE}`;
  if (p.startsWith('/customers/')) return `Customer | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/procurement') return `Procurement | ${DOCUMENT_TITLE_BASE}`;
  if (p.startsWith('/procurement/suppliers/')) return `Supplier | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/operations') return `Store & production | ${DOCUMENT_TITLE_BASE}`;
  if (p.startsWith('/operations/coils/')) return `Coil profile | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/deliveries') return `Deliveries | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounts') return `Finance & accounts | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/accounting' || p === '/accounting/overview') return `Accounting – Overview | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounting/assets') return `Accounting – Fixed assets | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounting/costing') return `Accounting – Costing | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounting/ledger') return `Accounting – General ledger | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounting/statements') return `Accounting – Statements | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounting/controls') return `Accounting – Period & controls | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/reports') return `Reports | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/manager') return `Management dashboard | ${DOCUMENT_TITLE_BASE}`;

  if (p.startsWith('/settings')) {
    const sec = p.split('/')[2] || 'profile';
    const labels = {
      profile: 'Profile',
      governance: 'Governance',
      data: 'Master data',
      team: 'Team access',
      guide: 'Workspace guide',
    };
    const label = labels[sec] || 'Settings';
    return `Settings – ${label} | ${DOCUMENT_TITLE_BASE}`;
  }

  if (p === '/hr' || p === '/hr/my-profile') return `HR – My profile | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/staff') return `HR – Staff | ${DOCUMENT_TITLE_BASE}`;
  if (p.startsWith('/hr/staff/directory-quality')) return `HR – Directory data quality | ${DOCUMENT_TITLE_BASE}`;
  if (p.startsWith('/hr/staff/')) return `HR – Staff profile | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/payroll') return `HR – Payroll | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/time') return `HR – Time & attendance | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/talent') return `HR – Requests | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/compliance') return `HR – Compliance | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/salary-welfare') return `HR – Salary & benefits | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/hr/uat-checklist') return `HR – UAT checklist | ${DOCUMENT_TITLE_BASE}`;

  const segments = p.split('/').filter(Boolean);
  if (segments.length > 0) {
    return `Page not found | ${DOCUMENT_TITLE_BASE}`;
  }

  return `${DOCUMENT_TITLE_BASE}`;
}
