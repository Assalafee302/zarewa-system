import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RefundModal from './RefundModal.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';
import { apiFetch } from '../lib/apiBase';

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
  refunds: [],
  productionJobs: [],
};

const pendingApproveRecord = {
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
};

describe('RefundModal', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(apiFetch).mockReset();
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
          record={pendingApproveRecord}
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
          record={pendingApproveRecord}
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

  it('shows approver verification checklist in approve mode', async () => {
    renderWithToast(
      <RefundModal
        {...baseProps}
        mode="approve"
        onClose={vi.fn()}
        onPersist={vi.fn()}
        record={pendingApproveRecord}
      />
    );

    expect(await screen.findByRole('region', { name: /approver verification checklist/i })).toBeInTheDocument();
    expect(screen.getByText(/Before you approve/i)).toBeInTheDocument();
    expect(screen.getByText(/bundled transport\/install may need a manual line split/i)).toBeInTheDocument();
  });

  it('shows preview warnings after quotation and category selection', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('eligible-quotations')) {
        return {
          ok: true,
          data: {
            ok: true,
            quotations: [
              {
                id: 'QT-SEED',
                customer_id: 'C1',
                customer_name: 'Co',
                paid_ngn: 5000,
                total_ngn: 5000,
              },
            ],
          },
        };
      }
      if (u.includes('/api/refunds/preview')) {
        return {
          ok: true,
          data: {
            ok: true,
            preview: {
              customerID: 'C1',
              customerName: 'Co',
              paidOnQuoteNgn: 5000,
              overpayAdvanceNgn: 0,
              quotationCashInNgn: 5000,
              quoteTotalNgn: 5000,
              suggestedLines: [{ label: 'Overpayment hint', amountNgn: 100, category: 'Overpayment' }],
              warnings: ['Test audit flag: verify receipts.'],
              substitutionPerMeterBreakdown: [],
              alreadyRefundedCategories: [],
              blockedRefundCategories: [],
            },
          },
        };
      }
      if (u.includes('intelligence')) {
        return {
          ok: true,
          data: {
            ok: true,
            receipts: [],
            cuttingLists: [],
            summary: { producedMeters: 0, accessoriesSummary: { lines: [] } },
          },
        };
      }
      return { ok: false, data: { ok: false } };
    });

    renderWithToast(<RefundModal {...baseProps} mode="create" />);

    await user.click(screen.getByTitle('How refunds work'));
    expect(await screen.findByText(/Suggested amounts are not final/i)).toBeInTheDocument();

    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'QT-SEED');
    await user.click(screen.getByRole('checkbox', { name: /^Overpayment$/i }));

    expect((await screen.findAllByText(/Test audit flag: verify receipts/i)).length).toBeGreaterThanOrEqual(1);
  });

  it('flags when requested refund amount does not match line total', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('eligible-quotations')) {
        return {
          ok: true,
          data: {
            ok: true,
            quotations: [
              {
                id: 'QT-SEED',
                customer_id: 'C1',
                customer_name: 'Co',
                paid_ngn: 5000,
                total_ngn: 5000,
              },
            ],
          },
        };
      }
      if (u.includes('/api/refunds/preview')) {
        return {
          ok: true,
          data: {
            ok: true,
            preview: {
              customerID: 'C1',
              customerName: 'Co',
              paidOnQuoteNgn: 5000,
              overpayAdvanceNgn: 0,
              quotationCashInNgn: 5000,
              quoteTotalNgn: 5000,
              suggestedLines: [{ label: 'Line A', amountNgn: 100, category: 'Overpayment' }],
              warnings: [],
              substitutionPerMeterBreakdown: [],
              alreadyRefundedCategories: [],
              blockedRefundCategories: [],
            },
          },
        };
      }
      if (u.includes('intelligence')) {
        return {
          ok: true,
          data: { ok: true, receipts: [], cuttingLists: [], summary: { producedMeters: 0, accessoriesSummary: { lines: [] } } },
        };
      }
      return { ok: false, data: { ok: false } };
    });

    renderWithToast(<RefundModal {...baseProps} mode="create" />);

    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'QT-SEED');
    await user.click(screen.getByRole('checkbox', { name: /^Overpayment$/i }));

    await screen.findByDisplayValue('100');

    const requested = screen.getByPlaceholderText('0');
    await user.clear(requested);
    await user.type(requested, '999');

    expect(
      await screen.findByText(/Line items total does not match the requested refund amount/i)
    ).toBeInTheDocument();
  });
});
