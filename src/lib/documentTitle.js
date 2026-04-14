/** Base product name for browser tab titles (keep in sync with index.html branding). */
export const DOCUMENT_TITLE_BASE = 'Zarewa Industrial System';

/** Map current pathname to a concise document title. Used for tabs, bookmarks, and screen readers. */
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

  if (p === '/deliveries') return `Store & production | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/accounts') return `Finance & accounts | ${DOCUMENT_TITLE_BASE}`;

  if (p === '/reports') return `Reports | ${DOCUMENT_TITLE_BASE}`;
  if (p === '/edit-approvals') return `Edit approvals | ${DOCUMENT_TITLE_BASE}`;
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

  const segments = p.split('/').filter(Boolean);
  if (segments.length > 0) {
    return `Page not found | ${DOCUMENT_TITLE_BASE}`;
  }

  return `${DOCUMENT_TITLE_BASE}`;
}
