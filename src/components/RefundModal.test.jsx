import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RefundModal from './RefundModal.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

vi.mock('../context/CustomersContext', () => ({
  useCustomers: () => ({
    customers: [{ customerID: 'CUS-001', name: 'Acme Roofing' }],
    deleteCustomer: vi.fn(),
  }),
}));

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    apiOnline: true,
  }),
}));

vi.mock('../lib/apiBase', () => ({
  apiFetch: vi.fn(),
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  quotations: [
    {
      id: 'QT-1',
      customerID: 'CUS-001',
      customer: 'Acme Roofing',
      total: '₦10,000',
      totalNgn: 10_000,
      paidNgn: 0,
      handledBy: 'Sales Manager',
    },
  ],
  receipts: [],
  cuttingLists: [],
  availableStock: [],
};

describe('RefundModal', () => {
  afterEach(() => {
    cleanup();
  });

  it(
    'keeps the modal open when async approval persist fails',
    { timeout: 90_000 },
    async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onPersist = vi.fn().mockResolvedValue({ ok: false });

      renderWithToast(
        <RefundModal
          {...baseProps}
          mode="approve"
          onClose={onClose}
          onPersist={onPersist}
          record={{
            refundID: 'RF-1',
            customerID: 'CUS-001',
            customer: 'Acme Roofing',
            quotationRef: 'QT-1',
            amountNgn: 5_000,
            status: 'Pending',
            reasonCategory: 'Overpayment',
            reason: 'Overpayment - test',
            calculationLines: [{ label: 'Overpayment line', amountNgn: 5_000 }],
            calculationNotes: '',
            requestedBy: 'Sales Officer',
            requestedAtISO: '2026-03-29T10:00:00.000Z',
          }}
          requesterLabel="Sales Officer"
          approverLabel="Sales Manager"
        />
      );

      const comments = await screen.findByPlaceholderText(/Why was this decided/i, {}, { timeout: 10_000 });
      await user.type(comments, 'Approval failed on purpose.');
      await user.click(screen.getByRole('button', { name: /save decision/i }));

      await waitFor(() => expect(onPersist).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    }
  );

  it(
    'closes after successful approval persist',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onPersist = vi.fn().mockResolvedValue({ ok: true });

      renderWithToast(
        <RefundModal
          {...baseProps}
          mode="approve"
          onClose={onClose}
          onPersist={onPersist}
          record={{
            refundID: 'RF-1',
            customerID: 'CUS-001',
            customer: 'Acme Roofing',
            quotationRef: 'QT-1',
            amountNgn: 5_000,
            status: 'Pending',
            reasonCategory: 'Overpayment',
            reason: 'Overpayment - test',
            calculationLines: [{ label: 'Overpayment line', amountNgn: 5_000 }],
            calculationNotes: '',
            requestedBy: 'Sales Officer',
            requestedAtISO: '2026-03-29T10:00:00.000Z',
          }}
          requesterLabel="Sales Officer"
          approverLabel="Sales Manager"
        />
      );

      const comments = await screen.findByPlaceholderText(/Why was this decided/i, {}, { timeout: 10_000 });
      await user.type(comments, 'Approved after review.');
      await user.click(screen.getByRole('button', { name: /save decision/i }));

      await waitFor(() => expect(onPersist).toHaveBeenCalled());
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    }
  );
});
