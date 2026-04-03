import { describe, expect, it } from 'vitest';
import { DOCUMENT_TITLE_BASE, documentTitleForPath } from './documentTitle.js';

describe('documentTitleForPath', () => {
  it('maps core modules', () => {
    expect(documentTitleForPath('/')).toContain('Operations dashboard');
    expect(documentTitleForPath('/sales')).toContain('Sales');
    expect(documentTitleForPath('/procurement')).toContain('Procurement');
    expect(documentTitleForPath('/operations')).toContain('Store & production');
    expect(documentTitleForPath('/accounts')).toContain('Finance & accounts');
    expect(documentTitleForPath('/reports')).toContain('Reports');
    expect(documentTitleForPath('/manager')).toContain('Management');
  });

  it('strips trailing slashes', () => {
    expect(documentTitleForPath('/sales/')).toBe(documentTitleForPath('/sales'));
  });

  it('orders HR staff routes correctly', () => {
    expect(documentTitleForPath('/hr/staff/directory-quality')).toContain('Directory data quality');
    expect(documentTitleForPath('/hr/staff/USR-1')).toContain('Staff profile');
    expect(documentTitleForPath('/hr/staff')).toContain('Staff');
  });

  it('maps accounting sub-routes', () => {
    expect(documentTitleForPath('/accounting/ledger')).toContain('General ledger');
    expect(documentTitleForPath('/accounting')).toContain('Overview');
  });

  it('maps settings sections', () => {
    expect(documentTitleForPath('/settings/profile')).toContain('Profile');
    expect(documentTitleForPath('/settings/governance')).toContain('Governance');
    expect(documentTitleForPath('/settings/data')).toContain('Master data');
  });

  it('includes base suffix', () => {
    expect(documentTitleForPath('/')).toContain(DOCUMENT_TITLE_BASE);
  });

  it('uses page-not-found title for unknown paths', () => {
    expect(documentTitleForPath('/no-such-route-zarewa')).toMatch(/page not found/i);
  });
});
