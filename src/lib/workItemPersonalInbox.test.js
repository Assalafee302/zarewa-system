import { describe, it, expect } from 'vitest';
import { workItemIsPersonalForUser, workItemShowsOnWorkspaceUnifiedInbox } from './workItemPersonalInbox.js';

describe('workItemPersonalInbox', () => {
  it('matches sender, assignee, or visibility user_id', () => {
    expect(workItemIsPersonalForUser({ senderUserId: 'u1' }, 'u1')).toBe(true);
    expect(workItemIsPersonalForUser({ responsibleUserId: 'u2' }, 'u2')).toBe(true);
    expect(
      workItemIsPersonalForUser(
        { visibility: [{ visibilityKind: 'user_id', visibilityValue: 'u3' }] },
        'u3'
      )
    ).toBe(true);
    expect(workItemIsPersonalForUser({ senderUserId: 'a' }, 'b')).toBe(false);
    expect(workItemIsPersonalForUser({ visibility: [{ visibilityKind: 'office_key', visibilityValue: 'sales' }] }, 'u1')).toBe(
      false
    );
  });

  it('allows edit_approval for approver roles even when not personal', () => {
    const item = { documentType: 'edit_approval', senderUserId: 'other' };
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(item, {
        userId: 'me',
        roleKey: 'sales_staff',
        permissions: [],
      })
    ).toBe(false);
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(item, {
        userId: 'me',
        roleKey: 'md',
        permissions: [],
      })
    ).toBe(true);
  });

  it('shows manager queue doc types only for management-eligible roles', () => {
    const clearance = { documentType: 'quotation_clearance', senderUserId: '' };
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(clearance, {
        userId: 'x',
        roleKey: 'sales_staff',
        permissions: ['quotations.manage'],
      })
    ).toBe(false);
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(clearance, {
        userId: 'x',
        roleKey: 'sales_manager',
        permissions: [],
      })
    ).toBe(true);
  });

  it('shows payment_request for finance.approve and refund_request for refunds.approve', () => {
    const pay = { documentType: 'payment_request' };
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(pay, {
        userId: 'x',
        roleKey: 'cashier',
        permissions: [],
      })
    ).toBe(false);
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(pay, {
        userId: 'x',
        roleKey: 'finance_manager',
        permissions: ['finance.approve'],
      })
    ).toBe(true);

    const ref = { documentType: 'refund_request' };
    expect(
      workItemShowsOnWorkspaceUnifiedInbox(ref, {
        userId: 'x',
        roleKey: 'sales_manager',
        permissions: ['refunds.approve'],
      })
    ).toBe(true);
  });
});
