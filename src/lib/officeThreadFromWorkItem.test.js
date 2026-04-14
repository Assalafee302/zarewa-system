import { describe, it, expect } from 'vitest';
import { officeThreadIdFromWorkItem } from './officeThreadFromWorkItem.js';

describe('officeThreadIdFromWorkItem', () => {
  it('prefers linkedThreadId, then office_thread source, routeState, data', () => {
    expect(officeThreadIdFromWorkItem({ linkedThreadId: 'TH-1' })).toBe('TH-1');
    expect(officeThreadIdFromWorkItem({ sourceKind: 'office_thread', sourceId: 'TH-2' })).toBe('TH-2');
    expect(officeThreadIdFromWorkItem({ routeState: { selectedThreadId: 'TH-3' } })).toBe('TH-3');
    expect(officeThreadIdFromWorkItem({ data: { officeThreadId: 'TH-4' } })).toBe('TH-4');
    expect(officeThreadIdFromWorkItem({})).toBe('');
  });
});
