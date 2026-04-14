import { describe, it, expect } from 'vitest';
import { canAccessModuleWithPermissions, MODULE_ACCESS_POLICY } from './moduleAccess.js';

describe('moduleAccess', () => {
  it('audit.view does not grant settings access', () => {
    expect(canAccessModuleWithPermissions(['audit.view'], 'settings')).toBe(false);
  });

  it('settings.view grants settings access', () => {
    expect(canAccessModuleWithPermissions(['settings.view'], 'settings')).toBe(true);
  });

  it('period.manage grants settings access', () => {
    expect(canAccessModuleWithPermissions(['period.manage'], 'settings')).toBe(true);
  });

  it('keeps an explicit policy list for each controlled module', () => {
    expect(Array.isArray(MODULE_ACCESS_POLICY.sales)).toBe(true);
    expect(MODULE_ACCESS_POLICY.finance.length).toBeGreaterThan(0);
  });

  it('finance permissions grant finance module; unknown module keys stay permissive', () => {
    expect(canAccessModuleWithPermissions(['finance.view'], 'finance')).toBe(true);
    expect(canAccessModuleWithPermissions(['finance.view'], 'legacy_hr')).toBe(true);
  });

  it('dashboard.view enables edit approvals visibility', () => {
    expect(canAccessModuleWithPermissions(['dashboard.view'], 'edit_approvals')).toBe(true);
  });
});

