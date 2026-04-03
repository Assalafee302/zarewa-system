import { describe, it, expect } from 'vitest';
import { canAccessModuleWithPermissions } from './moduleAccess.js';

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
});

